"""Find the printed underlines and tick boxes on a blank panel.

Used once per form layout to measure field boxes:

    python -m eval.find_lines page1 --out data/lines

prints every horizontal underline and small square box with its position as
fractions of the panel, and writes an overlay image with each one numbered.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

from ocr.template import PANELS, render_panel


def find_underlines(gray: np.ndarray, min_len_frac: float = 0.025) -> list[tuple[int, int, int, int]]:
    """Horizontal runs of dark pixels at least min_len_frac of the width long, at most 4 px thick."""
    h, w = gray.shape
    ink = (gray < 140).astype(np.uint8)
    k = max(10, int(w * min_len_frac))
    horiz = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (k, 1)))
    n, _, stats, _ = cv2.connectedComponentsWithStats(horiz, connectivity=8)
    lines = []
    for i in range(1, n):
        x, y, bw, bh, _ = stats[i]
        if bh <= 5:
            lines.append((x, y, x + bw, y + bh))
    return sorted(lines, key=lambda r: (r[1] // 6, r[0]))


def find_tick_boxes(gray: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Small, roughly square outlined boxes (class and gender tick boxes)."""
    h, w = gray.shape
    ink = (gray < 140).astype(np.uint8) * 255
    contours, _ = cv2.findContours(ink, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    for c in contours:
        x, y, bw, bh = cv2.boundingRect(c)
        if 0.015 * w < bw < 0.05 * w and 0.7 < bw / max(bh, 1) < 2.2 and bh > 0.008 * h:
            approx = cv2.approxPolyDP(c, 0.05 * cv2.arcLength(c, True), True)
            if len(approx) == 4:
                boxes.append((x, y, x + bw, y + bh))
    # Contours of an outlined box come in pairs (outer and inner edge); keep the outer.
    boxes.sort(key=lambda b: -(b[2] - b[0]) * (b[3] - b[1]))
    kept: list[tuple[int, int, int, int]] = []
    for b in boxes:
        if not any(abs(b[0] - k[0]) < 8 and abs(b[1] - k[1]) < 8 for k in kept):
            kept.append(b)
    return sorted(kept, key=lambda r: (r[1] // 10, r[0]))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("panel", choices=list(PANELS))
    ap.add_argument("--out", type=Path, default=Path("data/lines"))
    args = ap.parse_args()

    gray = np.array(render_panel(args.panel))
    h, w = gray.shape
    vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    print(f"# {args.panel}  {w}x{h}")
    for i, (x0, y0, x1, y1) in enumerate(find_underlines(gray)):
        print(f"L{i:<3} x {x0 / w:.4f}-{x1 / w:.4f}  y {y0 / h:.4f}")
        cv2.line(vis, (x0, y0), (x1, y0), (0, 0, 255), 2)
        cv2.putText(vis, f"L{i}", (x0, y0 - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1)
    for i, (x0, y0, x1, y1) in enumerate(find_tick_boxes(gray)):
        print(f"B{i:<3} x {x0 / w:.4f}-{x1 / w:.4f}  y {y0 / h:.4f}-{y1 / h:.4f}")
        cv2.rectangle(vis, (x0, y0), (x1, y1), (255, 0, 0), 2)
        cv2.putText(vis, f"B{i}", (x0, y0 - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 0, 0), 1)
    args.out.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(args.out / f"{args.panel}.png"), vis)


if __name__ == "__main__":
    main()
