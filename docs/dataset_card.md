# NeuroLearn-FR Interactions Dataset — Dataset Card

An open, consent-gated dataset of **French language-learning interaction
sequences with self-reported attention-state labels**, collected from a live
neuro-adaptive tutoring platform designed for ADHD learners.

## Motivation

Adaptive tutors for ADHD learners need to predict transient attention states
(Focused / Drifting / Impulsive / Overwhelmed) to adjust exercise difficulty in
real time (Krashen's i+1; Toplak et al., 2013; Lam & Muldner, 2018). No public
dataset pairs French-learning interaction sequences with ground-truth attention
labels — this dataset fills that gap and powers the platform's Deep Knowledge
Tracing (Piech et al., 2015) and attention-classifier training.

## Composition

Two linked tables, exported via `GET /api/research/export`:

### `interactions` (one row per answered question)

| Column | Type | Description |
|---|---|---|
| `student_id` | string | Anonymous per-browser profile id |
| `skill_tag` | string | CEFR-mapped skill (`social_phrases`, `grammar_present`, …) |
| `exercise_type` | string | `multiple_choice_vocab`, `fill_in_the_blank`, … |
| `correctness` | 0/1 | Answer outcome |
| `time_taken_s` | float | Response latency |
| `hint_used` | 0/1 | Hint opened before answering |
| `attention_score` | float | Fused attention confidence at answer time |
| `error_type` | string | NLP classifier: `vocabulary`, `spelling`, `word_order`, `missing_accent`, … |
| `session_position`, `total_questions` | int | Position within session (fatigue proxy) |
| `learner_answer`, `expected_answer`, `question_text` | string | Content (French) |
| `section_id`, `target_language` | string | Session grouping; always `fr` |

### `attention_labels` (self-report ground truth)

One row per voluntary "How did that feel?" tap shown every 3rd question:

- `reported_state` ∈ {Focused, Drifting, Impulsive, Overwhelmed} — **label**
- `detected_state`, `detected_confidence` — model snapshot at label time
  (enables agreement analysis without joins)
- `source` = `self_report`

## Collection procedure

1. Learner opts into Research Mode via an explicit consent card (stored as
   `research_consent`; withdrawal supported at any time).
2. Normal gameplay continues unchanged; every answer is written through to
   SQLite (`backend/db.py`) and optionally mirrored to Supabase.
3. Every 3rd question, a non-blocking chip asks *"How did that feel?"*;
   skipping is one tap.

## Recommended splits & tasks

- **DKT mastery prediction** (`interactions`): next-question correctness given
  history — schema matches `ml_training/train_lstm.py`.
- **Attention classification** (`attention_labels` + behaviour features):
  4-class supervised task; report macro-F1 and per-class confusion.
- Suggest leave-one-student-out splits to test generalisation across learners.

## Limitations

- Self-report labels are subjective; `detected_agreement_rate` in `/stats`
  quantifies model–human alignment.
- Eye-tracking features are browser-side (MediaPipe FaceLandmarker) and only
  present when the learner grants webcam access.
- Sample skew: early collection is dominated by A0–A1 CEFR content.

## Access & ethics

- No PII is collected: profiles are random ids, no accounts/emails.
- Consent is revocable (`POST /api/research/consent {accepted:false}`).
- Export endpoints are read-only aggregations of locally stored data.

## Maintenance

- Hosted alongside the platform repo; regenerated on demand from the live API.
- Version: seed v1 (`backend/data/fr_curriculum.json` curriculum bank).
