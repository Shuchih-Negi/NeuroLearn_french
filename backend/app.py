"""
backend/app.py  — NeuroLearn French Edition
============================================
FastAPI server for neuro-adaptive French language learning.

Run:  uvicorn backend.app:app --reload --port 8000
Env:  GEMINI_API_KEY (required for AI endpoints)
      GEMINI_MODEL   (optional, defaults to gemini-3.5-flash)

Architecture
────────────
  /api/health                      — health check

  ── Language Learning ──────────────────────────────────────────
  /api/lang/languages              — list supported languages
  /api/lang/next_question          — adaptive question (5-agent pipeline)
  /api/lang/quest/generate         — session quest narrative
  /api/lang/story/generate         — immersion story
  /api/lang/validate               — NLP answer validation
  /api/lang/feedback/generate      — session feedback
  /api/lang/progress/update        — progress + mastery tracking
  /api/lang/dashboard/{student_id} — learning dashboard
  /api/lang/mastery/{student_id}   — per-skill mastery + SM-2 schedule

Research integration
────────────────────
  • mastery_scores feed back into ReasoningAgent's Krashen i+1 decisions.
  • Spaced repetition via SM-2 algorithm (Wozniak, 1987).
  • Session data currently stored in memory (Supabase persistence planned).
"""

from __future__ import annotations

import json
import os
import sys
import time
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional

import google.generativeai as genai
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

sys.path.append("..")
from agents.moderator import (
    Moderator,
    SessionContext,
    SUPPORTED_LANGUAGES,
    EXERCISE_TYPES,
    SKILL_TAGS,
)
from ml.nlp_model import NLPModel

# ── NLP engine for answer validation ───────────────────────────────────────────
_nlp_model = NLPModel()

# ── Config ─────────────────────────────────────────────────────────────────────
API_KEY = os.environ.get("GEMINI_API_KEY", "")
if API_KEY:
    genai.configure(api_key=API_KEY)
else:
    print("[config] WARNING: GEMINI_API_KEY not set — AI endpoints will return 503.")

MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")

_lang_moderator = None


def _get_lang_moderator() -> Moderator:
    global _lang_moderator
    if _lang_moderator is None:
        if not API_KEY:
            raise HTTPException(503, "GEMINI_API_KEY not set")
        _lang_moderator = Moderator(api_key=API_KEY, verbose=False)
    return _lang_moderator


app = FastAPI(title="NeuroLearn API — French Edition")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gemini models for story/feedback (temperature-tuned)
story_model    = genai.GenerativeModel(MODEL_NAME,
    generation_config=genai.GenerationConfig(temperature=0.9))
question_model = genai.GenerativeModel(MODEL_NAME,
    generation_config=genai.GenerationConfig(temperature=0.8))
feedback_model = genai.GenerativeModel(MODEL_NAME,
    generation_config=genai.GenerationConfig(temperature=0.85))

# ── In-memory stores ────────────────────────────────────────────────────────────
lang_progress_store: Dict[str, Any]    = {}   # language progress
mastery_store: Dict[str, Dict]         = {}   # user → skill → mastery data


# ══════════════════════════════════════════════════════════════════════════════
# Pydantic models
# ══════════════════════════════════════════════════════════════════════════════

class EyeMetricsPayload(BaseModel):
    blink_rate:        Optional[float] = None
    pupil_dilation:    Optional[float] = None
    fixation_duration: Optional[float] = None
    saccade_rate:      Optional[float] = None
    gaze_stability:    Optional[float] = None


class LangNextQuestionRequest(BaseModel):
    """
    Request for an adaptive language question.
    Includes all attention signals + language-specific context.
    """
    character:            str
    topic:                str           # e.g. "greetings and farewells"
    target_language:      str = "fr"   # ISO code
    difficulty:           int = Field(1, ge=1, le=5)
    attention_state:      str = "Focused"
    attention_confidence: float = Field(0.5, ge=0.0, le=1.0)
    eye_metrics:          Optional[EyeMetricsPayload] = None
    recent_states:        List[str] = Field(default_factory=list)
    last_correct:         Optional[bool] = None
    last_rt:              Optional[float] = None
    session_accuracy:     float = Field(0.0, ge=0.0, le=1.0)
    previous_questions:   List[str] = Field(default_factory=list)
    question_number:      int = Field(1, ge=1)
    total_questions:      int = Field(10, ge=1)
    skill_focus:          str = "vocabulary_basic"
    exercise_type:        Optional[str] = None
    learner_age:          int = 12
    student_id:           str = "default"
    session_fatigue:      float = Field(0.0, ge=0.0, le=1.0)
    quest_step:           Optional[Dict[str, Any]] = None  # {scene, location, task_hint, step_number}


class LangStoryRequest(BaseModel):
    """Generate an immersion story in the target language."""
    character:        str
    topic:            str
    target_language:  str = "fr"
    difficulty:       int = Field(1, ge=1, le=5)
    learner_age:      int = 12


class LangFeedbackRequest(BaseModel):
    character:        str
    total_correct:    int
    total_questions:  int
    target_language:  str = "fr"
    topic:            str
    attention_history: List[str] = []
    skill_results:    Dict[str, float] = {}   # skill_tag → accuracy
    student_id:       str = "default"


class QuestGenerateRequest(BaseModel):
    """Generate a quest arc for a language learning session."""
    character:       str
    topic:           str
    target_language: str = "fr"
    total_questions: int = 10
    learner_age:     int = 12


class LangValidateRequest(BaseModel):
    """Validate a free-text learner answer using NLP."""
    learner_answer:     str
    correct_answer:     str
    acceptable_answers: List[str] = []
    target_language:    str = "fr"


class LangProgressUpdate(BaseModel):
    """
    Posted after every question answer.
    Feeds the SM-2 spaced-repetition scheduler and LSTM mastery tracker.
    """
    student_id:      str = "default"
    skill_tag:       str
    correct:         bool
    response_time:   float = 0.0
    attention_state: str = "Focused"
    xp_earned:       int = 0
    exercise_type:   str = "multiple_choice_vocab"
    target_language: str = "fr"
    section_id:      str = "default_section"


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def call_gemini_json(model, prompt: str) -> Dict:
    try:
        resp = model.generate_content(prompt)
        text = resp.text.strip()
        if "```" in text:
            for part in text.split("```"):
                s = part.lstrip("json").strip()
                if s.startswith("{") or s.startswith("["):
                    text = s
                    break
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start: end + 1])
        start, end = text.find("["), text.rfind("]")
        if start >= 0 and end > start:
            return {"items": json.loads(text[start: end + 1])}
        raise ValueError("No JSON found")
    except json.JSONDecodeError as e:
        raise HTTPException(502, f"Gemini returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(502, f"Gemini error: {e}")


def _sm2_next_review(
    current_ef: float,
    current_interval: int,
    quality: int,  # 0-5 (0=blackout, 5=perfect)
) -> tuple[float, int]:
    """
    SM-2 spaced repetition algorithm (Wozniak, 1987).
    Returns (new_ef, new_interval_days).

    Research: Ebbinghaus (1885) Forgetting Curve — spaced retrieval
    practice is the most robust method for vocabulary retention.
    Applied in SuperMemo, Anki, Duolingo's spaced repetition engine.
    """
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
        new_ef = max(1.3, current_ef + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    return new_ef, new_interval


def _quality_from_answer(correct: bool, response_time: float, hint_used: bool = False) -> int:
    """
    Map answer result to SM-2 quality score (0-5).
    Research: Pimsleur (1967) — quality encoding accounts for hesitation latency.
    """
    if not correct:
        return 1 if response_time > 30 else 0
    if hint_used:
        return 3
    if response_time < 5:
        return 5
    if response_time < 15:
        return 4
    return 3


def _get_mastery_scores(student_id: str) -> Dict[str, float]:
    """Return current mastery 0-1 per skill for this student."""
    if student_id not in mastery_store:
        return {}
    skills = mastery_store[student_id]
    return {tag: data.get("mastery", 0.0) for tag, data in skills.items()}


def _update_mastery(student_id: str, skill_tag: str, correct: bool,
                    response_time: float) -> Dict:
    """
    Update mastery score using a Bayesian-inspired running average
    weighted by recency. Returns updated mastery data dict.

    Research: Corbett & Anderson (1994) — Bayesian Knowledge Tracking.
    We approximate with EWMA (exponentially weighted moving average)
    as a lightweight alternative until the LSTM model is trained.
    """
    if student_id not in mastery_store:
        mastery_store[student_id] = {}
    skills = mastery_store[student_id]
    if skill_tag not in skills:
        skills[skill_tag] = {
            "mastery":          0.0,
            "interactions":     0,
            "ef":               2.5,    # SM-2 easiness factor
            "interval_days":    0,
            "next_review_ts":   time.time(),
            "correct_streak":   0,
        }
    s = skills[skill_tag]
    alpha = 0.3  # EWMA learning rate — higher = faster adaptation

    performance = 1.0 if correct else 0.0
    if response_time < 5 and correct:
        performance = 1.0
    elif response_time > 30 and correct:
        performance = 0.7  # partial credit for slow-but-correct

    s["mastery"]      = (1 - alpha) * s["mastery"] + alpha * performance
    s["interactions"] += 1
    s["correct_streak"] = s["correct_streak"] + 1 if correct else 0

    q = _quality_from_answer(correct, response_time)
    new_ef, new_interval = _sm2_next_review(s["ef"], s["interval_days"], q)
    s["ef"]           = new_ef
    s["interval_days"] = new_interval
    s["next_review_ts"] = time.time() + new_interval * 86400

    return s


# ══════════════════════════════════════════════════════════════════════════════
# Health
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "NeuroLearn API — French Edition"}


# ══════════════════════════════════════════════════════════════════════════════
# Language Learning Endpoints
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/lang/languages")
async def get_languages():
    """List all supported target languages."""
    return {
        "languages": [
            {"code": code, "name": name}
            for code, name in SUPPORTED_LANGUAGES.items()
        ],
        "exercise_types": EXERCISE_TYPES,
        "skill_tags": SKILL_TAGS,
    }


# ── Quest Generation ───────────────────────────────────────────────────────────

@app.post("/api/lang/quest/generate")
async def lang_generate_quest(req: QuestGenerateRequest):
    """
    Generate an overarching quest narrative for a language session.

    The quest creates a story arc (e.g., "Batman chases Joker through Paris")
    with one step per question. Each step has a unique scene, location, and
    language task hint that the StoryAgent uses to frame questions.

    Research: Mayer (2009) — narrative context enhances dual-channel processing.
    Lam & Muldner (2018) — gamified narratives boost ADHD engagement.
    """
    lang_name = SUPPORTED_LANGUAGES.get(req.target_language, req.target_language)
    prompt = f"""You are a quest designer for a language learning game.

Create an exciting chase/adventure quest for a {req.learner_age}-year-old learning {lang_name}.

CHARACTER: {req.character}
TOPIC: {req.topic}
LANGUAGE: {lang_name}
TOTAL STEPS: {req.total_questions}

STORY PREMISE:
{req.character} is on an urgent mission through a {lang_name}-speaking country!
They must use {lang_name} at every stop to progress. Create a chase/quest narrative
where each step is a different location where they need to communicate in {lang_name}.

RULES:
- Each step must have a UNIQUE location and scene
- Steps should escalate in excitement
- Language tasks should relate to the topic: {req.topic}
- Keep each scene description to 1-2 sentences
- Make it feel like a real adventure!

Return ONLY valid JSON:
{{
  "quest_title": "Exciting quest title",
  "quest_intro": "2-3 sentence quest setup — what's at stake?",
  "villain_or_goal": "Who/what are they chasing or what's the goal?",
  "steps": [
    {{
      "step_number": 1,
      "location": "Specific place name",
      "scene": "What happens here (1-2 sentences)",
      "task_hint": "What {lang_name} skill they need (e.g., 'greet the guard', 'order food')"
    }}
  ]
}}

Generate exactly {req.total_questions} steps."""

    try:
        data = call_gemini_json(story_model, prompt)
        # Ensure we have the right number of steps
        steps = data.get("steps", [])
        if len(steps) < req.total_questions:
            # Pad with generic steps
            for i in range(len(steps), req.total_questions):
                steps.append({
                    "step_number": i + 1,
                    "location": f"Location {i + 1}",
                    "scene": f"{req.character} reaches the next checkpoint and must use {lang_name} to continue!",
                    "task_hint": f"communicate in {lang_name}",
                })
            data["steps"] = steps
        return data
    except Exception:
        # Fallback quest
        return _build_fallback_quest(req.character, lang_name, req.total_questions, req.topic)


def _build_fallback_quest(
    character: str, lang_name: str, total: int, topic: str
) -> Dict:
    """Hardcoded fallback quest when Gemini is unavailable."""
    locations = [
        ("The Airport", f"{character} arrives at the airport and must greet the passport officer", "greet someone formally"),
        ("A Taxi", f"{character} jumps into a taxi and needs to tell the driver where to go", "give directions"),
        ("The Café", f"{character} spots a clue at a café but must order a drink first", "order food or drink"),
        ("The Market", f"{character} chases through a busy market and must ask for directions", "ask for directions"),
        ("The Museum", f"{character} follows a trail into a museum and must buy a ticket", "buy a ticket"),
        ("The Train Station", f"{character} needs to catch a train and must read the schedule", "understand numbers and time"),
        ("The Hotel", f"{character} checks into a hotel to rest and regroup", "introduce yourself"),
        ("The Park", f"{character} meets an informant in the park who only speaks {lang_name}", "have a basic conversation"),
        ("The Library", f"{character} searches for a coded message hidden in a book", "identify objects"),
        ("The Rooftop", f"{character} corners the villain on a rooftop for the final showdown", "say a farewell"),
        ("The Bridge", f"{character} crosses an old bridge and must ask a guard to pass", "ask permission politely"),
        ("The Bakery", f"{character} ducks into a bakery to hide and must blend in by ordering", "order food"),
        ("The Clock Tower", f"{character} races to the clock tower — must tell the time to solve a puzzle", "tell the time"),
        ("The School", f"{character} hides in a school and must answer the teacher's question", "answer a question"),
        ("The Harbor", f"{character} reaches the harbor and must negotiate with a boat captain", "negotiate politely"),
    ]
    steps = []
    for i in range(total):
        loc = locations[i % len(locations)]
        steps.append({
            "step_number": i + 1,
            "location": loc[0],
            "scene": loc[1],
            "task_hint": loc[2],
        })
    return {
        "quest_title": f"{character}'s {lang_name} Chase",
        "quest_intro": f"{character} has tracked a villain to a {lang_name}-speaking city! "
                       f"To catch them, {character} must speak {lang_name} at every stop. "
                       f"The chase is on — help {character} communicate!",
        "villain_or_goal": "the villain who stole the ancient artifact",
        "steps": steps,
    }


# ── NLP Answer Validation ──────────────────────────────────────────────────────

@app.post("/api/lang/validate")
async def lang_validate_answer(req: LangValidateRequest):
    """
    Validate a learner's free-text answer using the NLP engine.

    Uses multi-tier validation:
    1. Exact match (normalised)
    2. Acceptable variants
    3. Accent-stripped match
    4. Edit distance (Levenshtein)
    5. Semantic similarity (if sentence-transformers installed)

    Research: Swain (1985) — credit meaningful output even if surface form is imperfect.
    Lyster & Ranta (1997) — recast feedback (showing correct form) in the response.
    """
    result = _nlp_model.validate_answer(
        learner_answer=req.learner_answer,
        correct_answer=req.correct_answer,
        acceptable_answers=req.acceptable_answers,
        target_language=req.target_language,
    )
    return result


@app.post("/api/lang/next_question")
async def lang_next_question(body: LangNextQuestionRequest):
    """
    Adaptive language question — full 5-agent pipeline.

    Flow:
      1. Load mastery scores for this student → feed to ReasoningAgent
      2. ReasoningAgent decides skill + difficulty + exercise type
      3. LangQuestionAgent generates the exercise
      4. StoryAgent wraps in character narrative
      5. QAAgent validates
      6. HintAgent generates 2 graduated hints
      7. Return QuestionPacket

    The response includes mastery_hint for the frontend to display spaced-rep
    guidance, and skill_tag for the progress tracker to update mastery.
    """
    moderator = _get_lang_moderator()
    eye_dict = None
    if body.eye_metrics:
        eye_dict = {k: v for k, v in body.eye_metrics.model_dump().items()
                    if v is not None}
        if not eye_dict:
            eye_dict = None

    # Pull current mastery scores for Krashen i+1 decisions
    mastery_scores = _get_mastery_scores(body.student_id)

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

    pkt = moderator.run(ctx)

    return {
        "question":           pkt.question,
        "options":            pkt.options,
        "correct_index":      pkt.correct_index,
        "explanation":        pkt.explanation,
        "difficulty":         pkt.difficulty,
        "hints":              pkt.hints,
        "state_used":         pkt.state_used,
        "reasoning":          pkt.reasoning or "",
        # Language-specific
        "skill_tag":          pkt.skill_tag,
        "exercise_type":      pkt.exercise_type,
        "grammar_explanation": pkt.grammar_explanation,
        "visual_breakdown":   pkt.visual_breakdown,
        "dopamine_reward":    pkt.dopamine_reward,
        "acceptable_answers": pkt.acceptable_answers,
        "native_word":        pkt.native_word,
        "target_translation": pkt.target_translation,
        "mastery_hint":       pkt.mastery_hint,
    }


@app.post("/api/lang/story/generate")
async def lang_generate_story(req: LangStoryRequest):
    """
    Generate a short immersion story in the target language.

    Research basis:
    • Krashen (1982): Comprehensible input — story is ~70% familiar + 30% new.
    • Mason & Krashen (1997): Free Voluntary Reading improves acquisition.
    • ADHD design: max 5 short paragraphs, each ≤60 words.
    """
    lang_name = SUPPORTED_LANGUAGES.get(req.target_language, req.target_language)
    prompt = f"""You are a language immersion teacher creating a short story for a {req.learner_age}-year-old
learning {lang_name}. Level: {req.difficulty}/5 (1=beginner with English translations, 5=near-native).

Character: {req.character}  |  Topic: {req.topic}

ADHD DESIGN RULES:
- Maximum 5 paragraphs, each ≤60 words.
- Beginner levels (1-2): 70% English story with target language words bolded.
- Intermediate (3): 50/50 mix. Advanced (4-5): Mostly {lang_name} with glossary.
- Comprehensible input: i+1 — introduce ≤5 new words per story.
- End with 3 "key words learned" with pronunciation guide.

Return ONLY valid JSON:
{{
  "title": "Engaging story title (bilingual ok)",
  "story": "Story text (use \\n\\n between paragraphs)",
  "key_words": [
    {{"word": "{lang_name} word", "meaning": "English meaning",
      "pronunciation": "phonetic guide", "example": "example sentence"}}
  ],
  "comprehension_question": "One simple question about the story",
  "comprehension_answer": "Answer to the question",
  "language_tip": "One short grammar or cultural tip from the story"
}}"""
    try:
        return call_gemini_json(story_model, prompt)
    except Exception:
        return {
            "title": f"{req.character} Learns {lang_name}",
            "story": f"{req.character} is starting to learn {lang_name}. Every day, they practice a little.\n\n"
                     f"Today's topic is: {req.topic}. Let's explore together!",
            "key_words": [{"word": "Bonjour", "meaning": "Hello",
                           "pronunciation": "bon-ZHOOR", "example": "Bonjour, comment ça va ?"}],
            "comprehension_question": f"What is {req.character} learning today?",
            "comprehension_answer": req.topic,
            "language_tip": f"Practice {req.topic} every day for best results!",
        }


@app.post("/api/lang/feedback/generate")
async def lang_generate_feedback(req: LangFeedbackRequest):
    """
    End-of-session language feedback.

    Includes:
    • Session performance summary
    • Skill-specific mastery advice
    • Spaced-repetition recommendation (which skills to review next)
    • Shame-free, ADHD-optimised tone

    Research: Lyster & Ranta (1997) — recast feedback (showing correct form
    in response) is more effective than explicit error correction for acquisition.
    """
    lang_name = SUPPORTED_LANGUAGES.get(req.target_language, req.target_language)
    pct = (req.total_correct / max(1, req.total_questions)) * 100
    xp  = req.total_correct * 25 + (15 if pct >= 80 else 0)

    # Mastery advice from skill results
    weak_skills  = [s for s, acc in req.skill_results.items() if acc < 0.5]
    strong_skills = [s for s, acc in req.skill_results.items() if acc >= 0.8]

    prompt = f"""You are {req.character}, a warm and encouraging language tutor speaking to a
{lang_name} learner with ADHD who just finished a practice session.

Session results: {req.total_correct}/{req.total_questions} correct ({pct:.0f}%)
Topic: {req.topic}  |  Attention pattern: {', '.join(req.attention_history[-5:]) or 'N/A'}
Strong skills: {', '.join(strong_skills) or 'building up'}
Skills needing practice: {', '.join(weak_skills) or 'none — great work!'}
XP earned: {xp}

TONE RULES (ADHD research — Lam & Muldner 2018):
- Celebrate effort first, achievement second
- NEVER say "wrong", "failed", "bad" — always recast positively
- Keep each message ≤3 sentences
- Give ONE concrete next-step tip only

Return ONLY valid JSON:
{{
  "message": "Warm, energetic in-character message (≤3 sentences)",
  "skill_note": "One positive recast note about a weak skill (≤2 sentences)",
  "next_step": "One concrete micro-action for next session",
  "review_skills": {json.dumps(weak_skills)},
  "xp_earned": {xp},
  "rating": "{('excellent' if pct >= 80 else 'good' if pct >= 50 else 'keep_going')}",
  "encouragement_quote": "A short motivational quote about language learning"
}}"""

    try:
        data = call_gemini_json(feedback_model, prompt)
        data.setdefault("xp_earned", xp)
        return data
    except Exception:
        rating = "excellent" if pct >= 80 else "good" if pct >= 50 else "keep_going"
        return {
            "message": f"Amazing effort today! {req.total_correct} out of {req.total_questions} — you're building something real!",
            "skill_note": f"Keep practising {weak_skills[0] if weak_skills else 'all your skills'} — it gets easier every time.",
            "next_step": f"Try 5 minutes of {lang_name} tomorrow to lock in today's words.",
            "review_skills": weak_skills,
            "xp_earned": xp,
            "rating": rating,
            "encouragement_quote": "Every expert was once a beginner.",
        }


@app.post("/api/lang/progress/update")
async def lang_update_progress(req: LangProgressUpdate):
    """
    Update language progress after each answer.

    Does three things:
    1. Updates session-level stats (accuracy, streak, XP)
    2. Updates EWMA mastery score for the skill tag
    3. Runs SM-2 spaced-repetition scheduler for next review

    The returned mastery_scores dict is fed back into the next
    /api/lang/next_question call so ReasoningAgent always has fresh data.
    """
    sid = req.student_id
    if sid not in lang_progress_store:
        lang_progress_store[sid] = {
            "sections": {}, "total_xp": 0,
            "history": [], "languages": defaultdict(dict),
        }

    store = lang_progress_store[sid]
    sec = store["sections"].setdefault(req.section_id, {
        "answered": 0, "correct": 0, "attention_states": [],
        "best_streak": 0, "current_streak": 0,
        "exercise_types": Counter(), "skill_tags": Counter(),
    })

    sec["answered"] += 1
    if req.correct:
        sec["correct"] += 1
        sec["current_streak"] += 1
        sec["best_streak"] = max(sec["best_streak"], sec["current_streak"])
    else:
        sec["current_streak"] = 0

    sec["attention_states"].append(req.attention_state)
    sec["exercise_types"][req.exercise_type] += 1
    sec["skill_tags"][req.skill_tag] += 1
    store["total_xp"] += req.xp_earned

    store["history"].append({
        "section_id":   req.section_id,
        "skill_tag":    req.skill_tag,
        "exercise_type": req.exercise_type,
        "correct":      req.correct,
        "rt":           req.response_time,
        "state":        req.attention_state,
        "language":     req.target_language,
        "ts":           time.time(),
    })

    # Update mastery + spaced repetition
    mastery_data = _update_mastery(
        sid, req.skill_tag, req.correct, req.response_time
    )

    return {
        "status":        "ok",
        "section":       {
            "answered":       sec["answered"],
            "correct":        sec["correct"],
            "accuracy":       round(sec["correct"] / max(1, sec["answered"]) * 100, 1),
            "current_streak": sec["current_streak"],
            "best_streak":    sec["best_streak"],
        },
        "total_xp":      store["total_xp"],
        "skill_mastery": mastery_data["mastery"],
        "next_review_in_days": mastery_data["interval_days"],
        "mastery_scores": _get_mastery_scores(sid),
    }


@app.get("/api/lang/mastery/{student_id}")
async def get_mastery(student_id: str):
    """
    Return full mastery state for all skills.
    Used by the LSTM training pipeline and the frontend skill radar chart.
    """
    if student_id not in mastery_store:
        return {"student_id": student_id, "skills": {}, "total_interactions": 0}

    skills = mastery_store[student_id]
    now = time.time()
    due_for_review = [
        tag for tag, data in skills.items()
        if data.get("next_review_ts", 0) <= now
    ]

    return {
        "student_id":      student_id,
        "skills":          skills,
        "due_for_review":  due_for_review,
        "total_interactions": sum(s.get("interactions", 0) for s in skills.values()),
        "mastery_vector":  _get_mastery_scores(student_id),
    }


@app.get("/api/lang/dashboard/{student_id}")
async def lang_get_dashboard(student_id: str):
    """
    Language learning dashboard.

    Returns:
    • Per-section stats (accuracy, streaks, attention states)
    • Per-skill mastery scores and SM-2 review schedule
    • XP, level, and engagement metrics
    • Attention state distribution (for ADHD progress monitoring)
    """
    store = lang_progress_store.get(student_id, {
        "sections": {}, "total_xp": 0, "history": []
    })

    sections_summary = []
    for sid, sec in store["sections"].items():
        acc = (sec["correct"] / max(1, sec["answered"])) * 100
        state_counts = Counter(sec.get("attention_states", []))
        dominant = state_counts.most_common(1)[0][0] if state_counts else "N/A"
        sections_summary.append({
            "section_id":     sid,
            "answered":       sec["answered"],
            "correct":        sec["correct"],
            "accuracy":       round(acc, 1),
            "best_streak":    sec["best_streak"],
            "dominant_state": dominant,
            "state_counts":   dict(state_counts),
            "exercise_types": dict(sec.get("exercise_types", {})),
        })

    ta = sum(s["answered"] for s in store["sections"].values())
    tc = sum(s["correct"]  for s in store["sections"].values())

    # Mastery radar for frontend chart
    mastery_scores = _get_mastery_scores(student_id)

    # Recent attention trend
    recent_hist = store["history"][-50:]
    attention_trend = Counter(h["state"] for h in recent_hist)

    total_xp  = store.get("total_xp", 0)
    level     = max(1, total_xp // 150 + 1)
    xp_to_next = level * 150 - total_xp

    return {
        "student_id":       student_id,
        "total_xp":         total_xp,
        "level":            level,
        "xp_to_next_level": xp_to_next,
        "total_answered":   ta,
        "total_correct":    tc,
        "overall_accuracy": round((tc / max(1, ta)) * 100, 1),
        "sections":         sections_summary,
        "mastery_scores":   mastery_scores,
        "attention_distribution": dict(attention_trend),
        "skills_due_for_review": [
            tag for tag, data in mastery_store.get(student_id, {}).items()
            if data.get("next_review_ts", 0) <= time.time()
        ],
        "recent_history":   recent_hist[-20:],
        # ADHD progress insight
        "adhd_insights": _compute_adhd_insights(recent_hist, mastery_scores),
    }


def _compute_adhd_insights(history: List[Dict], mastery: Dict[str, float]) -> Dict:
    """
    Compute ADHD-relevant learning analytics.

    Research: Toplak et al. (2013) — time-on-task degradation in ADHD.
    Monitors attention state drift over session and accuracy trends.
    """
    if not history:
        return {"focus_rate": 0, "best_time_of_session": "start", "streak_potential": 0}

    states = [h.get("state", "Focused") for h in history]
    focus_rate = round(states.count("Focused") / len(states) * 100, 1)

    # Accuracy in first vs second half of session
    mid = len(history) // 2
    first_half_acc = sum(1 for h in history[:mid] if h.get("correct")) / max(1, mid)
    second_half_acc = sum(1 for h in history[mid:] if h.get("correct")) / max(1, len(history) - mid)
    best_half = "start" if first_half_acc >= second_half_acc else "end"

    # Average mastery
    avg_mastery = sum(mastery.values()) / max(1, len(mastery))

    return {
        "focus_rate":          focus_rate,
        "best_time_of_session": best_half,
        "first_half_accuracy":  round(first_half_acc * 100, 1),
        "second_half_accuracy": round(second_half_acc * 100, 1),
        "avg_mastery":          round(avg_mastery * 100, 1),
        "fatigue_detected":     second_half_acc < first_half_acc - 0.15,
        "recommendation":       (
            "Consider ending the session — attention is drifting."
            if second_half_acc < first_half_acc - 0.15
            else "Great sustained focus! Keep going."
        ),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
