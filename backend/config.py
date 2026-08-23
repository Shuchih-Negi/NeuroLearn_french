"""
backend/config.py — environment-driven configuration.

All tunables come from env vars with sane defaults so the server boots
with zero configuration (fallback-only mode when GEMINI_API_KEY is absent).
"""

import os

# ── Gemini ────────────────────────────────────────────────────────────────
API_KEY = os.environ.get("GEMINI_API_KEY", "")

MODEL_PRIMARY = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
MODEL_FALLBACK = os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-2.5-flash")
MODEL_CANDIDATES = [m for m in dict.fromkeys([MODEL_PRIMARY, MODEL_FALLBACK]) if m]

# ── Server ────────────────────────────────────────────────────────────────
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]

# ── Persistence ───────────────────────────────────────────────────────────
DB_PATH = os.environ.get("NEUROLEARN_DB_PATH",
                         os.path.join("data", "neurolearn.db"))

CURRICULUM_PATH = os.environ.get(
    "NEUROLEARN_CURRICULUM",
    os.path.join(os.path.dirname(__file__), "data", "fr_curriculum.json"),
)

MASTERY_MODEL_PATH = os.environ.get("MASTERY_MODEL_PATH",
                                    os.path.join("models", "lstm_mastery.pt"))

# ── Latency controls ──────────────────────────────────────────────────────
CACHE_MAX_SIZE = int(os.environ.get("EXERCISE_CACHE_SIZE", "128"))
CACHE_TTL_S = float(os.environ.get("EXERCISE_CACHE_TTL_S", "600"))
PREFETCH_ENABLED = os.environ.get("EXERCISE_PREFETCH", "1") == "1"
PREFETCH_DEPTH = int(os.environ.get("EXERCISE_PREFETCH_DEPTH", "2"))
FASTPATH_CONF_THRESHOLD = float(os.environ.get("FASTPATH_CONF_THRESHOLD", "0.6"))

# ── NLP ───────────────────────────────────────────────────────────────────
SEMANTIC_VALIDATION_ENABLED = os.environ.get("NLP_DISABLE_SEMANTIC", "") != "1"
