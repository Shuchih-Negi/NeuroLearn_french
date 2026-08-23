"""
backend/routers/metrics.py — latency & cache observability.
"""

from fastapi import APIRouter

import backend.gemini_client as gemini_client
from backend.exercise_cache import exercise_cache
from backend.metrics_store import metrics

router = APIRouter(tags=["observability"])


@router.get("/api/metrics")
def get_metrics():
    snapshot = metrics.snapshot()
    snapshot["cache"] = exercise_cache.stats()
    snapshot["gemini"]["resolved_model"] = gemini_client.resolved_model()
    return snapshot
