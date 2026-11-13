"""Phase 1 accuracy test: run forms through the pipeline and score every field.

    python -m eval.run_eval --data data --readers trocr-small rapidocr
    python -m eval.run_eval --data data/synthetic --readers trocr-small --save

Expects <data>/images/<form>/*.jpg|png|heic... and <data>/labels/<form>.json
(the answer key, in the shape of templates/hera_admission_schema.json).

Reports, per recogniser:
- accuracy over *filled* fields (the go/no-go number: ~70%+ to go ahead),
- accuracy over all fields (blank ones count, so it is always higher),
- "close" = right after at most 10% of characters are fixed (a quick edit),
- per field type and per field, and seconds per form.
With --save, writes predictions, crops and aligned-panel overlays to <data>/runs/.
"""

from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from pathlib import Path

import cv2

from eval.draw_fields import draw
from eval.score import compare
from ocr.pipeline import extract_panels, find_panels, get_path
from ocr.readers import READERS, make_reader
from ocr.template import PANELS, load_template

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


def forms(data: Path) -> list[tuple[str, list[Path], dict]]:
    out = []
    for folder in sorted((data / "images").iterdir()):
        if not folder.is_dir():
            continue
        label = data / "labels" / f"{folder.name}.json"
        if not label.exists():
            print(f"skip {folder.name}: no answer key at {label}")
            continue
        photos = sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXT)
        out.append((folder.name, photos, json.loads(label.read_text())))
    return out


def pct(a: int, b: int) -> str:
    return f"{100 * a / b:5.1f}%" if b else "   - "


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=Path("data"))
    ap.add_argument("--readers", nargs="+", default=["trocr-small"], choices=READERS)
    ap.add_argument("--no-dropout", action="store_true", help="keep the printed form's ink in the crops")
    ap.add_argument("--save", action="store_true", help="write predictions, crops and overlays to <data>/runs/")
    ap.add_argument("--fields", action="store_true", help="print the per-field table")
    args = ap.parse_args()

    t = load_template()
    ftype = {f.key: f.type for f in t.fields}
    items = forms(args.data)
    if not items:
        raise SystemExit(f"no forms with answer keys under {args.data}")

    # Alignment is the same for every recogniser: do it once.
    aligned = {}
    for name, photos, _ in items:
        t0 = time.perf_counter()
        panels, report = find_panels([str(p) for p in photos])
        aligned[name] = (panels, time.perf_counter() - t0)
        missing = [p for p in PANELS if p not in panels]
        found = ", ".join(f"{a.panel}({a.inliers}, ecc {a.ecc:.2f})" if a.ecc else f"{a.panel}({a.inliers})" for a in panels.values())
        print(f"{name}: {found}" + (f"  MISSING {missing}" if missing else ""))
        if args.save:
            out = args.data / "runs" / "aligned" / name
            out.mkdir(parents=True, exist_ok=True)
            for a in panels.values():
                cv2.imwrite(str(out / f"{a.panel}.jpg"), draw(a.panel, a.image), [cv2.IMWRITE_JPEG_QUALITY, 80])

    for rname in args.readers:
        t0 = time.perf_counter()
        reader = make_reader(rname)
        load_s = time.perf_counter() - t0
        per_field = defaultdict(list)
        per_type = defaultdict(list)
        secs = []
        for name, _, truth in items:
            panels, align_s = aligned[name]
            t1 = time.perf_counter()
            res = extract_panels(panels, reader, dropout=not args.no_dropout, keep_crops=args.save)
            secs.append(align_s + time.perf_counter() - t1)
            for f in t.fields:
                c = compare(res["fields"][f.key]["value"], get_path(truth, f.key), f.type)
                c["form"] = name
                c["raw"] = res["fields"][f.key]["raw"]
                c["confidence"] = res["fields"][f.key]["confidence"]
                per_field[f.key].append(c)
                per_type[f.type].append(c)
            if args.save:
                out = args.data / "runs" / rname / name
                (out / "crops").mkdir(parents=True, exist_ok=True)
                for key, crops in res.pop("crops", {}).items():
                    for i, img in enumerate(crops):
                        cv2.imwrite(str(out / "crops" / f"{key}.{i}.png"), img)
                (out / "prediction.json").write_text(json.dumps(res, indent=2, default=str) + "\n")

        allc = [c for cs in per_field.values() for c in cs]
        filled = [c for c in allc if c["filled"]]
        print(f"\n=== {rname}  ({len(items)} forms, model load {load_s:.1f}s, {sum(secs) / len(secs):.1f}s per form) ===")
        print(f"filled fields correct : {pct(sum(c['correct'] for c in filled), len(filled))}  ({len(filled)} fields)   <- go/no-go")
        print(f"filled fields close   : {pct(sum(c['cer'] <= 0.1 for c in filled), len(filled))}  (at most 10% of characters wrong)")
        print(f"all fields correct    : {pct(sum(c['correct'] for c in allc), len(allc))}  ({len(allc)} fields, blanks included)")
        wrong_blank = sum(1 for c in allc if not c["filled"] and c["pred"] not in (None, False))
        print(f"text invented on blank: {wrong_blank}")
        print("\nby type          filled-correct   close    n")
        for ty, cs in sorted(per_type.items()):
            fc = [c for c in cs if c["filled"]]
            print(f"  {ty:<14} {pct(sum(c['correct'] for c in fc), len(fc)):>10}   {pct(sum(c['cer'] <= 0.1 for c in fc), len(fc))}  {len(fc):>4}")
        if args.fields:
            print("\nby field (filled only)")
            for key, cs in per_field.items():
                fc = [c for c in cs if c["filled"]]
                if not fc:
                    continue
                print(f"  {key:<42} {pct(sum(c['correct'] for c in fc), len(fc))}  e.g. read {fc[0]['raw']!r} -> {fc[0]['pred']!r}, truth {fc[0]['truth']!r}")
        if args.save:
            rows = [{"field": k, **c} for k, cs in per_field.items() for c in cs]
            (args.data / "runs" / rname / "scores.json").write_text(json.dumps(rows, indent=1, default=str) + "\n")


if __name__ == "__main__":
    main()
