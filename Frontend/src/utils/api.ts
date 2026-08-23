/**
 * Typed API client — the ONLY place the frontend talks to the backend.
 * No secrets here by design; all AI calls are proxied server-side.
 */

const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

/** Direct download links for dataset exports (Data Lab). */
export function researchExportUrl(
  kind: "interactions" | "labels",
  format: "csv" | "jsonl"
): string {
  return `${BASE}/research/export?kind=${kind}&format=${format}`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${path} failed: ${err}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} failed`);
  return res.json() as Promise<T>;
}

// ── Shared types ──────────────────────────────────────────────────────────────

export interface EyeMetricsPayload {
  blink_rate?: number;
  pupil_dilation?: number;
  fixation_duration?: number;
  saccade_rate?: number;
  gaze_stability?: number;
}

export interface QuestionMeta {
  source: string;
  cache_hit: boolean;
  latency_ms: number;
  model: string;
}

export interface QuestionPacket {
  question: string;
  options: string[];
  correct_index: number;
  /** Legacy alias used by some fallback paths */
  correctIndex?: number;
  explanation: string;
  difficulty: number;
  hints?: string[] | Record<string, string>;
  state_used?: string;
  skill_tag?: string;
  exercise_type?: string;
  grammar_explanation?: string;
  visual_breakdown?: string;
  dopamine_reward?: string;
  acceptable_answers?: string[];
  native_word?: string;
  target_translation?: string;
  mastery_hint?: string;
  meta?: QuestionMeta;
}

export interface LangStory {
  title: string;
  story: string;
  key_words: Array<{ word: string; meaning: string; pronunciation?: string; example?: string }>;
  comprehension_question?: string;
  comprehension_answer?: string;
  language_tip?: string;
}

export interface QuestStep {
  step_number: number;
  location: string;
  scene: string;
  task_hint: string;
}

export interface Quest {
  quest_title: string;
  quest_intro: string;
  villain_or_goal?: string;
  steps: QuestStep[];
}

export interface SessionFeedback {
  message: string;
  skill_note?: string;
  next_step?: string;
  review_skills?: string[];
  xp_earned?: number;
  rating?: string;
  encouragement_quote?: string;
}

export interface ValidationResult {
  is_correct: boolean;
  is_partial: boolean;
  error_type: string;
  score: number;
  recast: string;
  method: string;
}

interface EyeBody {
  eye_metrics?: EyeMetricsPayload;
}

function eyeBody(eyeMetrics: EyeMetricsPayload | null | undefined): EyeBody {
  if (eyeMetrics && typeof eyeMetrics === "object") {
    return {
      eye_metrics: {
        blink_rate: eyeMetrics.blink_rate,
        pupil_dilation: eyeMetrics.pupil_dilation,
        fixation_duration: eyeMetrics.fixation_duration,
        saccade_rate: eyeMetrics.saccade_rate,
        gaze_stability: eyeMetrics.gaze_stability,
      },
    };
  }
  return {};
}

// ═══════════════════════════════════════════════════════════
// Language Learning API (/api/lang/*)
// ═══════════════════════════════════════════════════════════

export async function generateLangStory(params: {
  character: string;
  topic: string;
  targetLanguage?: string;
  difficulty?: number;
  learnerAge?: number;
}): Promise<LangStory> {
  const { character, topic, targetLanguage = "fr", difficulty = 1, learnerAge = 12 } = params;
  return post("/lang/story/generate", {
    character,
    topic,
    target_language: targetLanguage,
    difficulty,
    learner_age: learnerAge,
  });
}

export async function generateQuest(params: {
  character: string;
  topic: string;
  targetLanguage?: string;
  totalQuestions?: number;
  learnerAge?: number;
}): Promise<Quest> {
  const { character, topic, targetLanguage = "fr", totalQuestions = 10, learnerAge = 12 } = params;
  return post("/lang/quest/generate", {
    character,
    topic,
    target_language: targetLanguage,
    total_questions: totalQuestions,
    learner_age: learnerAge,
  });
}

export async function validateLangAnswer(params: {
  learnerAnswer: string;
  correctAnswer: string;
  acceptableAnswers?: string[];
  targetLanguage?: string;
}): Promise<ValidationResult> {
  const { learnerAnswer, correctAnswer, acceptableAnswers = [], targetLanguage = "fr" } = params;
  return post("/lang/validate", {
    learner_answer: learnerAnswer,
    correct_answer: correctAnswer,
    acceptable_answers: acceptableAnswers,
    target_language: targetLanguage,
  });
}

export async function generateLangQuestion(params: {
  character: string;
  topic: string;
  targetLanguage?: string;
  difficulty?: number;
  attentionState?: string;
  attentionConfidence?: number;
  eyeMetrics?: EyeMetricsPayload | null;
  recentStates?: string[];
  lastCorrect?: boolean | null;
  lastRt?: number | null;
  sessionAccuracy?: number;
  previousQuestions?: string[];
  questionNumber?: number;
  totalQuestions?: number;
  skillFocus?: string;
  exerciseType?: string | null;
  learnerAge?: number;
  studentId?: string;
  sessionFatigue?: number;
  questStep?: { step_number?: number; location?: string; scene?: string; task_hint?: string } | null;
}): Promise<QuestionPacket> {
  const {
    character,
    topic,
    targetLanguage = "fr",
    difficulty = 1,
    attentionState = "Focused",
    attentionConfidence = 0.5,
    eyeMetrics = null,
    recentStates = [],
    lastCorrect = null,
    lastRt = null,
    sessionAccuracy = 0,
    previousQuestions = [],
    questionNumber = 1,
    totalQuestions = 10,
    skillFocus = "vocabulary_basic",
    exerciseType = null,
    learnerAge = 12,
    studentId = "default",
    sessionFatigue = 0,
    questStep = null,
  } = params;

  return post("/lang/next_question", {
    character,
    topic,
    target_language: targetLanguage,
    difficulty,
    attention_state: attentionState,
    attention_confidence: attentionConfidence,
    recent_states: recentStates,
    last_correct: lastCorrect,
    last_rt: lastRt,
    session_accuracy: sessionAccuracy,
    previous_questions: previousQuestions,
    question_number: questionNumber,
    total_questions: totalQuestions,
    skill_focus: skillFocus,
    exercise_type: exerciseType,
    learner_age: learnerAge,
    student_id: studentId,
    session_fatigue: sessionFatigue,
    quest_step: questStep,
    ...eyeBody(eyeMetrics),
  });
}

export async function generateLangFeedback(params: {
  character: string;
  totalCorrect: number;
  totalQuestions: number;
  targetLanguage?: string;
  topic: string;
  attentionHistory?: string[];
  skillResults?: Record<string, number>;
  studentId?: string;
}): Promise<SessionFeedback> {
  return post("/lang/feedback/generate", {
    character: params.character,
    total_correct: params.totalCorrect,
    total_questions: params.totalQuestions,
    target_language: params.targetLanguage ?? "fr",
    topic: params.topic,
    attention_history: params.attentionHistory ?? [],
    skill_results: params.skillResults ?? {},
    student_id: params.studentId ?? "default",
  });
}

export interface ProgressResponse {
  status: string;
  section: { answered: number; correct: number; accuracy: number; current_streak: number; best_streak: number };
  total_xp: number;
  skill_mastery: number;
  next_review_in_days: number;
  mastery_scores: Record<string, number>;
}

export async function updateLangProgress(params: {
  studentId?: string;
  skillTag: string;
  correct: boolean;
  responseTime?: number;
  attentionState?: string;
  xpEarned?: number;
  exerciseType?: string;
  targetLanguage?: string;
  sectionId?: string;
}): Promise<ProgressResponse> {
  return post("/lang/progress/update", {
    student_id: params.studentId ?? "default",
    skill_tag: params.skillTag,
    correct: params.correct,
    response_time: params.responseTime ?? 0,
    attention_state: params.attentionState ?? "Focused",
    xp_earned: params.xpEarned ?? 0,
    exercise_type: params.exerciseType ?? "multiple_choice_vocab",
    target_language: params.targetLanguage ?? "fr",
    section_id: params.sectionId ?? "default_section",
  });
}

 
export async function getLangDashboard(studentId = "default"): Promise<any> {
  return get(`/lang/dashboard/${studentId}`);
}

 
export async function getLangMastery(studentId = "default"): Promise<any> {
  return get(`/lang/mastery/${studentId}`);
}

// ═══════════════════════════════════════════════════════════
// Research Mode API (/api/research/*) — dataset contribution
// ═══════════════════════════════════════════════════════════

export async function setResearchConsent({
  studentId = "default",
  accepted,
}: {
  studentId?: string;
  accepted: boolean;
}): Promise<{ status: string; consent: { accepted: boolean } }> {
  return post("/research/consent", { student_id: studentId, accepted });
}

export async function getResearchStatus(
  studentId = "default"
): Promise<{ consent_accepted: boolean; interactions_logged: number; labels_logged: number }> {
  return get(`/research/status/${studentId}`);
}

export interface ResearchStats {
  total_interactions: number;
  distinct_students: number;
  per_skill: Record<string, number>;
  per_exercise_type: Record<string, number>;
  per_attention_state: Record<string, number>;
  overall_accuracy: number | null;
  consented_students: number;
  labels: {
    total: number;
    per_reported_state: Record<string, number>;
    detected_agreement_rate: number | null;
  };
}

export async function getResearchStats(): Promise<ResearchStats> {
  return get("/research/stats");
}

export async function submitAttentionLabel(params: {
  studentId?: string;
  sectionId?: string;
  questionNumber?: number;
  reportedState: string;
  detectedState?: string;
  detectedConfidence?: number;
}): Promise<{ status: string; label_id: number }> {
  return post("/research/label", {
    student_id: params.studentId ?? "default",
    section_id: params.sectionId ?? "default_section",
    question_number: params.questionNumber ?? 1,
    reported_state: params.reportedState,
    detected_state: params.detectedState ?? "",
    detected_confidence: params.detectedConfidence ?? 0.0,
  });
}
