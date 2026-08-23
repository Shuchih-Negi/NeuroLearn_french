"""
backend/db.py — SQLite persistence layer.

Durable store for the interaction dataset (DKT-ready schema) and student
profiles. Write-through on every /api/lang/progress/update call so training
data survives restarts.

Supabase/Postgres support lands in Phase 2 behind the same function
signatures; SQLite (stdlib, zero-config) is the default driver.
"""

import json
import os
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional

from backend.config import DB_PATH

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

CREATE INDEX IF NOT EXISTS ix_interactions_student ON interactions(student_id);
CREATE INDEX IF NOT EXISTS ix_interactions_skill   ON interactions(student_id, skill_tag);
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


def upsert_student(student_id: str, display_name: str = "") -> None:
    with _lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO students (id, display_name, created_ts) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO NOTHING",
            (student_id, display_name or student_id, time.time()),
        )
        conn.commit()


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
        return int(cur.lastrowid or 0)


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
    return {
        "total_interactions": total,
        "distinct_students": students,
        "per_skill": per_skill,
        "per_exercise_type": per_type,
        "per_attention_state": per_state,
        "overall_accuracy": round(accuracy_row["a"], 4) if accuracy_row["a"] is not None else None,
    }
