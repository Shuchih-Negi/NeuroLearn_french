"""
backend/gemini_client.py — structured-output Gemini client (google-genai SDK).

Features
────────
• Native JSON mode (response_mime_type="application/json") → no regex scraping
• Model fallback chain: GEMINI_MODEL → GEMINI_FALLBACK_MODEL, auto-resolves
  once and sticks (handles accounts/regions without the primary model)
• Latency + error recording into MetricsStore
• Raises GeminiUnavailable on total failure so callers can fall back to
  curriculum content instead of 500-ing

All calls are synchronous; run them from sync FastAPI endpoints (threadpool)
or via asyncio.to_thread.
"""

import threading
import time
from typing import Any, Dict, Optional

from google import genai
from google.genai import types

from backend.config import API_KEY, MODEL_CANDIDATES
from backend.metrics_store import metrics


class GeminiUnavailable(RuntimeError):
    """Raised when every configured Gemini model fails."""


_client: Optional[genai.Client] = None
_client_lock = threading.Lock()
_resolved_model = MODEL_CANDIDATES[0]


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = genai.Client(api_key=API_KEY)
    return _client


def _is_model_missing(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(sig in msg for sig in (
        "404", "not found", "not supported", "unsupported",
        "does not exist", "is not available", "model_not_found",
    ))


def resolved_model() -> str:
    return _resolved_model


def generate_json(prompt: str, *, temperature: float = 0.7,
                  kind: str = "misc") -> Dict:
    """
    Call Gemini and return parsed JSON. Tries the resolved model first, then
    the rest of the fallback chain. Records latency per call.
    """
    global _resolved_model
    candidates = [_resolved_model] + [m for m in MODEL_CANDIDATES
                                      if m != _resolved_model]

    last_exc: Optional[Exception] = None
    for name in candidates:
        t0 = time.perf_counter()
        try:
            resp = _get_client().models.generate_content(
                model=name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    response_mime_type="application/json",
                ),
            )
            duration_ms = (time.perf_counter() - t0) * 1000.0
            text = resp.text or ""
            start, end = text.find("{"), text.rfind("}")
            if start < 0 or end <= start:
                raise ValueError("Model returned no JSON object")
            data = json_loads(text[start:end + 1])
            metrics.record_gemini(name, kind, duration_ms, ok=True)
            if name != _resolved_model:
                _resolved_model = name
            return data
        except Exception as exc:  # noqa: BLE001 — deliberate chain walk
            duration_ms = (time.perf_counter() - t0) * 1000.0
            metrics.record_gemini(name, kind, duration_ms, ok=False)
            last_exc = exc
            continue

    raise GeminiUnavailable(f"All Gemini models failed: {last_exc}")


def json_loads(text: str) -> Dict:
    import json
    return json.loads(text)
