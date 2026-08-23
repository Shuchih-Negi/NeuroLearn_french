"""backend/routers/health.py — liveness probe."""

from fastapi import APIRouter

import backend.gemini_client as gemini_client
from backend.config import API_KEY

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "NeuroLearn API — French Edition",
        "ai_enabled": bool(API_KEY),
        "model": gemini_client.resolved_model(),
    }
