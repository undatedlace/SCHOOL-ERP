"""The blank form: its four A4 panels and the field-box config.

The PDF is an A3 booklet. Each PDF page holds two A4 pages side by side, so the
pipeline works on four A4 *panels*, named in the order a parent fills them in:

    page1  PDF page 1, right half  (front: form no., class, photos, student details)
    page2  PDF page 2, left half   (student details cont., family, siblings, guardian)
    page3  PDF page 2, right half  (age limits, undertaking A)
    page4  PDF page 1, left half   (declaration B, signatures, office use)

Field boxes are stored as fractions of the panel's width and height, so they work
at any resolution.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
import pymupdf

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"
BLANK_PDF = TEMPLATES / "hera_admission_blank.pdf"
FIELDS_JSON = TEMPLATES / "hera_admission_fields.json"
SCHEMA_JSON = TEMPLATES / "hera_admission_schema.json"

# panel name -> (PDF page index, half)
PANELS: dict[str, tuple[int, str]] = {
    "page1": (0, "right"),
    "page2": (1, "left"),
    "page3": (1, "right"),
    "page4": (0, "left"),
}

# Template width in pixels. ~150 dpi for an A4 panel: enough detail for
# feature matching, small enough to stay light on memory.
TEMPLATE_WIDTH = 1240


@lru_cache(maxsize=8)
def render_panel(name: str, width: int = TEMPLATE_WIDTH) -> np.ndarray:
    """Render one A4 panel of the blank form as a greyscale image."""
    page_index, half = PANELS[name]
    with pymupdf.open(BLANK_PDF) as doc:
        page = doc[page_index]
        r = page.rect
        mid = r.x0 + r.width / 2
        clip = pymupdf.Rect(r.x0, r.y0, mid, r.y1) if half == "left" else pymupdf.Rect(mid, r.y0, r.x1, r.y1)
        zoom = width / clip.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip, colorspace=pymupdf.csGRAY, alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width).copy()
    img.flags.writeable = False
    return img


@dataclass(frozen=True)
class Box:
    """A rectangle as fractions of the panel: x0, y0, x1, y1."""

    x0: float
    y0: float
    x1: float
    y1: float

    def to_px(self, w: int, h: int) -> tuple[int, int, int, int]:
        return (round(self.x0 * w), round(self.y0 * h), round(self.x1 * w), round(self.y1 * h))


@dataclass(frozen=True)
class Option:
    value: str
    box: Box


@dataclass(frozen=True)
class Field:
    key: str  # dotted path into the schema, e.g. "student.name.surname" or "siblings.0.age"
    panel: str
    type: str  # see FIELD_TYPES
    boxes: tuple[Box, ...] = ()  # one per written line; empty for "choice"
    options: tuple[Option, ...] = ()  # for "choice"
    list: str | None = None  # vocabulary to snap to (see cleanup.VOCABULARIES)
    note: str | None = None


FIELD_TYPES = {
    "text",  # free handwriting
    "name",  # a person's name, usually block capitals
    "address",  # one or more lines of free handwriting, joined with ", "
    "date",  # dd/mm/yyyy
    "digits",  # a whole number (age, PIN, receipt no.)
    "phone",  # Indian phone number
    "email",
    "money",  # rupees
    "year2",  # two digits of a year ("20__")
    "choice",  # tick boxes, one value chosen
    "mark",  # presence of a signature or photo -> true/false
}


@dataclass
class Template:
    form: str
    fields: list[Field] = field(default_factory=list)

    def by_panel(self, panel: str) -> list[Field]:
        return [f for f in self.fields if f.panel == panel]


def _box(v: list[float]) -> Box:
    return Box(*map(float, v))


def load_template(path: Path = FIELDS_JSON) -> Template:
    raw = json.loads(path.read_text())
    fields = []
    for f in raw["fields"]:
        if f["type"] not in FIELD_TYPES:
            raise ValueError(f"{f['key']}: unknown type {f['type']}")
        if f["panel"] not in PANELS:
            raise ValueError(f"{f['key']}: unknown panel {f['panel']}")
        boxes = tuple(_box(b) for b in f.get("boxes", []))
        options = tuple(Option(o["value"], _box(o["box"])) for o in f.get("options", []))
        if f["type"] == "choice" and not options:
            raise ValueError(f"{f['key']}: a choice needs options")
        if f["type"] != "choice" and not boxes:
            raise ValueError(f"{f['key']}: needs at least one box")
        fields.append(Field(f["key"], f["panel"], f["type"], boxes, options, f.get("list"), f.get("note")))
    keys = [f.key for f in fields]
    dupes = {k for k in keys if keys.count(k) > 1}
    if dupes:
        raise ValueError(f"duplicate keys: {sorted(dupes)}")
    return Template(raw["form"], fields)


def crop(img: np.ndarray, box: Box) -> np.ndarray:
    h, w = img.shape[:2]
    x0, y0, x1, y1 = box.to_px(w, h)
    return img[max(0, y0) : min(h, y1), max(0, x0) : min(w, x1)]


def to_gray(img: np.ndarray) -> np.ndarray:
    return img if img.ndim == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
