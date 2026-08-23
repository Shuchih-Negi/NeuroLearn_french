# NeuroLearn — Neuro-Adaptive French Learning for ADHD Students 🇫🇷

Adaptive, gamified French tutor that reads the learner's **attention state in real time**
(Focused / Drifting / Impulsive / Overwhelmed) from webcam eye-tracking + behavioural
signals, then generates exercises matched to that state via a multi-agent Gemini pipeline.

> ⚠️ Active rebuild in progress — see [Roadmap](#roadmap). Phase 0 (security +
> dead-code purge) and Phase 1 (modular backend, caching, latency observability)
> are done; dataset collection mode and the TS frontend land in Phases 2–4.

---

## How it works

```
Browser (React + Vite + TS)              FastAPI backend                     Data / ML
┌────────────────────────────┐   ┌───────────────────────────────┐   ┌──────────────────┐
│ Pixel-art game UI          │   │ /api/lang/*  question loop    │   │ Mastery tracking │
│ MediaPipe eye tracking     │──▶│ 5-agent Gemini pipeline       │◀──│ SM-2 scheduling  │
│ (local, opt-in)            │   │ content cache + prefetch      │   │ DKT LSTM         │
│ Attention fusion           │   │ NLP answer validation         │   │ NLP validator    │
└────────────────────────────┘   └───────────────────────────────┘   └──────────────────┘
```

**Research foundation:** Krashen's Comprehensible Input (i+1), Swain's Output Hypothesis,
Lyster & Ranta recast feedback, Ebbinghaus/Wozniak spaced repetition (SM-2), Mayer's
Multimedia Learning, and ADHD-specific findings on cognitive load and reward timing
(Baddeley & Hitch; Toplak et al.; Lam & Muldner).

### The 5-agent pipeline (per question)
1. **ReasoningAgent** — attention + mastery → difficulty/skill/exercise decision
2. **LangQuestionAgent** — generates the exercise (7 types: MCQ vocab, fill-blank, translation…)
3. **StoryAgent** — wraps it in a quest narrative for the chosen character
4. **QAAgent** — validates linguistic correctness + ADHD safety
5. **HintAgent** — two graduated, shame-free hints

---

## Project structure

```
NeuroLearn/
├── agents/moderator.py        # Multi-agent orchestrator (5 Gemini agents)
├── backend/
│   ├── app.py                 # FastAPI assembly + timing middleware
│   ├── config.py              # Env-driven configuration
│   ├── gemini_client.py       # JSON-mode client, model fallback chain
│   ├── exercise_cache.py      # LRU+TTL cache + prefetch guards (<100ms hits)
│   ├── progress.py            # SM-2 · EWMA · LSTM-blended mastery · analytics
│   ├── curriculum.py          # Offline French exercise bank (CEFR seed)
│   ├── data/fr_curriculum.json# Curated A0–A1 French content
│   ├── db.py                  # SQLite persistence (DKT-ready interactions)
│   ├── schemas.py             # Pydantic request models
│   └── routers/               # session · content · learning · research · metrics
├── ml/
│   ├── attention_model.py     # Behaviour+eye attention fusion (LSTM w/ rule fallback)
│   ├── lstm_mastery.py        # Deep Knowledge Tracing LSTM (per-skill mastery)
│   └── nlp_model.py           # Answer validation: exact→accent→edit-distance→semantic
├── ml_training/train_lstm.py  # DKT training pipeline
├── models/lstm_model.pt       # Trained weights
├── Frontend/                  # React 19 + Vite + Tailwind (pixel-art UI)
├── tests/test_api_smoke.py    # Offline API smoke suite (pytest)
└── requirements.txt
```

## Setup

```bash
# Backend
python -m venv venv && venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env                              # add your GEMINI_API_KEY
uvicorn backend.app:app --reload --port 8000

# Run offline smoke tests (no API key needed)
venv\Scripts\python -m pytest tests/ -q

# Frontend
cd Frontend
npm install
copy .env.example .env.local
npm run dev
```

## API overview

| Endpoint | Purpose |
|---|---|
| `POST /api/lang/next_question` | Adaptive question: cache → 5-agent pipeline → fast path → offline bank |
| `POST /api/lang/quest/generate` | Quest narrative arc for a session |
| `POST /api/lang/story/generate` | Immersion story (comprehensible input) |
| `GET  /api/lang/curriculum` | CEFR-tagged French unit map |
| `POST /api/lang/validate` | Free-text answer validation (NLP) |
| `POST /api/lang/progress/update` | Mastery update + SM-2 review + dataset write |
| `GET  /api/lang/dashboard/{id}` | Accuracy, streaks, mastery radar, ADHD insights |
| `GET  /api/lang/mastery/{id}` | Per-skill mastery state |
| `GET  /api/research/stats` | Dataset coverage dashboard |
| `GET  /api/research/export` | Interactions as JSONL / DKT-ready CSV |
| `GET  /api/metrics` | Latency p50/p95, Gemini stats, cache hit rate |

**Latency design:** served-from-cache answers return in single-digit ms; on a miss,
a fused single-call "fast path" generates the exercise and a background prefetcher
refills the cache for the next question.

## Roadmap

- [x] **Phase 0** — Security hardening & dead-code purge (math endpoints removed, keys server-side only)
- [x] **Phase 1** — Backend rebuild: routers, JSON-mode Gemini client w/ model fallback, LRU cache + prefetch, SQLite persistence, latency metrics
- [x] **Phase 2** — Dataset platform: consent-gated Research Mode, self-report attention labels every 3rd question, optional Supabase mirror, JSONL/CSV export ([dataset card](docs/dataset_card.md))
- [ ] **Phase 3** — ML showcase: train DKT on collected data, benchmarks vs EWMA/BKT baseline
- [ ] **Phase 4** — Frontend: TypeScript migration, pixel-art design system 2.0
- [ ] **Phase 5** — Docker, CI, evaluation notebooks

## Research Mode & your dataset 📊

NeuroLearn doubles as its own data-collection platform — the interaction dataset
nobody publishes for this domain gets built by simply playing the game:

1. **Consent first** — an explicit opt-in card (withdraw anytime); nothing is
   logged without it.
2. **Play normally** — every answer is written to SQLite in a DKT-ready schema
   (`skill_tag`, correctness, latency, hints, error type, attention snapshot).
3. **Label ground truth** — every 3rd question a one-tap chip asks *"How did
   that feel?"* → Focused / Drifting / Impulsive / Overwhelmed. These
   self-reports are the labels that train the attention classifier.
4. **Export & train** — `GET /api/research/export?kind=interactions|labels`
   returns JSONL/CSV ready for `ml_training/train_lstm.py`; `/api/research/stats`
   shows coverage and model–human agreement.

Optional durability: set `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` and run
`backend/data/supabase_schema.sql` — rows are mirrored asynchronously
(RLS-enabled, service-role writes only). See [docs/dataset_card.md](docs/dataset_card.md).

## Security note

All AI calls are proxied through the backend — no API keys ever ship to the browser.
Copy `.env.example` → `.env` (backend) and `Frontend/.env.example` → `.env.local`.

---

*Built for EdTech research, hackathons, and cognitive learning innovation.*
