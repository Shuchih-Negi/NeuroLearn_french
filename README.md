# NeuroLearn — Neuro-Adaptive French Learning for ADHD Students 🇫🇷

Adaptive, gamified French tutor that reads the learner's **attention state in real time**
(Focused / Drifting / Impulsive / Overwhelmed) from webcam eye-tracking + behavioural
signals, then generates exercises matched to that state via a multi-agent Gemini pipeline.

> ⚠️ Active rebuild in progress — see [Roadmap](#roadmap). Math-tutor legacy code was
> removed in Phase 0; Supabase persistence, dataset collection mode, and the new
> frontend land in Phases 1–4.

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
├── agents/moderator.py      # Multi-agent orchestrator (Gemini)
├── backend/app.py           # FastAPI server (/api/lang/*)
├── ml/
│   ├── attention_model.py   # Behaviour+eye attention fusion (LSTM w/ rule fallback)
│   ├── lstm_mastery.py      # Deep Knowledge Tracing LSTM (per-skill mastery)
│   └── nlp_model.py         # Answer validation: exact→accent→edit-distance→semantic
├── ml_training/train_lstm.py  # DKT training pipeline
├── models/lstm_model.pt     # Trained weights
├── Frontend/                # React 19 + Vite + Tailwind (pixel-art UI)
└── requirements.txt
```

## Setup

```bash
# Backend
python -m venv venv && venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env                              # add your GEMINI_API_KEY
uvicorn backend.app:app --reload --port 8000

# Frontend
cd Frontend
npm install
copy .env.example .env.local
npm run dev
```

## API overview

| Endpoint | Purpose |
|---|---|
| `POST /api/lang/next_question` | Adaptive question (full 5-agent pipeline) |
| `POST /api/lang/quest/generate` | Quest narrative arc for a session |
| `POST /api/lang/story/generate` | Immersion story (comprehensible input) |
| `POST /api/lang/validate` | Free-text answer validation (NLP) |
| `POST /api/lang/progress/update` | Mastery update + SM-2 review schedule |
| `GET  /api/lang/dashboard/{id}` | Accuracy, streaks, mastery radar, ADHD insights |
| `GET  /api/lang/mastery/{id}` | Per-skill mastery state |

## Roadmap

- [x] **Phase 0** — Security hardening & dead-code purge (math endpoints removed, keys server-side only)
- [ ] **Phase 1** — Backend rebuild: routers, structured Gemini output, caching + prefetch, latency metrics
- [ ] **Phase 2** — Dataset platform: research mode, self-report attention labels, CSV/JSONL export
- [ ] **Phase 3** — ML showcase: train DKT on collected data, benchmarks vs EWMA/BKT baseline
- [ ] **Phase 4** — Frontend: TypeScript migration, pixel-art design system 2.0
- [ ] **Phase 5** — Docker, CI, evaluation notebooks

## Security note

All AI calls are proxied through the backend — no API keys ever ship to the browser.
Copy `.env.example` → `.env` (backend) and `Frontend/.env.example` → `.env.local`.

---

*Built for EdTech research, hackathons, and cognitive learning innovation.*
