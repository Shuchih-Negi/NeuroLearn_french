"""Smoke tests for the French Edition API — run fully offline."""

import json

import pytest
from fastapi.testclient import TestClient

from backend.app import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


QUESTION_BODY = {
    "character": "Luna",
    "topic": "greetings",
    "skill_focus": "social_phrases",
    "difficulty": 1,
    "attention_state": "Focused",
    "attention_confidence": 0.9,
    "question_number": 1,
    "total_questions": 10,
    "student_id": "student_test",
}


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["ai_enabled"] is False


def test_languages_catalogue(client):
    r = client.get("/api/lang/languages")
    assert r.status_code == 200
    data = r.json()
    codes = [l["code"] for l in data["languages"]]
    assert "fr" in codes
    assert "multiple_choice_vocab" in data["exercise_types"]
    assert "social_phrases" in data["skill_tags"]


def test_curriculum(client):
    r = client.get("/api/lang/curriculum")
    assert r.status_code == 200
    units = r.json()["units"]
    assert len(units) >= 8
    assert all(u["vocab_count"] > 0 for u in units)


def test_next_question_fallback(client):
    r = client.post("/api/lang/next_question", json=QUESTION_BODY)
    assert r.status_code == 200
    data = r.json()
    assert len(data["options"]) == 4
    assert 0 <= data["correct_index"] <= 3
    assert data["meta"]["source"] == "fallback"
    assert data["meta"]["latency_ms"] < 1000
    assert data["skill_tag"]
    assert data["dopamine_reward"]


def test_progress_mastery_dashboard_flow(client):
    body = {
        **QUESTION_BODY,
        "skill_tag": "social_phrases",
        "correct": True,
        "response_time": 3.2,
        "xp_earned": 25,
        "section_id": "sec_t1",
        "question_number": 1,
        "total_questions": 10,
    }
    r = client.post("/api/lang/progress/update", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert 0 < data["skill_mastery"] <= 1
    assert data["total_xp"] >= 25
    assert "social_phrases" in data["mastery_scores"]

    r = client.get("/api/lang/mastery/student_test")
    assert r.status_code == 200
    skills = r.json()["skills"]
    assert skills["social_phrases"]["interactions"] >= 1

    r = client.get("/api/lang/dashboard/student_test")
    assert r.status_code == 200
    dash = r.json()
    assert dash["total_answered"] >= 1
    assert "focus_rate" in dash["adhd_insights"]


def test_validate_exact_match(client):
    r = client.post("/api/lang/validate", json={
        "learner_answer": "Bonjour",
        "correct_answer": "bonjour",
        "acceptable_answers": ["salut"],
        "target_language": "fr",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["is_correct"] is True
    assert data["method"] == "exact"


def test_validate_accepts_variant_and_flags_accent(client):
    r = client.post("/api/lang/validate", json={
        "learner_answer": "cafe",
        "correct_answer": "café",
        "acceptable_answers": [],
        "target_language": "fr",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["is_correct"] is True
    assert data["error_type"] == "missing_accent"


def test_research_stats_and_export(client):
    r = client.get("/api/research/stats")
    assert r.status_code == 200
    stats = r.json()
    assert stats["total_interactions"] >= 1

    r = client.get("/api/research/export?format=jsonl")
    assert r.status_code == 200
    lines = [json.loads(l) for l in r.text.strip().splitlines()]
    assert lines and lines[0]["student_id"] == "student_test"

    r = client.get("/api/research/export?format=csv")
    assert r.status_code == 200
    assert "student_id" in r.text.splitlines()[0]


def test_metrics_endpoint(client):
    r = client.get("/api/metrics")
    assert r.status_code == 200
    data = r.json()
    assert any(k.startswith("GET /api/") for k in data["requests"])
    assert "hit_rate" in data["cache"]
    assert "resolved_model" in data["gemini"]


def test_story_offline_fallback(client):
    r = client.post("/api/lang/story/generate", json={
        "character": "Luna", "topic": "greetings", "target_language": "fr",
        "difficulty": 1, "learner_age": 12,
    })
    assert r.status_code == 200
    assert "title" in r.json()


def test_quest_fallback_steps(client):
    r = client.post("/api/lang/quest/generate", json={
        "character": "Luna", "topic": "greetings", "target_language": "fr",
        "total_questions": 5, "learner_age": 12,
    })
    assert r.status_code == 200
    quest = r.json()
    assert len(quest["steps"]) == 5
    assert all(s["location"] for s in quest["steps"])
