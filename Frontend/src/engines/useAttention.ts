/**
 * useAttention — React hook wiring together:
 *   1. Browser eye tracking  (engines/eyeTracking.ts) — opt-in
 *   2. Behavioral classifier (engines/attentionModel.ts)
 *   3. Fusion engine         (engines/attentionModel.ts)
 *
 *   const { eyeActive, startEyeTracking, computeAttention } = useAttention();
 *   const result = computeAttention({ responseTime, correct, ... });
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { EyeTracker, type EyeMetrics } from "./eyeTracking";
import {
  detectAttentionFromBehavior,
  fuseAttentionStates,
  type AttentionSignal,
  type EyeSnapshot,
} from "./attentionModel";

export function useAttention() {
  const trackerRef = useRef<EyeTracker | null>(null);
  const [eyeActive, setEyeActive] = useState(false);
  const [eyeState, setEyeState] = useState<EyeSnapshot | null>(null);
  const [eyeMetrics, setEyeMetrics] = useState<EyeMetrics | null>(null);
  const [attentionState, setAttentionState] = useState<AttentionSignal>({
    state: "Focused",
    confidence: 0.9,
    reasons: [],
  });

  /**
   * Initialize eye tracker & camera. Call from a user gesture (permission UX).
   * Returns true if successfully started.
   */
  const startEyeTracking = useCallback(async (): Promise<boolean> => {
    if (trackerRef.current) return true; // already running

    const tracker = new EyeTracker(30);
    const initOk = await tracker.init();
    if (!initOk) {
      console.warn("[useAttention] Eye tracker init failed");
      return false;
    }

    const camOk = await tracker.startCamera();
    if (!camOk) {
      console.warn("[useAttention] Camera access denied");
      return false;
    }

    tracker.onResult(({ state, confidence, metrics }) => {
      setEyeState({ state, confidence });
      setEyeMetrics(metrics);
    });

    trackerRef.current = tracker;
    setEyeActive(true);
    return true;
  }, []);

  /**
   * Compute fused attention state from behavioral signals + eye tracking.
   * Call after each answer submission.
   */
  const computeAttention = useCallback(
    ({
      responseTime,
      correct,
      retries = 0,
      recentErrors = 0,
      idleTime = 0,
    }: {
      responseTime: number;
      correct: boolean;
      retries?: number;
      recentErrors?: number;
      idleTime?: number;
    }): AttentionSignal => {
      // 1. Behavioral classification
      const behavioral = detectAttentionFromBehavior({
        responseTime,
        idleTime,
        correct,
        retries,
        recentErrors,
      });

      // 2. Fuse with eye tracking (if active)
      const fused = fuseAttentionStates(eyeState, behavioral);

      setAttentionState(fused);
      return fused;
    },
    [eyeState]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (trackerRef.current) {
        trackerRef.current.stop();
        trackerRef.current = null;
      }
    };
  }, []);

  return {
    eyeActive,
    eyeState,
    eyeMetrics,
    attentionState,
    computeAttention,
    startEyeTracking,
  };
}
