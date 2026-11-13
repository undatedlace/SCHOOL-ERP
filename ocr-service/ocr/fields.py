"""Cut each field out of an aligned panel and decide what is written there.

For every field:
- *Local shift.* A homography cannot model a curled page, so each field's
  printed lines are matched in a small window around the expected place and the
  box is moved by the best offset (at most SEARCH of the panel width).
- *Printed-ink dropout.* The blank form's own ink (underlines, labels that fall
  inside the box) is painted white, leaving only what the parent wrote.
- *Blank check.* A box with almost no handwriting is empty; it is never sent to
  the recogniser, which would otherwise invent text.
- Tick boxes and marks (photos, signatures) are decided from the amount of ink.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from ocr.template import Box, Field, render_panel

SEARCH = 0.012  # local search radius, fraction of panel width (~15 px at 1240)
INK_LEVEL = 185  # darker than this counts as ink (paper is ~255 once lighting is evened out)
EMPTY_TEXT = 0.004  # share of the box covered by handwriting below which a line is blank
EMPTY_TICK = 0.015  # share of a tick box's inside that must be ink to count as ticked
EMPTY_MARK = 0.010  # share for a signature or a pasted photo


@dataclass
class Crop:
    image: np.ndarray  # cleaned greyscale crop, tight around the writing (white background)
    ink: float  # share of the box covered by handwriting
    offset: tuple[int, int]  # local shift applied, pixels


def _template_ink(panel: str) -> np.ndarray:
    return _TEMPLATE_INK.setdefault(panel, (np.array(render_panel(panel)) < 200).astype(np.uint8))


_TEMPLATE_INK: dict[str, np.ndarray] = {}


def local_offset(aligned: np.ndarray, panel: str, box: Box) -> tuple[int, int]:
    """Best (dx, dy) to move the box so the printed form under it lines up."""
    tpl = np.array(render_panel(panel))
    h, w = tpl.shape
    r = max(4, int(SEARCH * w))
    x0, y0, x1, y1 = box.to_px(w, h)
    # Widen the patch a little so it holds the underline and some label text.
    x0, y0, x1, y1 = max(0, x0 - 10), max(0, y0 - 10), min(w, x1 + 10), min(h, y1 + 14)
    patch = tpl[y0:y1, x0:x1]
    if patch.size == 0 or (patch < 200).mean() < 0.005:
        return (0, 0)  # nothing printed to lock onto
    sx0, sy0, sx1, sy1 = max(0, x0 - r), max(0, y0 - r), min(w, x1 + r), min(h, y1 + r)
    window = aligned[sy0:sy1, sx0:sx1]
    if window.shape[0] < patch.shape[0] or window.shape[1] < patch.shape[1]:
        return (0, 0)
    # Compare edges, not raw pixels, so handwriting and shading matter less.
    res = cv2.matchTemplate(255 - window, 255 - patch, cv2.TM_CCOEFF_NORMED)
    _, best, _, (bx, by) = cv2.minMaxLoc(res)
    if best < 0.35:
        return (0, 0)
    return (bx - (x0 - sx0), by - (y0 - sy0))


def _box_px(box: Box, shape: tuple[int, int], offset: tuple[int, int]) -> tuple[int, int, int, int]:
    h, w = shape
    x0, y0, x1, y1 = box.to_px(w, h)
    dx, dy = offset
    return max(0, x0 + dx), max(0, y0 + dy), min(w, x1 + dx), min(h, y1 + dy)


def handwriting(aligned: np.ndarray, panel: str, box: Box, offset: tuple[int, int], dropout: bool = True):
    """Return (clean crop, ink mask) for one box."""
    x0, y0, x1, y1 = _box_px(box, aligned.shape, offset)
    crop = aligned[y0:y1, x0:x1].copy()
    ink = crop < INK_LEVEL
    if dropout:
        h, w = aligned.shape
        bx0, by0, bx1, by1 = box.to_px(w, h)
        printed = _template_ink(panel)[max(0, by0) : by0 + crop.shape[0], max(0, bx0) : bx0 + crop.shape[1]]
        printed = cv2.dilate(printed, np.ones((5, 5), np.uint8))
        if printed.shape == crop.shape:
            crop[printed > 0] = 255
            ink &= printed == 0
    # Remove specks (dust, JPEG noise) that are not strokes.
    ink_u8 = cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return crop, ink_u8


def text_crop(aligned: np.ndarray, field: Field, box: Box, dropout: bool = True) -> Crop | None:
    """The handwriting on one line, tight-cropped; None when the line is blank."""
    offset = local_offset(aligned, field.panel, box)
    crop, ink = handwriting(aligned, field.panel, box, offset, dropout)
    if not ink.size:
        return None
    # Keep the strokes that make up the writing. Drop specks, and flat slivers
    # left over from the printed underline when the dropout is a pixel off:
    # those are what made the recogniser invent text on blank lines.
    min_h = max(6, int(0.18 * crop.shape[0]))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    keep = np.zeros_like(ink)
    for i in range(1, n):
        area, bh = stats[i, cv2.CC_STAT_AREA], stats[i, cv2.CC_STAT_HEIGHT]
        if area >= 12 and bh >= min_h:
            keep[labels == i] = 1
    share = float(keep.mean())
    if share < EMPTY_TEXT:
        return None
    ys, xs = np.nonzero(keep)
    pad = 8
    cy0, cy1 = max(0, ys.min() - pad), min(crop.shape[0], ys.max() + pad)
    cx0, cx1 = max(0, xs.min() - pad), min(crop.shape[1], xs.max() + pad)
    return Crop(crop[cy0:cy1, cx0:cx1], share, offset)


def tick_share(aligned: np.ndarray, panel: str, box: Box) -> float:
    offset = local_offset(aligned, panel, box)
    _, ink = handwriting(aligned, panel, box, offset)
    return float(ink.mean()) if ink.size else 0.0


def read_choice(aligned: np.ndarray, field: Field) -> tuple[str | None, float, dict[str, float]]:
    """The ticked option, a confidence, and the ink share of every option."""
    shares = {o.value: tick_share(aligned, field.panel, o.box) for o in field.options}
    ranked = sorted(shares.items(), key=lambda kv: -kv[1])
    best, s1 = ranked[0]
    s2 = ranked[1][1] if len(ranked) > 1 else 0.0
    if s1 < EMPTY_TICK:
        return None, 1.0 - s1 / EMPTY_TICK * 0.5, shares
    # Confident when the winner clearly beats the runner-up.
    conf = min(1.0, (s1 - s2) / max(s1, 1e-6) + 0.2)
    return best, round(conf, 3), shares


def read_mark(aligned: np.ndarray, field: Field) -> tuple[bool, float, float]:
    """Whether a signature or photo is present."""
    box = field.boxes[0]
    offset = local_offset(aligned, field.panel, box)
    _, ink = handwriting(aligned, field.panel, box, offset)
    share = float(ink.mean()) if ink.size else 0.0
    present = share >= EMPTY_MARK
    margin = abs(share - EMPTY_MARK) / EMPTY_MARK
    return present, round(min(1.0, 0.5 + margin / 2), 3), share
