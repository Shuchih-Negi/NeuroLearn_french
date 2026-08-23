"""
backend/exercise_cache.py — LRU+TTL cache for generated exercises.

Enables the two-tier latency story:
  • cache hit  → serve in <100 ms (no Gemini round trip)
  • cache miss → generate, then background-prefetch the next items

Keyed by (skill, difficulty, exercise_type, attention_state) — attention
state is included because it changes exercise style. Inflight guards prevent
duplicate concurrent prefetches for the same key.
"""

import threading
import time
from collections import deque
from typing import Deque, Dict, Optional, Set, Tuple

from backend.config import CACHE_MAX_SIZE, CACHE_TTL_S


def make_key(skill_tag: str, difficulty: int, exercise_type: str,
             attention_state: str) -> str:
    return f"{skill_tag}|d{difficulty}|{exercise_type}|{attention_state}"


class ExerciseCache:
    def __init__(self, max_size: int = CACHE_MAX_SIZE, ttl_s: float = CACHE_TTL_S):
        self._max_size = max_size
        self._ttl = ttl_s
        self._lock = threading.Lock()
        self._buckets: Dict[str, Deque] = {}
        self._inflight: Set[str] = set()
        self.hits = 0
        self.misses = 0

    # ── reads ────────────────────────────────────────────────────────────────
    def get(self, key: str, exclude_stems: Tuple[str, ...] = ()) -> Optional[Dict]:
        now = time.time()
        with self._lock:
            bucket = self._buckets.get(key)
            if not bucket:
                self.misses += 1
                return None
            while bucket:
                ts, packet = bucket.popleft()
                if now - ts > self._ttl:
                    continue
                if packet.get("question") in exclude_stems:
                    continue
                self.hits += 1
                return dict(packet)
            self.misses += 1
            return None

    # ── writes ───────────────────────────────────────────────────────────────
    def put(self, key: str, packet: Dict) -> None:
        with self._lock:
            bucket = self._buckets.setdefault(key, deque())
            bucket.append((time.time(), dict(packet)))
            self._evict_locked()

    def _evict_locked(self) -> None:
        now = time.time()
        total = 0
        for key in list(self._buckets.keys()):
            bucket = self._buckets[key]
            while bucket and now - bucket[0][0] > self._ttl:
                bucket.popleft()
            total += len(bucket)
            if not bucket:
                del self._buckets[key]
        while total > self._max_size:
            oldest_key = min(self._buckets,
                             key=lambda k: self._buckets[k][0][0],
                             default=None)
            if oldest_key is None:
                break
            self._buckets[oldest_key].popleft()
            total -= 1
            if not self._buckets[oldest_key]:
                del self._buckets[oldest_key]

    # ── inflight guard ───────────────────────────────────────────────────────
    def try_begin_prefetch(self, key: str) -> bool:
        with self._lock:
            pending = sum(len(b) for b in self._buckets.values())
            if key in self._inflight or pending >= self._max_size:
                return False
            self._inflight.add(key)
            return True

    def end_prefetch(self, key: str) -> None:
        with self._lock:
            self._inflight.discard(key)

    # ── introspection ────────────────────────────────────────────────────────
    def stats(self) -> Dict:
        with self._lock:
            total = self.hits + self.misses
            return {
                "entries": sum(len(b) for b in self._buckets.values()),
                "keys": len(self._buckets),
                "inflight": len(self._inflight),
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate": round(self.hits / total, 3) if total else 0.0,
            }

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()
            self._inflight.clear()
            self.hits = 0
            self.misses = 0


exercise_cache = ExerciseCache()
