"""
backend/routers/content.py — narrative content: stories, quests, feedback,
language catalogue and the French curriculum map.
"""

import json
from typing import Dict

from fastapi import APIRouter

import backend.curriculum as curriculum
import backend.gemini_client as gemini_client
from agents.moderator import EXERCISE_TYPES, SKILL_TAGS, SUPPORTED_LANGUAGES
from backend.schemas import LangFeedbackRequest, LangStoryRequest, QuestGenerateRequest

router = APIRouter(prefix="/api/lang", tags=["content"])


# ── Catalogue ─────────────────────────────────────────────────────────────────
@router.get("/languages")
def get_languages():
    return {
        "flagship": "fr",
        "languages": [{"code": code, "name": name}
                      for code, name in SUPPORTED_LANGUAGES.items()],
        "exercise_types": EXERCISE_TYPES,
        "skill_tags": SKILL_TAGS,
    }


@router.get("/curriculum")
def get_curriculum():
    return {"units": curriculum.summary()}


# ── Immersion story ───────────────────────────────────────────────────────────
@router.post("/story/generate")
def generate_story(req: LangStoryRequest):
    """Comprehensible input i+1 (Krashen 1982); ADHD: ≤5 short paragraphs."""
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
        return gemini_client.generate_json(prompt, temperature=0.9, kind="story")
    except Exception:
        return {
            "title": f"{req.character} Learns {lang_name}",
            "story": (f"{req.character} is starting to learn {lang_name}. "
                      f"Every day, they practice a little.\n\n"
                      f"Today's topic is: {req.topic}. Let's explore together!"),
            "key_words": [{"word": "Bonjour", "meaning": "Hello",
                           "pronunciation": "bon-ZHOOR",
                           "example": "Bonjour, comment ça va ?"}],
            "comprehension_question": f"What is {req.character} learning today?",
            "comprehension_answer": req.topic,
            "language_tip": f"Practice {req.topic} every day for best results!",
        }


# ── Quest arc ─────────────────────────────────────────────────────────────────
_FALLBACK_LOCATIONS = [
    ("L'Aéroport", "arrives at the airport and must greet the passport officer", "greet someone formally"),
    ("Le Taxi", "jumps into a taxi and must tell the driver where to go", "give directions"),
    ("Le Café", "spots a clue at a café but must order a drink first", "order food or drink"),
    ("Le Marché", "chases through a busy market and must ask for directions", "ask for directions"),
    ("Le Musée", "follows a trail into a museum and must buy a ticket", "buy a ticket"),
    ("La Gare", "needs to catch a train and must read the schedule", "understand numbers and time"),
    ("L'Hôtel", "checks into a hotel to rest and regroup", "introduce yourself"),
    ("Le Parc", "meets an informant who only speaks French", "have a basic conversation"),
    ("La Bibliothèque", "searches for a coded message hidden in a book", "identify objects"),
    ("Le Toit", "corners the villain on a rooftop for the final showdown", "say a farewell"),
    ("Le Pont", "crosses an old bridge and must ask a guard to pass", "ask permission politely"),
    ("La Boulangerie", "ducks into a bakery to hide and must blend in by ordering", "order food"),
    ("Le Beffroi", "races to the clock tower — must tell the time to solve a puzzle", "tell the time"),
    ("L'École", "hides in a school and must answer the teacher's question", "answer a question"),
    ("Le Port", "reaches the harbor and must negotiate with a boat captain", "negotiate politely"),
]


def _fallback_quest(character: str, total: int) -> Dict:
    steps = []
    for i in range(total):
        loc = _FALLBACK_LOCATIONS[i % len(_FALLBACK_LOCATIONS)]
        steps.append({"step_number": i + 1, "location": loc[0],
                      "scene": f"{character} {loc[1]}.", "task_hint": loc[2]})
    return {
        "quest_title": f"{character}'s Poursuite à travers la France",
        "quest_intro": (f"{character} has tracked a villain to France! To catch "
                        f"them, every stop requires French. The chase is on!"),
        "villain_or_goal": "the villain who stole the ancient artifact",
        "steps": steps,
    }


@router.post("/quest/generate")
def generate_quest(req: QuestGenerateRequest):
    """Quest narrative arc; one scene per question (Mayer 2009; Lam & Muldner 2018)."""
    lang_name = SUPPORTED_LANGUAGES.get(req.target_language, req.target_language)
    prompt = f"""You are a quest designer for a language learning game.

Create an exciting chase/adventure quest for a {req.learner_age}-year-old learning {lang_name}.

CHARACTER: {req.character}
TOPIC: {req.topic}
LANGUAGE: {lang_name}
TOTAL STEPS: {req.total_questions}

STORY PREMISE:
{req.character} is on an urgent mission through France!
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
        data = gemini_client.generate_json(prompt, temperature=0.9, kind="quest")
        steps = data.get("steps", [])
        if len(steps) < req.total_questions:
            for i in range(len(steps), req.total_questions):
                steps.append({
                    "step_number": i + 1,
                    "location": f"Location {i + 1}",
                    "scene": f"{req.character} reaches the next checkpoint!",
                    "task_hint": f"communicate in {lang_name}",
                })
            data["steps"] = steps
        return data
    except Exception:
        return _fallback_quest(req.character, req.total_questions)


# ── Session feedback ──────────────────────────────────────────────────────────
@router.post("/feedback/generate")
def generate_feedback(req: LangFeedbackRequest):
    """Shame-free recast feedback (Lyster & Ranta 1997)."""
    lang_name = SUPPORTED_LANGUAGES.get(req.target_language, req.target_language)
    pct = (req.total_correct / max(1, req.total_questions)) * 100
    xp = req.total_correct * 25 + (15 if pct >= 80 else 0)

    weak_skills = [s for s, acc in req.skill_results.items() if acc < 0.5]
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
        data = gemini_client.generate_json(prompt, temperature=0.85, kind="feedback")
        data.setdefault("xp_earned", xp)
        return data
    except Exception:
        rating = "excellent" if pct >= 80 else "good" if pct >= 50 else "keep_going"
        return {
            "message": (f"Amazing effort today! {req.total_correct} out of "
                        f"{req.total_questions} — you're building something real!"),
            "skill_note": ("Keep practising "
                           f"{weak_skills[0] if weak_skills else 'all your skills'} "
                           "— it gets easier every time."),
            "next_step": f"Try 5 minutes of {lang_name} tomorrow to lock in today's words.",
            "review_skills": weak_skills,
            "xp_earned": xp,
            "rating": rating,
            "encouragement_quote": "Every expert was once a beginner.",
        }
