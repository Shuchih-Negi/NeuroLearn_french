/**
 * Rule-based behavioral attention classifier + confidence-weighted fusion.
 * Mirrors the backend LSTM pipeline logic for zero-latency client use.
 * Fuses eye tracking + behavioral signals (eye weight 0.4, threshold 0.55).
 */

export type AttentionStateName = "Focused" | "Drifting" | "Impulsive" | "Overwhelmed";

export interface AttentionSignal {
  state: AttentionStateName;
  confidence: number;
  reasons?: string[];
}

export interface BehaviorInput {
  responseTime: number;
  idleTime?: number;
  correct: boolean;
  retries?: number;
  recentErrors?: number;
}

export function detectAttentionFromBehavior({
  responseTime,
  idleTime = 0,
  correct,
  retries = 0,
  recentErrors = 0,
}: BehaviorInput): AttentionSignal {
  const reasons: string[] = [];

  if (responseTime < 2.2) reasons.push("Super fast answer");
  if (responseTime > 12) reasons.push("Slow answer");
  if (idleTime > 7) reasons.push("Idle spike");
  if (retries >= 2) reasons.push("Many retries");
  if (!correct) reasons.push("Wrong answer");
  if (recentErrors >= 2) reasons.push("Error burst");

  // Classification rules (from LSTM rule-based fallback)
  if (responseTime < 2.2 && !correct) return { state: "Impulsive", reasons, confidence: 0.85 };
  if (recentErrors >= 2 && responseTime < 4) return { state: "Impulsive", reasons, confidence: 0.8 };
  if (idleTime > 7 || responseTime > 12) return { state: "Drifting", reasons, confidence: 0.8 };
  if (retries >= 2 && !correct) return { state: "Overwhelmed", reasons, confidence: 0.85 };
  if (!correct && responseTime > 20) return { state: "Overwhelmed", reasons, confidence: 0.8 };
  return { state: "Focused", reasons, confidence: 0.9 };
}

export interface EyeSnapshot {
  state: AttentionStateName;
  confidence: number;
}

const STATES: AttentionStateName[] = ["Focused", "Drifting", "Impulsive", "Overwhelmed"];
const EYE_WEIGHT = 0.4;
const EYE_CONF_THRESHOLD = 0.55;

/**
 * Fusion engine: combines eye tracking + behavioral signals.
 * Eye data only participates above the confidence threshold.
 */
export function fuseAttentionStates(
  eyeState: EyeSnapshot | null,
  behaviorState: AttentionSignal
): AttentionSignal {
  if (!eyeState || eyeState.confidence < EYE_CONF_THRESHOLD) {
    return behaviorState;
  }

  const eyeScore: Record<string, number> = {};
  const behScore: Record<string, number> = {};
  const fused: Record<string, number> = {};

  STATES.forEach((s) => {
    eyeScore[s] = s === eyeState.state ? eyeState.confidence : 0;
    behScore[s] = s === behaviorState.state ? behaviorState.confidence : 0;
    fused[s] = EYE_WEIGHT * eyeScore[s] + (1 - EYE_WEIGHT) * behScore[s];
  });

  let bestState: AttentionStateName = behaviorState.state;
  let bestScore = -1;
  STATES.forEach((s) => {
    if (fused[s] > bestScore) {
      bestScore = fused[s];
      bestState = s;
    }
  });

  return {
    state: bestState,
    confidence: Math.max(0, bestScore),
    reasons: [...(behaviorState.reasons || [])],
  };
}
