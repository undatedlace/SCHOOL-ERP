"""Find which form panels are in a photo and warp each onto the blank template.

1. Load the photo the right way up (phones store rotation in EXIF) and shrink it
   to at most MAX_SIDE pixels on the long side (phone photos are ~4000 px).
2. Match SIFT features between the photo and every blank panel, and fit a
   homography with RANSAC. A homography handles tilt, rotation (even upside
   down), scale and perspective in one step, so no separate "find the page edges"
   step is needed. A photo of a whole A3 spread matches two panels.
3. Warp the photo into the panel's frame, so every field box from the config
   lands on the same pixels as on the blank form.
4. Refine with ECC (a sub-pixel image alignment) to remove what RANSAC left.

Page curl is not a homography; ocr.fields corrects it locally per field.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageOps

from ocr.template import PANELS, render_panel

MAX_SIDE = 2000
MIN_INLIERS = 40
RATIO = 0.75  # Lowe's ratio test


@dataclass
class AlignedPanel:
    panel: str
    image: np.ndarray  # greyscale, same size as the template panel
    inliers: int
    corners: np.ndarray  # the panel's corners in the photo (4x2), for overlays and overlap checks
    ecc: float | None  # ECC correlation after refinement (None if it failed)


def load_photo(data: bytes | str) -> np.ndarray:
    """Read a photo (bytes or a path), apply EXIF rotation, return BGR shrunk to MAX_SIDE."""
    img = Image.open(io.BytesIO(data) if isinstance(data, bytes) else data)
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    return cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)


def _sift() -> cv2.SIFT:
    return cv2.SIFT_create(nfeatures=6000)


@lru_cache(maxsize=8)
def _template_features(panel: str):
    tpl = np.array(render_panel(panel))
    kp, des = _sift().detectAndCompute(tpl, None)
    pts = np.float32([k.pt for k in kp])
    return pts, des


def _normalise(gray: np.ndarray) -> np.ndarray:
    """Even out lighting and shadows so the photo looks more like the clean template."""
    bg = cv2.medianBlur(cv2.resize(gray, None, fx=0.25, fy=0.25), 31)
    bg = cv2.resize(bg, (gray.shape[1], gray.shape[0]))
    flat = cv2.divide(gray, bg, scale=255)
    return flat


def _quad_area(q: np.ndarray) -> float:
    return float(cv2.contourArea(q.astype(np.float32)))


def _overlap(a: np.ndarray, b: np.ndarray) -> float:
    inter, _ = cv2.intersectConvexConvex(a.astype(np.float32), b.astype(np.float32))
    return inter / max(1.0, min(_quad_area(a), _quad_area(b)))


def _plausible(corners: np.ndarray, photo_shape: tuple[int, int]) -> bool:
    """Reject homographies that fold, flip or shrink the panel to nothing."""
    if not cv2.isContourConvex(corners.astype(np.float32)):
        return False
    area = _quad_area(corners)
    h, w = photo_shape
    return area > 0.08 * w * h


def _refine_ecc(aligned: np.ndarray, tpl: np.ndarray) -> tuple[np.ndarray, float | None]:
    """Sub-pixel refinement at half resolution; keeps the input if ECC fails or diverges."""
    s = 0.5
    a = cv2.resize(aligned, None, fx=s, fy=s).astype(np.float32)
    t = cv2.resize(tpl, None, fx=s, fy=s).astype(np.float32)
    warp = np.eye(3, dtype=np.float32)
    try:
        cc, warp = cv2.findTransformECC(
            t, a, warp, cv2.MOTION_HOMOGRAPHY, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-5), None, 5
        )
    except cv2.error:
        return aligned, None
    full = np.diag([1 / s, 1 / s, 1]).astype(np.float32) @ warp @ np.diag([s, s, 1]).astype(np.float32)
    shift = np.abs(full[:2, 2]).max()
    if shift > 0.03 * tpl.shape[1]:  # a big jump means ECC locked onto something wrong
        return aligned, None
    h, w = tpl.shape
    out = cv2.warpPerspective(aligned, full, (w, h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderValue=255)
    return out, float(cc)


def align(photo_bgr: np.ndarray, panels: list[str] | None = None, refine: bool = True) -> list[AlignedPanel]:
    """Return every form panel found in the photo, best match first."""
    gray = _normalise(cv2.cvtColor(photo_bgr, cv2.COLOR_BGR2GRAY))
    kp, des = _sift().detectAndCompute(gray, None)
    if des is None or len(kp) < MIN_INLIERS:
        return []
    photo_pts = np.float32([k.pt for k in kp])
    matcher = cv2.FlannBasedMatcher({"algorithm": 1, "trees": 5}, {"checks": 64})

    found: list[tuple[str, np.ndarray, int, np.ndarray]] = []
    for name in panels or list(PANELS):
        tpts, tdes = _template_features(name)
        pairs = matcher.knnMatch(tdes, des, k=2)
        good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < RATIO * n.distance]
        if len(good) < MIN_INLIERS:
            continue
        src = tpts[[m.queryIdx for m in good]]
        dst = photo_pts[[m.trainIdx for m in good]]
        H, mask = cv2.findHomography(src, dst, cv2.USAC_MAGSAC, 4.0, maxIters=5000, confidence=0.999)
        if H is None:
            continue
        inliers = int(mask.sum())
        th, tw = render_panel(name).shape
        corners = cv2.perspectiveTransform(np.float32([[0, 0], [tw, 0], [tw, th], [0, th]]).reshape(-1, 1, 2), H).reshape(4, 2)
        if inliers >= MIN_INLIERS and _plausible(corners, gray.shape):
            found.append((name, H, inliers, corners))

    # Strongest first; a weaker match that covers the same part of the photo is a
    # look-alike panel (pages share headings), not a second page.
    found.sort(key=lambda f: -f[2])
    kept: list[tuple[str, np.ndarray, int, np.ndarray]] = []
    for f in found:
        if all(_overlap(f[3], k[3]) < 0.25 for k in kept):
            kept.append(f)

    out = []
    for name, H, inliers, corners in kept:
        tpl = np.array(render_panel(name))
        th, tw = tpl.shape
        warped = cv2.warpPerspective(gray, H, (tw, th), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderValue=255)
        cc = None
        if refine:
            warped, cc = _refine_ecc(warped, tpl)
        out.append(AlignedPanel(name, warped, inliers, corners, cc))
    return out
