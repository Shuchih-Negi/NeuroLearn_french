"""
backend/metrics_store.py — lightweight in-process latency/usage metrics.

Thread-safe, bounded memory. Exposes p50/p95 per route, Gemini call stats,
and powers GET /api/metrics. Swap for Prometheus later without changing
call sites.
"""

import threading
import time
from collections import deque
from typing import Dict, List, Optional


def _percentile(sorted_values: List[float], pct: float) -> Optional[float]:
    if not sorted_values:
        return None
    idx = min(len(sorted_values) - 1, max(0, int(round((pct / 100.0) * (len(sorted_values) - 1)))))
    return round(sorted_values[idx], 2)


class MetricsStore:
    def __init__(self, maxlen: int = 512):
        self._lock = threading.Lock()
        self._requests: Dict[str, deque] = {}
        self._gemini: deque = deque(maxlen=maxlen)
        self.start_ts = time.time()

    # ── recording ────────────────────────────────────────────────────────────
    def record_request(self, route_key: str, duration_ms: float) -> None:
        with self._lock:
            bucket = self._requests.setdefault(route_key, deque(maxlen=512))
            bucket.append(duration_ms)

    def record_gemini(self, model: str, kind: str, duration_ms: float, ok: bool = True) -> None:
        with self._lock:
            self._gemini.append({"model": model, "kind": kind,
                                 "ms": round(duration_ms, 2), "ok": ok})

    # ── reporting ────────────────────────────────────────────────────────────
    def _route_summary(self, samples: deque) -> Dict:
        vals = sorted(samples)
        return {
            "count": len(vals),
            "p50_ms": _percentile(vals, 50),
            "p95_ms": _percentile(vals, 95),
            "max_ms": round(vals[-1], 2) if vals else None,
        }

    def snapshot(self) -> Dict:
        with self._lock:
            requests = {k: self._route_summary(v) for k, v in self._requests.items()}
            gem_calls = list(self._gemini)

        gem_ok = sorted(g["ms"] for g in gem_calls if g["ok"])
        by_kind: Dict[str, List[float]] = {}
        errors = 0
        for g in gem_calls:
            if not g["ok"]:
                errors += 1
            else:
                by_kind.setdefault(g["kind"], []).append(g["ms"])

        kind_stats = {
            k: {"count": len(v), "p50_ms": _percentile(sorted(v), 50),
                "p95_ms": _percentile(sorted(v), 95)}
            for k, v in by_kind.items()
        }
        models = sorted({g["model"] for g in gem_calls})
        return {
            "uptime_s": round(time.time() - self.start_ts, 1),
            "requests": requests,
            "gemini": {
                "total_calls": len(gem_calls),
                "errors": errors,
                "p50_ms": _percentile(gem_ok, 50),
                "p95_ms": _percentile(gem_ok, 95),
                "by_kind": kind_stats,
                "models_seen": models,
            },
        }

    def reset(self) -> None:
        with self._lock:
            self._requests.clear()
            self._gemini.clear()
            self.start_ts = time.time()


metrics = MetricsStore()
