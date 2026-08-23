const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${path} failed: ${err}`);
  }
  return res.json();
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} failed`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════
// Language Learning API (/api/lang/*)
// ═══════════════════════════════════════════════════════════

export async function generateLangStory({
  character,
  topic,
  targetLanguage = "fr",
  difficulty = 1,
  learnerAge = 12,
}) {
  return post("/lang/story/generate", {
    character,
    topic,
    target_language: targetLanguage,
    difficulty,
    learner_age: learnerAge,
  });
}

export async function generateQuest({
  character,
  topic,
  targetLanguage = "fr",
  totalQuestions = 10,
  learnerAge = 12,
}) {
  return post("/lang/quest/generate", {
    character,
    topic,
    target_language: targetLanguage,
    total_questions: totalQuestions,
    learner_age: learnerAge,
  });
}

export async function validateLangAnswer({
  learnerAnswer,
  correctAnswer,
  acceptableAnswers = [],
  targetLanguage = "fr",
}) {
  return post("/lang/validate", {
    learner_answer: learnerAnswer,
    correct_answer: correctAnswer,
    acceptable_answers: acceptableAnswers,
    target_language: targetLanguage,
  });
}

export async function generateLangQuestion({
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
}) {
  const body = {
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
  };
  if (eyeMetrics && typeof eyeMetrics === "object") {
    body.eye_metrics = {
      blink_rate: eyeMetrics.blink_rate,
      pupil_dilation: eyeMetrics.pupil_dilation,
      fixation_duration: eyeMetrics.fixation_duration,
      saccade_rate: eyeMetrics.saccade_rate,
      gaze_stability: eyeMetrics.gaze_stability,
    };
  }
  return post("/lang/next_question", body);
}

export async function generateLangFeedback({
  character,
  totalCorrect,
  totalQuestions,
  targetLanguage = "fr",
  topic,
  attentionHistory = [],
  skillResults = {},
  studentId = "default",
}) {
  return post("/lang/feedback/generate", {
    character,
    total_correct: totalCorrect,
    total_questions: totalQuestions,
    target_language: targetLanguage,
    topic,
    attention_history: attentionHistory,
    skill_results: skillResults,
    student_id: studentId,
  });
}

export async function updateLangProgress({
  studentId = "default",
  skillTag,
  correct,
  responseTime = 0,
  attentionState = "Focused",
  xpEarned = 0,
  exerciseType = "multiple_choice_vocab",
  targetLanguage = "fr",
  sectionId = "default_section",
}) {
  return post("/lang/progress/update", {
    student_id: studentId,
    skill_tag: skillTag,
    correct,
    response_time: responseTime,
    attention_state: attentionState,
    xp_earned: xpEarned,
    exercise_type: exerciseType,
    target_language: targetLanguage,
    section_id: sectionId,
  });
}

export async function getLangDashboard(studentId = "default") {
  return get(`/lang/dashboard/${studentId}`);
}

export async function getLangMastery(studentId = "default") {
  return get(`/lang/mastery/${studentId}`);
}
