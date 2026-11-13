"""Draw the field config on the blank panels so the boxes can be checked by eye.

    python -m eval.draw_fields --out data/fields
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

from ocr.template import PANELS, load_template, render_panel


def draw(panel: str, image: np.ndarray | None = None) -> np.ndarray:
    t = load_template()
    gray = np.array(render_panel(panel)) if image is None else image
    h, w = gray.shape[:2]
    vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR) if gray.ndim == 2 else gray.copy()
    for f in t.by_panel(panel):
        rects = [b.to_px(w, h) for b in f.boxes] + [o.box.to_px(w, h) for o in f.options]
        colour = (0, 140, 0) if f.type != "choice" else (200, 0, 0)
        for x0, y0, x1, y1 in rects:
            cv2.rectangle(vis, (x0, y0), (x1, y1), colour, 2)
        x0, y0 = rects[0][:2]
        label = f.key.split(".", 1)[-1] if "." in f.key else f.key
        cv2.putText(vis, label, (x0 + 3, y0 + 13), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 220), 1)
    return vis


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("data/fields"))
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for p in PANELS:
        cv2.imwrite(str(args.out / f"{p}.png"), draw(p))
    print(f"wrote {len(PANELS)} images to {args.out}")


if __name__ == "__main__":
    main()
