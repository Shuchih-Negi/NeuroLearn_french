"""
backend/routers/research.py — dataset access endpoints.

Phase 2 will add consent-gated collection mode and self-report labels.
These endpoints already expose the interaction data in DKT-ready form
(the exact schema ml_training/train_lstm.py consumes).
"""

import csv
import io
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

import backend.db as db

router = APIRouter(prefix="/api/research", tags=["research"])

DKT_COLUMNS = [
    "student_id", "skill_tag", "exercise_type", "correctness",
    "time_taken_s", "hint_used", "attention_score", "error_type",
    "time_since_review_s", "session_position", "total_questions",
]


@router.get("/stats")
def stats():
    """Dataset coverage at a glance (for the contribution dashboard)."""
    return db.dataset_stats()


@router.get("/export")
def export(format: str = "jsonl", student_id: str = "", limit: int = 0):
    """
    Export interactions for training.

    format=jsonl → one JSON object per line (payload_json merged in)
    format=csv   → flat DKT-ready columns
    """
    rows = db.fetch_interactions(student_id or None, limit or None)
    if not rows:
        raise HTTPException(404, "No interactions recorded yet")

    if format == "csv":
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=[
            "id", *DKT_COLUMNS, "section_id", "target_language",
            "attention_state", "xp_earned", "ts",
        ], extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            writer.writerow({
                **r,
                "correctness": r["correct"],
                "time_taken_s": r["response_time_s"],
                "hint_used": r["hint_used"],
                "attention_score": r["attention_confidence"],
                "session_position": r["question_number"],
                "total_questions": r["total_questions"],
                "time_since_review_s": (r.get("extra") or {}).get("since_review_s", ""),
            })
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition":
                     f"attachment; filename=neurolearn_interactions.csv"},
        )

    lines = []
    for r in rows:
        record = dict(r)
        try:
            record["payload"] = json.loads(r.get("payload_json") or "{}")
        except json.JSONDecodeError:
            record["payload"] = {}
        record.pop("payload_json", None)
        lines.append(json.dumps(record, ensure_ascii=False))
    return Response(
        content="\n".join(lines),
        media_type="application/x-ndjson",
        headers={"Content-Disposition":
                 f"attachment; filename=neurolearn_interactions.jsonl"},
    )
