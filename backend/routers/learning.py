"""
backend/routers/learning.py — answer validation, progress/mastery tracking,
and the learning dashboard.
"""

import time
from collections import Counter

from fastapi import APIRouter

import backend.db as db
from backend.progress import (
    compute_adhd_insights,
    get_mastery_scores,
    lang_progress_store,
    mastery_store,
    register_answer,
    update_mastery,
)
from backend.schemas import LangProgressUpdate, LangValidateRequest
from ml.nlp_model import NLPModel

router = APIRouter(prefix="/api/lang", tags=["learning"])

_nlp_model = NLPModel()


@router.post("/validate")
def validate_answer(req: LangValidateRequest):
    """Multi-tier NLP validation: exact → variant → accent → edit → semantic."""
    return _nlp_model.validate_answer(
        learner_answer=req.learner_answer,
        correct_answer=req.correct_answer,
        acceptable_answers=req.acceptable_answers,
        target_language=req.target_language,
    )


@router.post("/progress/update")
def progress_update(req: LangProgressUpdate):
    """
    One call does three things:
      1. Session/section stats (streaks, XP)
      2. Mastery update: EWMA base, LSTM-blended when a trained model exists,
         plus SM-2 spaced-repetition schedule per skill
      3. Durable dataset write (interactions table) for DKT training
    """
    db.upsert_student(req.student_id)

    section_view = register_answer(
        req.student_id, req.section_id,
        skill_tag=req.skill_tag,
        exercise_type=req.exercise_type,
        correct=req.correct,
        response_time=req.response_time,
        attention_state=req.attention_state,
        xp_earned=req.xp_earned,
        target_language=req.target_language,
    )

    skill_data = update_mastery(
        req.student_id, req.skill_tag, req.correct, req.response_time,
        hint_used=req.hint_used,
        attention_score=req.attention_confidence,
        exercise_type=req.exercise_type,
        error_type=req.error_type,
        question_number=req.question_number,
        total_questions=req.total_questions,
    )

    db.log_interaction(
        student_id=req.student_id,
        section_id=req.section_id,
        target_language=req.target_language,
        skill_tag=req.skill_tag,
        exercise_type=req.exercise_type,
        correct=req.correct,
        response_time_s=req.response_time,
        hint_used=req.hint_used,
        attention_state=req.attention_state,
        attention_confidence=req.attention_confidence,
        error_type=req.error_type,
        xp_earned=req.xp_earned,
        question_number=req.question_number,
        total_questions=req.total_questions,
        learner_answer=req.learner_answer,
        expected_answer=req.expected_answer or "",
        question_text="",
        extra={"skill_mastery": skill_data["mastery"],
               "interval_days": skill_data["interval_days"]},
    )

    return {
        "status": "ok",
        "section": section_view,
        "total_xp": lang_progress_store.get(req.student_id, {}).get("total_xp", 0),
        "skill_mastery": skill_data["mastery"],
        "next_review_in_days": skill_data["interval_days"],
        "mastery_scores": get_mastery_scores(req.student_id),
    }


@router.get("/mastery/{student_id}")
def get_mastery(student_id: str):
    skills = mastery_store.get(student_id, {})
    now = time.time()
    due_for_review = [tag for tag, data in skills.items()
                      if data.get("next_review_ts", 0) <= now]
    return {
        "student_id": student_id,
        "skills": skills,
        "due_for_review": due_for_review,
        "total_interactions": sum(s.get("interactions", 0) for s in skills.values()),
        "mastery_vector": get_mastery_scores(student_id),
    }


@router.get("/dashboard/{student_id}")
def dashboard(student_id: str):
    store = lang_progress_store.get(student_id, {
        "sections": {}, "total_xp": 0, "history": []
    })

    sections_summary = []
    for sec_id, sec in store["sections"].items():
        acc = (sec["correct"] / max(1, sec["answered"])) * 100
        state_counts = Counter(sec.get("attention_states", []))
        dominant = state_counts.most_common(1)[0][0] if state_counts else "N/A"
        sections_summary.append({
            "section_id": sec_id,
            "answered": sec["answered"],
            "correct": sec["correct"],
            "accuracy": round(acc, 1),
            "best_streak": sec["best_streak"],
            "dominant_state": dominant,
            "state_counts": dict(state_counts),
            "exercise_types": dict(sec.get("exercise_types", {})),
        })

    ta = sum(s["answered"] for s in store["sections"].values())
    tc = sum(s["correct"] for s in store["sections"].values())
    mastery_scores = get_mastery_scores(student_id)

    recent_hist = store["history"][-50:]
    attention_trend = Counter(h["state"] for h in recent_hist)

    total_xp = store.get("total_xp", 0)
    level = max(1, total_xp // 150 + 1)

    return {
        "student_id": student_id,
        "total_xp": total_xp,
        "level": level,
        "xp_to_next_level": level * 150 - total_xp,
        "total_answered": ta,
        "total_correct": tc,
        "overall_accuracy": round((tc / max(1, ta)) * 100, 1),
        "sections": sections_summary,
        "mastery_scores": mastery_scores,
        "attention_distribution": dict(attention_trend),
        "skills_due_for_review": [
            tag for tag, data in mastery_store.get(student_id, {}).items()
            if data.get("next_review_ts", 0) <= time.time()
        ],
        "recent_history": recent_hist[-20:],
        "adhd_insights": compute_adhd_insights(recent_hist, mastery_scores),
    }
