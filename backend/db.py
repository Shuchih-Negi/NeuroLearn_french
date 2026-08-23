"""
backend/db.py — SQLite persistence layer (+ optional Supabase mirror).

Durable store for the interaction dataset (DKT-ready schema), student
profiles, research consent, and self-report attention labels.

Storage model
─────────────
• SQLite is the operational store: all reads/writes/aggregations are local,
  fast, and fully testable offline.
• When SUPABASE_URL/SUPABASE_SERVICE_KEY are configured, writes are mirrored
  asynchronously (best-effort) to Supabase for durability and sharing.
  Mirror failures are logged and never affect request outcomes.
• Schema parity with the mirror lives in backend/data/supabase_schema.sql.
"""

import json
import logging
import os
import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from backend.config import (
    DB_PATH,
    SUPABASE_SERVICE_KEY,
    SUPABASE_SYNC_ENABLED,
    SUPABASE_URL,
)

logger = logging.getLogger("neurolearn.db")

_lock = threading.Lock()
_conn: Optional[sqlite3.Connection] = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS students (
    id           TEXT PRIMARY KEY,
    display_name TEXT,
    created_ts   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS interactions (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id           TEXT NOT NULL,
    section_id           TEXT,
    target_language      TEXT DEFAULT 'fr',
    skill_tag            TEXT,
    exercise_type        TEXT,
    correct              INTEGER,
    response_time_s      REAL DEFAULT 0,
    hint_used            INTEGER DEFAULT 0,
    attention_state      TEXT DEFAULT 'Focused',
    attention_confidence REAL DEFAULT 0.5,
    error_type           TEXT DEFAULT 'none',
    xp_earned            INTEGER DEFAULT 0,
    question_number      INTEGER DEFAULT 1,
    total_questions      INTEGER DEFAULT 10,
    learner_answer       TEXT DEFAULT '',
    expected_answer      TEXT DEFAULT '',
    question_text        TEXT DEFAULT '',
    payload_json         TEXT DEFAULT '{}',
    ts                   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS research_consent (
    student_id TEXT PRIMARY KEY,
    accepted   INTEGER NOT NULL,
    updated_ts REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS attention_labels (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id           TEXT NOT NULL,
    section_id           TEXT,
    question_number      INTEGER,
    reported_state       TEXT NOT NULL,
    detected_state       TEXT,
    detected_confidence  REAL,
    source               TEXT DEFAULT 'self_report',
    ts                   REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_interactions_student ON interactions(student_id);
CREATE INDEX IF NOT EXISTS ix_interactions_skill   ON interactions(student_id, skill_tag);
CREATE INDEX IF NOT EXISTS ix_labels_student       ON attention_labels(student_id);
"""


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        _conn = conn
    return _conn


def init_db() -> None:
    with _lock:
        _get_conn()


# ── Supabase async mirror (best-effort, never blocks or fails requests) ───────
_mirror_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="supabase-mirror")
_sb_client: Optional[object] = None
_sb_warned = False


def _get_supabase():
    global _sb_client, _sb_warned
    if not (SUPABASE_URL and SUPABASE_SERVICE_KEY and SUPABASE_SYNC_ENABLED):
        return None
    if _sb_client is None:
        try:
            from supabase import create_client
            _sb_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            logger.info("Supabase mirror enabled for %s", SUPABASE_URL)
        except Exception as exc:  # noqa: BLE001 — optional dependency
            if not _sb_warned:
                logger.warning("Supabase mirror unavailable (%s); continuing SQLite-only", exc)
                _sb_warned = True
    return _sb_client


def _mirror(table: str, row: Dict[str, Any]) -> None:
    sb = _get_supabase()
    if sb is None:
        return

    def job():
        try:
            sb.table(table).insert(row).execute()
        except Exception as exc:  # noqa: BLE001 — mirror must never crash callers
            logger.debug("Supabase mirror insert failed on %s: %s", table, exc)

    _mirror_pool.submit(job)


def upsert_student(student_id: str, display_name: str = "") -> None:
    with _lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO students (id, display_name, created_ts) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO NOTHING",
            (student_id, display_name or student_id, time.time()),
        )
        conn.commit()
    _mirror("students", {
        "id": student_id,
        "display_name": display_name or student_id,
        "created_ts": time.time(),
    })


# ── Research consent ──────────────────────────────────────────────────────────
def set_consent(student_id: str, accepted: bool) -> Dict:
    record = {"accepted": bool(accepted), "updated_ts": time.time()}
    with _lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO research_consent (student_id, accepted, updated_ts) "
            "VALUES (?, ?, ?) "
            "ON CONFLICT(student_id) DO UPDATE SET accepted=excluded.accepted, "
            "updated_ts=excluded.updated_ts",
            (student_id, int(bool(accepted)), record["updated_ts"]),
        )
        conn.commit()
    _mirror("research_consent", {"student_id": student_id, **record})
    return record


def get_consent(student_id: str) -> Optional[Dict]:
    with _lock:
        row = _get_conn().execute(
            "SELECT student_id, accepted, updated_ts FROM research_consent "
            "WHERE student_id = ?",
            (student_id,),
        ).fetchone()
    return dict(row) if row else None


def consented_students() -> int:
    with _lock:
        row = _get_conn().execute(
            "SELECT COUNT(DISTINCT student_id) c FROM research_consent "
            "WHERE accepted = 1").fetchone()
    return row["c"]


# ── Self-report attention labels ──────────────────────────────────────────────
def log_attention_label(
    *, student_id: str, section_id: str, question_number: int,
    reported_state: str, detected_state: Optional[str],
    detected_confidence: float, source: str = "self_report",
) -> int:
    ts = time.time()
    with _lock:
        conn = _get_conn()
        cur = conn.execute(
            """INSERT INTO attention_labels
               (student_id, section_id, question_number, reported_state,
                detected_state, detected_confidence, source, ts)
               VALUES (?,?,?,?,?,?,?,?)""",
            (student_id, section_id, question_number, reported_state,
             detected_state, float(detected_confidence), source, ts),
        )
        conn.commit()
        label_id = int(cur.lastrowid or 0)

    _mirror("attention_labels", {
        "id": label_id,
        "student_id": student_id,
        "section_id": section_id,
        "question_number": question_number,
        "reported_state": reported_state,
        "detected_state": detected_state,
        "detected_confidence": float(detected_confidence),
        "source": source,
        "ts": ts,
    })
    return label_id


def fetch_attention_labels(student_id: Optional[str] = None,
                           limit: Optional[int] = None) -> List[Dict]:
    query = "SELECT * FROM attention_labels"
    params: List[Any] = []
    if student_id:
        query += " WHERE student_id = ?"
        params.append(student_id)
    query += " ORDER BY id"
    if limit:
        query += " LIMIT ?"
        params.append(limit)
    with _lock:
        rows = _get_conn().execute(query, params).fetchall()
    return [dict(r) for r in rows]


def log_interaction(
    *, student_id: str, section_id: str, target_language: str,
    skill_tag: str, exercise_type: str, correct: bool,
    response_time_s: float, hint_used: bool,
    attention_state: str, attention_confidence: float,
    error_type: str, xp_earned: int,
    question_number: int, total_questions: int,
    learner_answer: str, expected_answer: str, question_text: str,
    extra: Optional[Dict[str, Any]] = None,
) -> int:
    row = (
        student_id, section_id, target_language, skill_tag, exercise_type,
        int(bool(correct)), float(response_time_s), int(bool(hint_used)),
        attention_state, float(attention_confidence), error_type, xp_earned,
        question_number, total_questions,
        learner_answer[:500], expected_answer[:500], question_text[:1000],
        json.dumps(extra or {}, ensure_ascii=False), time.time(),
    )
    with _lock:
        conn = _get_conn()
        cur = conn.execute(
            """INSERT INTO interactions
               (student_id, section_id, target_language, skill_tag, exercise_type,
                correct, response_time_s, hint_used, attention_state,
                attention_confidence, error_type, xp_earned,
                question_number, total_questions,
                learner_answer, expected_answer, question_text,
                payload_json, ts)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            row,
        )
        conn.commit()
        interaction_id = int(cur.lastrowid or 0)

    _mirror("interactions", {
        "id": interaction_id,
        "student_id": student_id,
        "section_id": section_id,
        "target_language": target_language,
        "skill_tag": skill_tag,
        "exercise_type": exercise_type,
        "correct": bool(correct),
        "response_time_s": float(response_time_s),
        "hint_used": bool(hint_used),
        "attention_state": attention_state,
        "attention_confidence": float(attention_confidence),
        "error_type": error_type,
        "xp_earned": xp_earned,
        "question_number": question_number,
        "total_questions": total_questions,
        "learner_answer": learner_answer[:500],
        "expected_answer": expected_answer[:500],
        "question_text": question_text[:1000],
        "payload_json": json.dumps(extra or {}, ensure_ascii=False),
        "ts": row[-1],
    })
    return interaction_id


def fetch_interactions(student_id: Optional[str] = None,
                       limit: Optional[int] = None) -> List[Dict]:
    query = "SELECT * FROM interactions"
    params: List[Any] = []
    if student_id:
        query += " WHERE student_id = ?"
        params.append(student_id)
    query += " ORDER BY id"
    if limit:
        query += " LIMIT ?"
        params.append(limit)
    with _lock:
        rows = _get_conn().execute(query, params).fetchall()
    return [dict(r) for r in rows]


def dataset_stats() -> Dict:
    with _lock:
        conn = _get_conn()
        total = conn.execute("SELECT COUNT(*) c FROM interactions").fetchone()["c"]
        students = conn.execute(
            "SELECT COUNT(DISTINCT student_id) c FROM interactions"
        ).fetchone()["c"]
        per_skill = {
            r["skill_tag"]: r["c"]
            for r in conn.execute(
                "SELECT skill_tag, COUNT(*) c FROM interactions "
                "GROUP BY skill_tag ORDER BY c DESC")
        }
        per_type = {
            r["exercise_type"]: r["c"]
            for r in conn.execute(
                "SELECT exercise_type, COUNT(*) c FROM interactions "
                "GROUP BY exercise_type")
        }
        per_state = {
            r["attention_state"]: r["c"]
            for r in conn.execute(
                "SELECT attention_state, COUNT(*) c FROM interactions "
                "GROUP BY attention_state")
        }
        accuracy_row = conn.execute(
            "SELECT AVG(correct) a FROM interactions").fetchone()

        label_total = conn.execute(
            "SELECT COUNT(*) c FROM attention_labels").fetchone()["c"]
        per_reported = {
            r["reported_state"]: r["c"]
            for r in conn.execute(
                "SELECT reported_state, COUNT(*) c FROM attention_labels "
                "GROUP BY reported_state")
        }
        agreement_row = conn.execute(
            "SELECT AVG(CASE WHEN reported_state = detected_state THEN 1.0 "
            "ELSE 0.0 END) a FROM attention_labels "
            "WHERE detected_state IS NOT NULL").fetchone()
    return {
        "total_interactions": total,
        "distinct_students": students,
        "per_skill": per_skill,
        "per_exercise_type": per_type,
        "per_attention_state": per_state,
        "overall_accuracy": round(accuracy_row["a"], 4) if accuracy_row["a"] is not None else None,
        "consented_students": consented_students(),
        "labels": {
            "total": label_total,
            "per_reported_state": per_reported,
            "detected_agreement_rate": (
                round(agreement_row["a"], 4)
                if agreement_row["a"] is not None else None
            ),
        },
    }
