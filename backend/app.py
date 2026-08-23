"""
backend/app.py — NeuroLearn French Edition (FastAPI assembly).

Run from anywhere:
    uvicorn backend.app:app --port 8000     # from the repo root
    uvicorn app:app --port 8000             # from inside backend/
Env: see .env.example (GEMINI_API_KEY, GEMINI_MODEL, …)

Structure:
    routers/session.py   /api/lang/next_question   (cache → pipeline/fast/fallback)
    routers/content.py   stories · quests · feedback · curriculum
    routers/learning.py  validate · progress · mastery · dashboard
    routers/research.py  dataset stats + export (DKT-ready)
    routers/metrics.py   latency p50/p95 + cache observability
"""

import logging
import re
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

# Make imports work regardless of the caller's working directory
_REPO_ROOT = str(Path(__file__).resolve().parent.parent)
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

import backend.db as db  # noqa: E402
import backend.gemini_client as gemini_client  # noqa: E402
from backend.config import API_KEY, CORS_ORIGINS  # noqa: E402
from backend.metrics_store import metrics  # noqa: E402
from backend.routers import content, health, learning, research, session  # noqa: E402
from backend.routers import metrics as metrics_router  # noqa: E402

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("neurolearn")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Silence benign google-genai SDK cleanup races (GC of sync-only clients
    # schedules aclose() on a loop where the async client was never opened).
    import asyncio

    def _filter_sdk_noise(loop, context):
        exc = context.get("exception")
        text = f"{exc or ''} {context.get('message', '')}"
        if "_async_httpx_client" in text or "BaseApiClient" in text:
            return
        loop.default_exception_handler(context)

    asyncio.get_running_loop().set_exception_handler(_filter_sdk_noise)

    db.init_db()
    logger.info("DB ready at %s", db.DB_PATH)
    if API_KEY:
        logger.info("Gemini configured — primary model: %s",
                    gemini_client.resolved_model())
    else:
        logger.warning("GEMINI_API_KEY not set — running on the offline curriculum bank")
    yield


app = FastAPI(
    title="NeuroLearn API — French Edition",
    description="Neuro-adaptive French learning for ADHD students",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - t0) * 1000.0
    route = request.scope.get("route")
    template = getattr(route, "path", None) or re.sub(
        r"/\d+", "/:id", request.url.path)
    metrics.record_request(f"{request.method} {template}", duration_ms)
    return response


for r in (health.router, session.router, content.router,
          learning.router, research.router, metrics_router.router):
    app.include_router(r)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
