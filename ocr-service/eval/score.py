"""Compare a prediction with the answer key, field by field."""

from __future__ import annotations

import re

from rapidfuzz.distance import Levenshtein

from ocr.cleanup import clean


def norm(value, ftype: str) -> str | None:
    """Make two answers comparable: case, spacing and punctuation do not count."""
    if value is None:
        return None
    if isinstance(value, bool):
        return "yes" if value else "no"
    text = str(value)
    if ftype in ("date", "phone", "digits", "money", "year2", "email"):
        cleaned, _ = clean(ftype, text)
        text = cleaned or ""
    text = text.lower()
    if ftype == "email":
        return text
    text = re.sub(r"[^a-z0-9@/]+", " ", text).strip()
    return text or None


def cer(pred: str | None, truth: str | None) -> float:
    """Character error rate: edits needed / length of the truth (1.0 if one side is empty)."""
    if not pred and not truth:
        return 0.0
    if not pred or not truth:
        return 1.0
    return min(1.0, Levenshtein.distance(pred, truth) / max(1, len(truth)))


def compare(pred, truth, ftype: str) -> dict:
    p, t = norm(pred, ftype), norm(truth, ftype)
    return {
        "correct": p == t,
        "filled": t is not None,
        "cer": cer(p, t),
        "pred": pred,
        "truth": truth,
    }
