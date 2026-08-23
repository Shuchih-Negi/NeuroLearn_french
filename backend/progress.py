"""
backend/progress.py — mastery tracking, SM-2 scheduling, ADHD analytics.

Single source of truth for learner progress:
  • EWMA mastery (Corbett & Anderson-inspired) as the always-available base
  • LSTM Deep Knowledge Tracing estimate blended in when a trained
    models/lstm_mastery.pt is present (Piech et al., 2015)
  • SM-2 spaced repetition (Wozniak, 1987) per skill
  • Session/section stats + dashboard analytics

In-memory stores are intentionally fast; every answer is also written to
SQLite (db.log_interaction) so the dataset and dashboards survive restarts.
"""

import time
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional

from backend.config import MASTERY_MODEL_PATH

# ── Stores ────────────────────────────────────────────────────────────────────
mastery_store: Dict[str, Dict] = {}
lang_progress_store: Dict[str, Any] = {}


# ── SM-2 ──────────────────────────────────────────────────────────────────────
def sm2_next_review(current_ef: float, current_interval: int,
                    quality: int) -> tuple[float, int]:
    """SM-2 (Wozniak, 1987). Returns (new_ef, new_interval_days)."""
    if quality < 3:
        new_interval = 1
        new_ef = max(1.3, current_ef - 0.8 + 0.28 * quality - 0.02 * quality ** 2)
    else:
        if current_interval == 0:
            new_interval = 1
        elif current_interval == 1:
            new_interval = 6
        else:
            new_interval = round(current_interval * current_ef)
        new_ef = max(1.3,
                     current_ef + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    return new_ef, new_interval


def quality_from_answer(correct: bool, response_time: float,
                        hint_used: bool = False) -> int:
    """Pimsleur-style quality mapping; hesitation latency lowers the score."""
    if not correct:
        return 1 if response_time > 30 else 0
    if hint_used:
        return 3
    if response_time < 5:
        return 5
    if response_time < 15:
        return 4
    return 3


# ── Optional LSTM knowledge tracer ────────────────────────────────────────────
_lstm_predictor: Optional[object] = None
_lstm_checked = False


def _get_lstm_predictor():
    global _lstm_predictor, _lstm_checked
    if _lstm_checked:
        return _lstm_predictor
    _lstm_checked = True
    try:
        from ml.lstm_mastery import LSTMMasteryPredictor
        predictor = LSTMMasteryPredictor(MASTERY_MODEL_PATH)
        _lstm_predictor = predictor if getattr(predictor, "_loaded", False) else None
    except Exception:  # noqa: BLE001 — torch/model optional at runtime
        _lstm_predictor = None
    return _lstm_predictor


# ── Core update ───────────────────────────────────────────────────────────────
def get_mastery_scores(student_id: str) -> Dict[str, float]:
    skills = mastery_store.get(student_id, {})
    return {tag: round(data.get("mastery", 0.0), 4) for tag, data in skills.items()}


def update_mastery(
    student_id: str,
    skill_tag: str,
    correct: bool,
    response_time: float,
    *,
    hint_used: bool = False,
    attention_score: float = 0.5,
    exercise_type: str = "multiple_choice_vocab",
    error_type: str = "none",
    question_number: int = 1,
    total_questions: int = 10,
) -> Dict:
    """
    Update one skill's mastery. Returns the full skill record including the
    blended mastery score and SM-2 schedule.
    """
    skills = mastery_store.setdefault(student_id, {})
    now = time.time()
    s = skills.setdefault(skill_tag, {
        "mastery": 0.0, "ewma": 0.0, "interactions": 0,
        "ef": 2.5, "interval_days": 0,
        "next_review_ts": now, "correct_streak": 0, "last_ts": None,
    })

    # EWMA base with partial credit for slow-but-correct
    performance = 1.0 if correct else 0.0
    if correct and 5 <= response_time <= 30:
        performance = 0.7 + 0.3 * (30 - min(response_time, 30)) / 25.0
    alpha = 0.3
    ewma = (1 - alpha) * s["ewma"] + alpha * performance

    # LSTM blend (when a trained model exists)
    lstm_estimate = None
    predictor = _get_lstm_predictor()
    if predictor is not None:
        try:
            since_review = (now - s["last_ts"]) if s["last_ts"] else 0.0
            result = predictor.push(student_id, {
                "skill_tag": skill_tag,
                "exercise_type": exercise_type,
                "correctness": float(correct),
                "time_taken_s": response_time,
                "hint_used": hint_used,
                "attention_score": attention_score,
                "error_type": error_type,
                "time_since_review_s": since_review,
                "session_position": question_number,
                "total_questions": total_questions,
            })
            lstm_estimate = float(result["mastery_probability"])
        except Exception:  # noqa: BLE001
            lstm_estimate = None

    mastery = ewma if lstm_estimate is None else round(0.5 * ewma + 0.5 * lstm_estimate, 4)

    q = quality_from_answer(correct, response_time, hint_used)
    ef, interval_days = sm2_next_review(s["ef"], s["interval_days"], q)

    s.update({
        "mastery": round(mastery, 4),
        "ewma": round(ewma, 4),
        "lstm_estimate": lstm_estimate,
        "interactions": s["interactions"] + 1,
        "ef": round(ef, 4),
        "interval_days": interval_days,
        "next_review_ts": now + interval_days * 86400,
        "correct_streak": s["correct_streak"] + 1 if correct else 0,
        "last_ts": now,
    })
    return s


# ── Section/session stats ─────────────────────────────────────────────────────
def register_answer(
    student_id: str, section_id: str, *, skill_tag: str, exercise_type: str,
    correct: bool, response_time: float, attention_state: str,
    xp_earned: int, target_language: str,
) -> Dict:
    store = lang_progress_store.setdefault(student_id, {
        "sections": {}, "total_xp": 0, "history": [],
        "languages": defaultdict(dict),
    })
    sec = store["sections"].setdefault(section_id, {
        "answered": 0, "correct": 0, "attention_states": [],
        "best_streak": 0, "current_streak": 0,
        "exercise_types": Counter(), "skill_tags": Counter(),
    })
    sec["answered"] += 1
    if correct:
        sec["correct"] += 1
        sec["current_streak"] += 1
        sec["best_streak"] = max(sec["best_streak"], sec["current_streak"])
    else:
        sec["current_streak"] = 0
    sec["attention_states"].append(attention_state)
    sec["exercise_types"][exercise_type] += 1
    sec["skill_tags"][skill_tag] += 1
    store["total_xp"] += xp_earned

    store["history"].append({
        "section_id": section_id,
        "skill_tag": skill_tag,
        "exercise_type": exercise_type,
        "correct": correct,
        "rt": response_time,
        "state": attention_state,
        "language": target_language,
        "ts": time.time(),
    })

    return {
        "answered": sec["answered"],
        "correct": sec["correct"],
        "accuracy": round(sec["correct"] / max(1, sec["answered"]) * 100, 1),
        "current_streak": sec["current_streak"],
        "best_streak": sec["best_streak"],
    }


# ── Dashboard ─────────────────────────────────────────────────────────────────
def compute_adhd_insights(history: List[Dict], mastery: Dict[str, float]) -> Dict:
    """Time-on-task degradation analytics (Toplak et al., 2013)."""
    if not history:
        return {"focus_rate": 0, "best_time_of_session": "start",
                "streak_potential": 0}

    states = [h.get("state", "Focused") for h in history]
    focus_rate = round(states.count("Focused") / len(states) * 100, 1)

    mid = len(history) // 2
    first_half_acc = sum(1 for h in history[:mid] if h.get("correct")) / max(1, mid)
    second_half_acc = sum(1 for h in history[mid:] if h.get("correct")) / max(1, len(history) - mid)
    best_half = "start" if first_half_acc >= second_half_acc else "end"
    avg_mastery = sum(mastery.values()) / max(1, len(mastery))
    fatigued = second_half_acc < first_half_acc - 0.15

    return {
        "focus_rate": focus_rate,
        "best_time_of_session": best_half,
        "first_half_accuracy": round(first_half_acc * 100, 1),
        "second_half_accuracy": round(second_half_acc * 100, 1),
        "avg_mastery": round(avg_mastery * 100, 1),
        "fatigue_detected": fatigued,
        "recommendation": (
            "Consider ending the session — attention is drifting."
            if fatigued else "Great sustained focus! Keep going."
        ),
    }
