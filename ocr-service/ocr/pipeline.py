"""Photos in, admission JSON out.

    result = extract([photo1_bytes, photo2_bytes, ...], reader)

result["data"] has the shape of templates/hera_admission_schema.json.
result["fields"][key] = {value, confidence, raw, valid, panel} for every field,
so the review screen can highlight the ones to check.
"""

from __future__ import annotations

import copy
import json
import time
from pathlib import Path

import numpy as np

from ocr import cleanup
from ocr.align import AlignedPanel, align, load_photo
from ocr.fields import read_choice, read_mark, text_crop
from ocr.readers import Reader
from ocr.template import PANELS, SCHEMA_JSON, Field, Template, load_template

LOW_CONFIDENCE = 0.6


def set_path(obj: dict, key: str, value) -> None:
    parts = key.split(".")
    cur = obj
    for p in parts[:-1]:
        cur = cur[int(p)] if isinstance(cur, list) else cur[p]
    last = parts[-1]
    if isinstance(cur, list):
        cur[int(last)] = value
    else:
        cur[last] = value


def get_path(obj, key: str):
    cur = obj
    for p in key.split("."):
        cur = cur[int(p)] if isinstance(cur, list) else cur.get(p) if isinstance(cur, dict) else None
        if cur is None:
            return None
    return cur


def find_panels(photos: list) -> tuple[dict[str, AlignedPanel], list[dict]]:
    """Align every photo; keep the best photo for each panel."""
    best: dict[str, AlignedPanel] = {}
    report = []
    for i, p in enumerate(photos):
        found = align(load_photo(p))
        report.append({"photo": i, "panels": [{"panel": a.panel, "inliers": a.inliers, "ecc": a.ecc} for a in found]})
        for a in found:
            if a.panel not in best or a.inliers > best[a.panel].inliers:
                best[a.panel] = a
    return best, report


def extract_panels(panels: dict[str, AlignedPanel], reader: Reader | None, template: Template | None = None,
                   dropout: bool = True, keep_crops: bool = False) -> dict:
    t = template or load_template()
    fields: dict[str, dict] = {}
    pending: list[tuple[Field, int, np.ndarray]] = []  # text crops to recognise in one batch
    line_count: dict[str, int] = {}
    crops_out: dict[str, list[np.ndarray]] = {}

    for f in t.fields:
        entry = {"value": None, "confidence": None, "raw": None, "valid": True, "panel": f.panel}
        fields[f.key] = entry
        a = panels.get(f.panel)
        if a is None:
            entry.update(confidence=0.0, missing=True)
            continue
        if f.type == "choice":
            value, conf, shares = read_choice(a.image, f)
            entry.update(value=value, confidence=conf, raw={k: round(v, 3) for k, v in shares.items()})
        elif f.type == "mark":
            present, conf, share = read_mark(a.image, f)
            entry.update(value=present, confidence=conf, raw=round(share, 4))
        else:
            line_count[f.key] = len(f.boxes)
            for li, box in enumerate(f.boxes):
                c = text_crop(a.image, f, box, dropout=dropout)
                if c is not None:
                    pending.append((f, li, c.image))
                    if keep_crops:
                        crops_out.setdefault(f.key, []).append(c.image)

    # Recognise all lines in one go (models are much faster in batches).
    texts: dict[str, dict[int, tuple[str, float]]] = {}
    if pending and reader is not None:
        results = reader.read([c for _, _, c in pending])
        for (f, li, _), r in zip(pending, results):
            texts.setdefault(f.key, {})[li] = r

    for f in t.fields:
        if f.type in ("choice", "mark") or f.panel not in panels:
            continue
        entry = fields[f.key]
        lines = texts.get(f.key, {})
        if not lines:
            # Nothing written: confidently empty.
            entry.update(value=None, confidence=0.95, raw=None)
            continue
        raw = ", ".join(lines[i][0] for i in sorted(lines) if lines[i][0])
        conf = float(np.mean([lines[i][1] for i in lines]))
        value, valid = cleanup.clean(f.type, raw, f.list)
        if not valid:
            conf *= 0.5
        entry.update(value=value, confidence=round(conf, 3), raw=raw, valid=valid)

    # "Same as above" for the communication address copies the permanent one.
    comm = fields.get("student.communicationAddress")
    if comm and comm["raw"] and cleanup.is_same_as_above(comm["raw"]):
        perm = fields.get("student.permanentAddress", {})
        comm.update(value=perm.get("value"), confidence=perm.get("confidence"), sameAsAbove=True)

    for e in fields.values():
        e["check"] = e.get("confidence") is not None and e["confidence"] < LOW_CONFIDENCE

    data = copy.deepcopy(json.loads(Path(SCHEMA_JSON).read_text()))
    for key, e in fields.items():
        set_path(data, key, e["value"])
    out = {"data": data, "fields": fields}
    if keep_crops:
        out["crops"] = crops_out
    return out


def extract(photos: list, reader: Reader | None, **kw) -> dict:
    t0 = time.perf_counter()
    panels, report = find_panels(photos)
    result = extract_panels(panels, reader, **kw)
    result["photos"] = report
    result["missingPanels"] = [p for p in PANELS if p not in panels]
    result["seconds"] = round(time.perf_counter() - t0, 2)
    return result
