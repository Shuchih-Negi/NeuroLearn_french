"""
backend/curriculum.py — French CEFR seed content.

Three jobs:
  1. Grounding context for Gemini prompts (topic/skill vocabulary)
  2. Offline exercise bank — the always-available fallback when the AI
     pipeline is unavailable or slow
  3. Bootstrap dataset for DKT training before real data exists

Content is curated French (backend/data/fr_curriculum.json).
"""

import json
import random
import re
import threading
from typing import Dict, List, Optional

from backend.config import CURRICULUM_PATH

_lock = threading.Lock()
_data: Optional[Dict] = None

DOPAMINE_POOL = [
    "🌟 Parfait !", "🚀 Excellent réflexe !", "🎯 En plein dans le mille !",
    "✨ Bravo, ça progresse !", "🔥 Série en cours — continue !",
    "💪 Bien joué !", "🌈 Superbe effort !", "⚡ Rapide et juste !",
]


def _load() -> Dict:
    global _data
    if _data is None:
        with _lock:
            if _data is None:
                with open(CURRICULUM_PATH, "r", encoding="utf-8") as fh:
                    _data = json.load(fh)
    assert _data is not None
    return _data


def reload() -> None:
    global _data
    with _lock:
        _data = None


def units() -> List[Dict]:
    return _load()["units"]


def unit_by_id(unit_id: str) -> Optional[Dict]:
    return next((u for u in units() if u["id"] == unit_id), None)


def units_for_skill(skill_tag: str) -> List[Dict]:
    matches = [u for u in units() if skill_tag in u.get("skills", [])]
    return matches or units()


def summary() -> List[Dict]:
    return [
        {
            "id": u["id"], "title": u["title"], "cefr": u["cefr"],
            "topic": u["topic"], "skills": u.get("skills", []),
            "vocab_count": len(u.get("vocab", [])),
        }
        for u in units()
    ]


def _pick_unit(skill_tag: str) -> Dict:
    candidates = units_for_skill(skill_tag)
    return random.choice(candidates)


def _strip_article(fr_word: str) -> str:
    return re.sub(r"^(le|la|l'|les|un|une|des)\s+", "", fr_word,
                  flags=re.IGNORECASE).strip()


def build_fallback_packet(
    *,
    character: str,
    topic_hint: str = "",
    difficulty: int = 1,
    attention_state: str = "Focused",
    skill_focus: str = "vocabulary_basic",
    exercise_type: str = "multiple_choice_vocab",
    previous_questions: Optional[List[str]] = None,
    state_used: Optional[str] = None,
) -> Dict:
    """
    Build a complete question payload from the offline bank.
    Shape-identical to the Gemini pipeline response so callers can't tell
    the difference beyond `meta.source == "fallback"`.
    """
    prev = set(previous_questions or [])
    unit = _pick_unit(skill_focus)
    vocab = unit.get("vocab", [])
    used_type = exercise_type

    # Article drills for gender-focused skills/units
    drillable = [v for v in vocab if v.get("gender") and v.get("noun")]
    if drillable and (skill_focus in ("grammar_genders",)
                      or unit.get("article_drill")) and exercise_type in (
            "multiple_choice_vocab", "grammar_sort"):
        item = random.choice(drillable)
        article = "le" if item["gender"] == "m" else "la"
        options = ["le", "la", "les", "des"]
        correct_letter_idx = options.index(article)
        question_text = (
            f"{character} needs the right article! "
            f"Choose: ___ {item['noun']}"
        )
        explanation = (
            f"'{item['noun']}' is masculine → 'le {item['noun']}'. "
            f"Feminine nouns use 'la'."
            if item["gender"] == "m"
            else f"'{item['noun']}' is feminine → 'la {item['noun']}'. "
                 f"Masculine nouns use 'le'."
        )
        grammar_explanation = unit.get(
            "grammar_note",
            "le = masculine, la = feminine, les = plural."
        )[:120]
        visual = "🔵 le + masculin   |   🔴 la + féminin"
        native_word = f"the {_strip_article(item['noun'])}"
        target_translation = f"{article} {item['noun']}"
        acceptable = [f"{article} {_strip_article(item['noun'])}",
                      target_translation]
        used_type = "grammar_sort"
    else:
        # Vocabulary MCQ, avoid recently served stems when possible
        fresh = [v for v in vocab
                 if f"'{v['en']}'" not in " ".join(prev)]
        pool = fresh or vocab
        item = random.choice(pool)

        distractor_pool = [v for v in vocab if v["fr"] != item["fr"]]
        distractors = random.sample(
            distractor_pool, k=min(3, len(distractor_pool)))
        correct_fr = item["fr"]
        opts = [correct_fr] + [d["fr"] for d in distractors]
        while len(opts) < 4:
            filler = random.choice(units())["vocab"]
            extra = random.choice(filler)["fr"]
            if extra not in opts:
                opts.append(extra)
        random.shuffle(opts)

        scene = {
            "Focused": f"{character} is on a mission",
            "Drifting": f"{character} spots something surprising",
            "Impulsive": f"{character} whispers: look carefully…",
            "Overwhelmed": f"{character} keeps it simple",
        }.get(state_used or attention_state, f"{character} is on a mission")

        en_label = item["en"].split(" / ")[0]
        question_text = f"{scene}. How do you say '{en_label}' in French?"
        explanation = (f"'{en_label}' in French is "
                       f"\"{correct_fr}\" ({item.get('pron', '')}).")
        grammar_explanation = (unit.get("grammar_note") or "")[:120]
        visual = ""
        native_word = en_label
        target_translation = correct_fr
        acceptable = [correct_fr]
        opts_formatted = [f"{chr(65 + i)}) {o}" for i, o in enumerate(opts)]
        correct_index = next(i for i, o in enumerate(opts) if o == correct_fr)

        pron = item.get("pron", "")
        hints = [
            f"It starts like \"{pron.split('-')[0] if pron else correct_fr[:3]}…\""
            if pron else f"Think of the {unit['title']} unit.",
            unit.get("grammar_note", f"Category: {', '.join(unit.get('skills', []))}")[:80],
        ]

        packet = {
            "question": question_text,
            "options": opts_formatted,
            "correct_index": correct_index,
            "explanation": explanation,
            "difficulty": max(1, min(5, int(difficulty))),
            "hints": hints,
            "state_used": state_used or attention_state,
            "reasoning": "Offline curriculum bank",
            "skill_tag": (unit.get("skills") or [skill_focus])[0],
            "exercise_type": used_type,
            "grammar_explanation": grammar_explanation,
            "visual_breakdown": visual,
            "dopamine_reward": random.choice(DOPAMINE_POOL),
            "acceptable_answers": acceptable,
            "native_word": native_word,
            "target_translation": target_translation,
            "mastery_hint": "Review this word tomorrow to lock it in.",
            "qa_passed": True,
            "attempts": 1,
            "source_unit": unit["id"],
        }
        return packet

    # Shared assembly for article-drill branch
    opts_formatted = [f"{chr(65 + i)}) {o}" for i, o in enumerate(options)]
    pron = item.get("pron", "")
    hints = [
        f"Is '{item['noun']}' masculine or feminine? Think -e endings.",
        "le for masculine nouns, la for feminine nouns.",
    ]
    return {
        "question": question_text,
        "options": opts_formatted,
        "correct_index": correct_letter_idx,
        "explanation": explanation,
        "difficulty": max(1, min(5, int(difficulty))),
        "hints": hints,
        "state_used": state_used or attention_state,
        "reasoning": "Offline curriculum bank",
        "skill_tag": (unit.get("skills") or [skill_focus])[0],
        "exercise_type": used_type,
        "grammar_explanation": grammar_explanation,
        "visual_breakdown": visual,
        "dopamine_reward": random.choice(DOPAMINE_POOL),
        "acceptable_answers": acceptable,
        "native_word": native_word,
        "target_translation": target_translation,
        "mastery_hint": "Gender comes from the noun — memorise pairs with articles.",
        "qa_passed": True,
        "attempts": 1,
        "source_unit": unit["id"],
    }
