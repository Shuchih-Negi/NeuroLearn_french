"""
backend/routers/research.py — dataset collection & access endpoints.

Research Mode flow (consent-gated):
    1. Learner opts in → POST /consent {accepted: true}
    2. During play, frontend posts self-report attention labels → /label
       (ground truth for the attention classifier)
    3. Interactions are logged automatically on every /lang/progress/update
    4. Export everything DKT-ready via /export

Storage model: SQLite operational store; optional async Supabase mirror
(see backend/db.py).
"""

import csv
import io
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

import backend.db as db

router = APIRouter(prefix="/api/research", tags=["research"])

VALID_STATES = {"Focused", "Drifting", "Impulsive", "Overwhelmed"}

DKT_COLUMNS = [
    "student_id", "skill_tag", "exercise_type", "correctness",
    "time_taken_s", "hint_used", "attention_score", "error_type",
    "time_since_review_s", "session_position", "total_questions",
]

LABEL_COLUMNS = [
    "student_id", "section_id", "question_number", "reported_state",
    "detected_state", "detected_confidence", "source", "ts",
]


class ConsentRequest(BaseModel):
    student_id: str = "default"
    accepted:   bool


class AttentionLabelRequest(BaseModel):
    student_id:          str = "default"
    section_id:          str = "default_section"
    question_number:     int = Field(1, ge=1)
    reported_state:      str
    detected_state:      str = ""
    detected_confidence: float = Field(0.0, ge=0.0, le=1.0)


@router.post("/consent")
def give_consent(req: ConsentRequest):
    """Record (or withdraw) research participation for a profile."""
    db.upsert_student(req.student_id)
    record = db.set_consent(req.student_id, req.accepted)
    return {
        "status": "ok",
        "student_id": req.student_id,
        "consent": {
            "accepted": bool(record["accepted"]),
            "updated_ts": record["updated_ts"],
        },
    }


@router.get("/status/{student_id}")
def research_status(student_id: str):
    """Everything the frontend needs to drive Research Mode UI."""
    consent = db.get_consent(student_id)
    stats = db.dataset_stats()
    return {
        "student_id": student_id,
        "consent_accepted": bool(consent and consent["accepted"]),
        "interactions_logged": stats["total_interactions"],
        "labels_logged": stats["labels"]["total"],
    }


@router.post("/label")
def submit_attention_label(req: AttentionLabelRequest):
    """
    Store a self-report ground-truth label for the attention classifier.

    Requires prior consent; detected_state snapshot is stored alongside so
    label agreement can be measured without joins.
    """
    consent = db.get_consent(req.student_id)
    if not (consent and consent["accepted"]):
        raise HTTPException(
            403,
            "Research Mode is not enabled for this profile. "
            "Call POST /api/research/consent first.",
        )
    if req.reported_state not in VALID_STATES:
        raise HTTPException(422, f"reported_state must be one of {sorted(VALID_STATES)}")

    label_id = db.log_attention_label(
        student_id=req.student_id,
        section_id=req.section_id,
        question_number=req.question_number,
        reported_state=req.reported_state,
        detected_state=req.detected_state or None,
        detected_confidence=req.detected_confidence,
    )
    return {"status": "ok", "label_id": label_id}


@router.get("/stats")
def stats():
    """Dataset coverage at a glance (for the contribution dashboard)."""
    return db.dataset_stats()


def _rows_to_jsonl(rows) -> str:
    lines = []
    for r in rows:
        record = dict(r)
        payload = record.pop("payload_json", None)
        if payload is not None:
            try:
                record["payload"] = json.loads(payload or "{}")
            except json.JSONDecodeError:
                record["payload"] = {}
        lines.append(json.dumps(record, ensure_ascii=False))
    return "\n".join(lines)


@router.get("/export")
def export(format: str = "jsonl", kind: str = "interactions",
           student_id: str = "", limit: int = 0):
    """
    Export dataset rows.

    kind=interactions → per-answer rows (DKT training schema)
    kind=labels       → self-report attention labels
    format=jsonl      → one JSON object per line
    format=csv        → flat columns
    """
    if kind == "interactions":
        rows = db.fetch_interactions(student_id or None, limit or None)
        columns = ["id", *DKT_COLUMNS, "section_id", "target_language",
                   "attention_state", "xp_earned", "ts"]
        rename = {
            "correct": "correctness",
            "response_time_s": "time_taken_s",
            "attention_confidence": "attention_score",
            "question_number": "session_position",
        }
    elif kind == "labels":
        rows = db.fetch_attention_labels(student_id or None, limit or None)
        columns = ["id", *LABEL_COLUMNS]
        rename = {}
    else:
        raise HTTPException(422, "kind must be 'interactions' or 'labels'")

    if not rows:
        raise HTTPException(404, f"No {kind} recorded yet")

    if format == "csv":
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            writer.writerow({**r, **rename})
        filename = f"neurolearn_{kind}.csv"
        return Response(content=buf.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition":
                                 f"attachment; filename={filename}"})

    if format != "jsonl":
        raise HTTPException(422, "format must be 'jsonl' or 'csv'")

    filename = f"neurolearn_{kind}.jsonl"
    return Response(content=_rows_to_jsonl(rows),
                    media_type="application/x-ndjson",
                    headers={"Content-Disposition":
                             f"attachment; filename={filename}"})
