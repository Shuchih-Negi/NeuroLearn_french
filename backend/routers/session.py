"""
backend/routers/session.py — the adaptive question loop.

Latency strategy per request:
  1. Cache hit            → <100 ms, no AI call
  2. Quality path (5-agent Moderator) when Focused & confident
  3. Fast path (1 fused Gemini call) otherwise
  4. Curriculum fallback bank → guaranteed 200 even with no API key

After serving, a background thread prefetches the next exercise for the
same context so consecutive answers often hit the cache.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Optional

from fastapi import APIRouter

import backend.curriculum as curriculum
import backend.gemini_client as gemini_client
from agents.moderator import EXERCISE_TYPES, SKILL_TAGS, Moderator, SessionContext
from backend.config import API_KEY, FASTPATH_CONF_THRESHOLD, PREFETCH_ENABLED
from backend.exercise_cache import exercise_cache, make_key
from backend.progress import get_mastery_scores
from backend.schemas import LangNextQuestionRequest

logger = logging.getLogger("neurolearn.session")

router = APIRouter(prefix="/api/lang", tags=["session"])

_moderator: Optional[Moderator] = None
_prefetch_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="prefetch")


def get_moderator() -> Moderator:
    global _moderator
    if _moderator is None:
        _moderator = Moderator(api_key=API_KEY, verbose=False)
    return _moderator


# ── Payload assembly ──────────────────────────────────────────────────────────
_PACKET_FIELDS = [
    "question", "options", "correct_index", "explanation", "difficulty",
    "hints", "state_used", "reasoning", "skill_tag", "exercise_type",
    "grammar_explanation", "visual_breakdown", "dopamine_reward",
    "acceptable_answers", "native_word", "target_translation",
    "mastery_hint",
]


def _packet_to_payload(pkt) -> Dict:
    return {
        "question":            pkt.question,
        "options":             pkt.options,
        "correct_index":       pkt.correct_index,
        "explanation":         pkt.explanation,
        "difficulty":          pkt.difficulty,
        "hints":               pkt.hints,
        "state_used":          pkt.state_used,
        "reasoning":           pkt.reasoning or "",
        "skill_tag":           pkt.skill_tag,
        "exercise_type":       pkt.exercise_type,
        "grammar_explanation": pkt.grammar_explanation,
        "visual_breakdown":    pkt.visual_breakdown,
        "dopamine_reward":     pkt.dopamine_reward,
        "acceptable_answers":  pkt.acceptable_answers,
        "native_word":         pkt.native_word,
        "target_translation":  pkt.target_translation,
        "mastery_hint":        pkt.mastery_hint,
    }


# ── Quality path: full 5-agent Moderator pipeline ─────────────────────────────
def _run_pipeline(body: LangNextQuestionRequest,
                  mastery_scores: Dict[str, float]) -> Dict:
    eye_dict = None
    if body.eye_metrics:
        eye_dict = {k: v for k, v in body.eye_metrics.model_dump().items()
                    if v is not None} or None

    ctx = SessionContext(
        character=body.character,
        topic=body.topic,
        target_language=body.target_language,
        difficulty=body.difficulty,
        attention_state=body.attention_state,
        question_number=body.question_number,
        total_questions=body.total_questions,
        previous_questions=body.previous_questions[-5:],
        session_accuracy=body.session_accuracy,
        last_rt=body.last_rt,
        attention_confidence=body.attention_confidence,
        eye_metrics=eye_dict,
        recent_states=body.recent_states[-5:],
        last_correct=body.last_correct,
        skill_focus=body.skill_focus,
        mastery_scores=mastery_scores,
        exercise_type=body.exercise_type,
        learner_age=body.learner_age,
        session_fatigue=body.session_fatigue,
        quest_step=body.quest_step,
    )
    return _packet_to_payload(get_moderator().run(ctx))


# ── Fast path: one fused Gemini call ─────────────────────────────────────────
_FAST_PROMPT_TEMPLATE = """You are an expert French tutor generating ONE adaptive multiple-choice exercise for a learner with ADHD.

CHARACTER: {character}   |   LEARNER AGE: {learner_age}
TOPIC: {topic}   |   SKILL: {skill_focus}   |   TYPE: {exercise_type}
DIFFICULTY: {difficulty}/5   |   ATTENTION STATE: {attention_state} ({confidence:.0%} confidence)
{quest_block}{mastery_block}
ADHD RULES:
- Question (scene + stem) under 40 words total. Overwhelmed → under 12 words.
- Exactly 4 options formatted "A) …" "B) …" "C) …" "D) …", plausible French distractors.
- correct_index (0=A..3=D) MUST point at the correct option.
- Explanation: warm recast, never the word "wrong". ≤25 words.
- Two graduated hints that NEVER reveal the answer, ≤20 words each.
- grammar_explanation ≤30 words. visual_breakdown uses emoji patterns.
- dopamine_reward ≤8 words with emoji. acceptable_answers includes the answer plus ≥1 variant.

Return ONLY a JSON object with keys:
question, options, correct_index, explanation, difficulty, hints, state_used,
skill_tag, exercise_type, grammar_explanation, visual_breakdown,
dopamine_reward, acceptable_answers, native_word, target_translation, mastery_hint"""

_STATE_GUIDANCE = {
    "Focused":     "multi-step production-oriented exercise",
    "Drifting":    "one vivid surprising hook to grab attention now",
    "Impulsive":   "include one deliberate trap option (common mistake)",
    "Overwhelmed": "single-step tiny exercise, calming tone",
}


def _run_fastpath(body: LangNextQuestionRequest,
                  mastery_scores: Dict[str, float]) -> Dict:
    quest_block = ""
    if body.quest_step:
        qs = body.quest_step
        quest_block = (
            f"QUEST CONTEXT (frame the scene): step {qs.get('step_number', '?')} "
            f"at {qs.get('location', 'a checkpoint')} — {qs.get('scene', '')} "
            f"Language task: {qs.get('task_hint', 'communicate in French')}\n"
        )
    mastery_block = ""
    if mastery_scores:
        top = sorted(mastery_scores.items(), key=lambda kv: -kv[1])[:6]
        mastery_block = ("MASTERY (0-1): "
                         + ", ".join(f"{k}={v:.2f}" for k, v in top) + "\n")

    data = gemini_client.generate_json(
        _FAST_PROMPT_TEMPLATE.format(
            character=body.character,
            learner_age=body.learner_age,
            topic=body.topic,
            skill_focus=body.skill_focus,
            exercise_type=body.exercise_type or "multiple_choice_vocab",
            difficulty=body.difficulty,
            attention_state=body.attention_state,
            confidence=body.attention_confidence,
            quest_block=quest_block,
            mastery_block=mastery_block,
        ) + f"\nSTATE GUIDANCE: {_STATE_GUIDANCE.get(body.attention_state, 'standard')}\n"
           f"VALID SKILL TAGS: {', '.join(SKILL_TAGS.keys())}\n"
           f"VALID EXERCISE TYPES: {', '.join(EXERCISE_TYPES)}",
        temperature=0.75,
        kind="question_fast",
    )

    # ── Coerce / repair model output into our payload shape ──
    options = [str(o) for o in (data.get("options") or [])][:4]
    while len(options) < 4:
        options.append(f"{chr(65 + len(options))}) ?")
    options = [o if o[:2] in ("A)", "B)", "C)", "D)") else
               f"{chr(65 + i)}) {o}" for i, o in enumerate(options)]

    idx = data.get("correct_index")
    if not isinstance(idx, int) or not 0 <= idx <= 3:
        target = str(data.get("target_translation", ""))
        idx = next((i for i, o in enumerate(options) if o[3:].strip() == target), 0)

    return {
        "question":            str(data.get("question") or "Question indisponible."),
        "options":             options,
        "correct_index":       idx,
        "explanation":         str(data.get("explanation") or ""),
        "difficulty":          max(1, min(5, int(data.get("difficulty") or body.difficulty))),
        "hints":               [str(h) for h in (data.get("hints") or [])][:2],
        "state_used":          body.attention_state,
        "reasoning":           "Fast path (fused single-call generation)",
        "skill_tag":           data.get("skill_tag") or body.skill_focus,
        "exercise_type":       data.get("exercise_type") or body.exercise_type or "multiple_choice_vocab",
        "grammar_explanation": str(data.get("grammar_explanation") or ""),
        "visual_breakdown":    str(data.get("visual_breakdown") or ""),
        "dopamine_reward":     str(data.get("dopamine_reward") or "🌟 Bien joué !"),
        "acceptable_answers":  [str(a) for a in (data.get("acceptable_answers") or [])],
        "native_word":         str(data.get("native_word") or ""),
        "target_translation":  str(data.get("target_translation") or ""),
        "mastery_hint":        str(data.get("mastery_hint") or ""),
    }


# ── Fallback path: offline curriculum bank ────────────────────────────────────
def _run_fallback(body: LangNextQuestionRequest) -> Dict:
    return curriculum.build_fallback_packet(
        character=body.character,
        topic_hint=body.topic,
        difficulty=body.difficulty,
        attention_state=body.attention_state,
        skill_focus=body.skill_focus,
        exercise_type=body.exercise_type or "multiple_choice_vocab",
        previous_questions=body.previous_questions,
    )


# ── Prefetch ──────────────────────────────────────────────────────────────────
def _schedule_prefetch(key: str, body: LangNextQuestionRequest,
                       mastery_scores: Dict[str, float]) -> None:
    if not PREFETCH_ENABLED or not API_KEY:
        return
    if not exercise_cache.try_begin_prefetch(key):
        return

    def job():
        try:
            payload = _run_fastpath(body, mastery_scores)
            exercise_cache.put(key, payload)
        except Exception as exc:  # noqa: BLE001 — prefetch must never crash
            logger.debug("prefetch failed for %s: %s", key, exc)
        finally:
            exercise_cache.end_prefetch(key)

    _prefetch_pool.submit(job)


# ── Endpoint ──────────────────────────────────────────────────────────────────
@router.post("/next_question")
def next_question(body: LangNextQuestionRequest):
    t0 = time.perf_counter()

    ex_type = body.exercise_type or "multiple_choice_vocab"
    key = make_key(body.skill_focus, body.difficulty, ex_type,
                   body.attention_state)
    exclude = tuple(body.previous_questions[-8:])

    cached = exercise_cache.get(key, exclude_stems=exclude)
    if cached is not None:
        payload = cached
        source = "cache"
        mastery_scores = get_mastery_scores(body.student_id)
    else:
        mastery_scores = get_mastery_scores(body.student_id)
        payload, source = None, "fallback"

        use_quality = (API_KEY
                       and body.attention_state == "Focused"
                       and body.attention_confidence >= FASTPATH_CONF_THRESHOLD)
        if use_quality:
            try:
                payload = _run_pipeline(body, mastery_scores)
                source = "pipeline"
            except Exception as exc:  # noqa: BLE001
                logger.warning("pipeline failed (%s); trying fast path", exc)
                payload = None
        if payload is None and API_KEY:
            try:
                payload = _run_fastpath(body, mastery_scores)
                source = "fast"
            except Exception as exc:  # noqa: BLE001
                logger.warning("fast path failed (%s); using curriculum bank", exc)
                payload = None
        if payload is None:
            payload = _run_fallback(body)
        exercise_cache.put(key, payload)

    latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
    payload["meta"] = {
        "source": source,
        "cache_hit": source == "cache",
        "latency_ms": latency_ms,
        "model": gemini_client.resolved_model() if API_KEY else "offline-bank",
    }

    # Prefetch the next exercise for this context (inflight guard prevents dups)
    if source != "cache":
        _schedule_prefetch(key, body, mastery_scores)
    return payload
