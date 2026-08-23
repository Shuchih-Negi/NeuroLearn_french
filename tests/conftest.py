"""
Test bootstrap: force offline mode and isolate the test DB BEFORE the app
module (and its config) is imported anywhere.
"""

import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.pop("GEMINI_API_KEY", None)          # offline fallback paths only
os.environ["NLP_DISABLE_SEMANTIC"] = "1"        # skip sentence-transformer load
os.environ["EXERCISE_PREFETCH"] = "0"           # deterministic tests
os.environ["NEUROLEARN_DB_PATH"] = str(ROOT / "data" / "test_neurolearn.db")

# Fresh DB per test run
_db = os.environ["NEUROLEARN_DB_PATH"]
for suffix in ("", "-wal", "-shm"):
    p = pathlib.Path(_db + suffix)
    if p.exists():
        p.unlink()
