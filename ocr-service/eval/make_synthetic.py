"""Make fake filled-in forms photographed badly, with their answer keys.

This tests the *pipeline* (finding panels, alignment, cropping, blank checks,
tick boxes, clean-up) before real forms exist. Handwriting fonts are much
easier to read than real parents' writing, so the reading accuracy measured on
these says nothing about real forms; only data/images does.

    python -m eval.make_synthetic --count 5 --out data/synthetic
writes data/synthetic/images/syn-001/page1.jpg ... and data/synthetic/labels/syn-001.json
"""

from __future__ import annotations

import argparse
import copy
import json
import random
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from ocr.pipeline import set_path
from ocr.template import PANELS, SCHEMA_JSON, load_template, render_panel

SCALE_W = 2480  # draw at ~300 dpi, like a phone photo of A4
FONTS = [
    "/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf",
    "/System/Library/Fonts/Noteworthy.ttc",
    "/System/Library/Fonts/Supplemental/Chalkboard.ttc",
    "/System/Library/Fonts/MarkerFelt.ttc",
    "/System/Library/Fonts/Supplemental/Comic Sans MS.ttf",
]
# Joined-up script fonts, written in mixed case the way most parents write.
CURSIVE_FONTS = [
    "/System/Library/Fonts/Supplemental/Brush Script.ttf",
    "/System/Library/Fonts/Supplemental/SnellRoundhand.ttc",
    "/System/Library/Fonts/Supplemental/Apple Chancery.ttf",
    "/System/Library/Fonts/Supplemental/Savoye LET.ttc",
]
STYLE = {"fonts": FONTS, "case": None}
PENS = [(20, 40, 150), (15, 15, 25), (30, 50, 110)]  # blue, black, dark blue (RGB)

SURNAMES = ["SHAIKH", "KHAN", "MEMON", "ANSARI", "QURESHI", "PATEL", "SAYYED", "MOMIN", "PATHAN", "SIDDIQUI"]
FIRST = ["ASRA", "AYAAN", "ZAINAB", "IBRAHIM", "FATIMA", "ARHAM", "MARIYAM", "HAMZA", "ALINA", "YUSUF"]
FATHERS = ["IMRAN", "SALIM", "JAVED", "ARIF", "RAFIQ", "SHAKIL", "NADEEM", "IRFAN"]
MOTHERS = ["ARSHIN", "NAZIA", "SHABANA", "RUKHSAR", "FARHEEN", "SANA", "HEENA"]
JOBS = ["Business", "Service", "Teacher", "Engineer", "Driver", "Housewife", "Doctor", "Tailor"]
QUALS = ["B.Com", "HSC", "SSC", "B.A.", "Graduate", "M.B.A.", "B.Sc."]
STREETS = ["Behram Baug", "Amrut Nagar", "Patel Estate", "Mominpura", "Gulshan Nagar", "Oshiwara"]
BLDGS = ["Aibani Classic", "Noor Manzil", "Al Habib Apt", "Sana Tower", "Green View"]
LANGS = ["Urdu", "Hindi", "English", "Marathi", "Gujarati"]
WORD_DAYS = ["First", "Second", "Fifth", "Tenth", "Twelfth", "Twentieth"]


def fake_answers(rng: random.Random) -> dict:
    """A plausible filled form, with some sections left blank as parents do."""
    d = copy.deepcopy(json.loads(SCHEMA_JSON.read_text()))
    sur, child, father, mother = rng.choice(SURNAMES), rng.choice(FIRST), rng.choice(FATHERS), rng.choice(MOTHERS)
    day, month, year = rng.randint(1, 28), rng.randint(1, 12), rng.randint(2019, 2022)
    mob = f"{rng.choice('6789')}{rng.randint(0, 999999999):09d}"
    addr = [f"{rng.randint(1, 900)}, {rng.choice(BLDGS)}", f"{rng.choice(STREETS)}, Jogeshwari (W)", f"Mumbai - 4001{rng.randint(0, 99):02d}"]
    v = {
        "formNo": str(rng.randint(1, 400)),
        "date": f"{rng.randint(1, 28):02d}/{rng.randint(1, 12):02d}/2026",
        "admissionClass": rng.choice(["PLAY_GROUP", "NURSERY", "JR_KG", "SR_KG", "STD_1", "STD_2"]),
        "photographs.child": True,
        "photographs.mother": rng.random() < 0.5,
        "photographs.father": rng.random() < 0.5,
        "photographs.guardian": False,
        "student.name.surname": sur,
        "student.name.childName": child,
        "student.name.fatherName": father,
        "student.gender": rng.choice(["MALE", "FEMALE"]),
        "student.ageAsOn.date": "01/06/2026",
        "student.ageAsOn.years": str(2026 - year),
        "student.ageAsOn.months": str(rng.randint(0, 11)),
        "student.dateOfBirth": f"{day:02d}/{month:02d}/{year}",
        "student.dateOfBirthInWords.day": rng.choice(WORD_DAYS),
        "student.dateOfBirthInWords.month": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month - 1],
        "student.dateOfBirthInWords.year": f"Two Thousand {['Nineteen', 'Twenty', 'Twenty One', 'Twenty Two'][year - 2019]}",
        "student.placeOfBirth.townCity": "Mumbai",
        "student.placeOfBirth.state": "Maharashtra",
        "student.nationality": "Indian",
        "student.religion": "Muslim",
        "student.community": rng.choice(["Sunni", "Memon", "Konkani"]),
        "student.motherTongue": rng.choice(["Urdu", "Hindi", "Urdu/Hindi"]),
        "student.permanentAddress": ", ".join(addr),
        "student.communicationAddress": ", ".join(addr) if rng.random() < 0.5 else None,
        "student.languagesKnown.0": "English",
        "student.languagesKnown.1": "Hindi",
        "student.languagesKnown.2": rng.choice(["Urdu", None]),
        "student.languagesSpokenAtHome.main": "Urdu",
        "student.languagesSpokenAtHome.other": rng.choice(["Hindi", None]),
        "father.name": f"{father} {sur}",
        "father.age": str(rng.randint(28, 45)),
        "father.qualification": rng.choice(QUALS),
        "father.occupation": rng.choice(JOBS),
        "father.email": f"{father.lower()}{rng.randint(1, 999)}@{rng.choice(['gmail.com', 'yahoo.com'])}",
        "father.designation": rng.choice(["Owner", "Manager", None]),
        "mother.name": f"{mother} {sur}",
        "mother.occupation": "Housewife",
        "mother.qualification": rng.choice(QUALS),
        "familyContact.residentialAddress": f"{addr[0]}, {addr[1]}",
        "familyContact.mobile": mob,
        "familyContact.phone": mob if rng.random() < 0.3 else None,
        "familyContact.monthlyIncome": str(rng.choice([25000, 40000, 60000, 100000])),
        "familyContact.motherTongue": "Urdu",
        "declaration.studentName": f"{child} {sur}",
        "declaration.fatherSignature": True,
        "declaration.motherSignature": rng.random() < 0.7,
        "undertaking.studentName": f"{child} {sur}",
        "undertaking.academicYearFrom": "26",
        "undertaking.academicYearTo": "27",
        "undertaking.effectiveFrom": "26",
    }
    if rng.random() < 0.4:
        v.update({"siblings.0.name": f"{rng.choice(FIRST)} {sur}", "siblings.0.age": str(rng.randint(6, 14)),
                  "siblings.0.schoolCollege": "Hera English School", "siblings.0.class": rng.choice(["3rd", "5th", "7th"])})
    for k, val in v.items():
        set_path(d, k, val)
    # Fields left blank by the parent but not null in the schema stay null; also
    # "mark" fields default to False when nothing was drawn.
    for f in load_template().fields:
        if f.type == "mark" and val_get(d, f.key) is None:
            set_path(d, f.key, False)
    return d


def val_get(d, key):
    from ocr.pipeline import get_path

    return get_path(d, key)


def _font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def write_line(draw: ImageDraw.ImageDraw, text: str, box_px, rng: random.Random, font_path: str, pen) -> None:
    x0, y0, x1, y1 = box_px
    h = y1 - y0
    size = int(h * rng.uniform(0.55, 0.75))
    font = _font(font_path, size)
    # Shrink to fit the line, as people do when they run out of space.
    while font.getlength(text) > (x1 - x0) * 0.97 and size > 12:
        size -= 2
        font = _font(font_path, size)
    x = x0 + rng.uniform(0.01, 0.06) * (x1 - x0)
    y = y1 - size * 1.15 - h * rng.uniform(0.02, 0.15)
    draw.text((x, y), text, font=font, fill=pen)


def draw_tick(draw, box_px, pen, rng):
    x0, y0, x1, y1 = box_px
    w, h = x1 - x0, y1 - y0
    pts = [(x0 + 0.15 * w, y0 + 0.55 * h), (x0 + 0.4 * w, y0 + 0.85 * h), (x0 + 0.9 * w, y0 + 0.1 * h)]
    draw.line(pts, fill=pen, width=max(3, int(h * 0.12)), joint="curve")


def draw_scribble(draw, box_px, pen, rng):
    x0, y0, x1, y1 = box_px
    pts = []
    for i in range(14):
        pts.append((x0 + (x1 - x0) * (0.1 + 0.6 * i / 13), y0 + (y1 - y0) * rng.uniform(0.3, 0.9)))
    draw.line(pts, fill=pen, width=4, joint="curve")


def paste_photo(img: Image.Image, box_px, rng):
    x0, y0, x1, y1 = box_px
    w, h = x1 - x0, y1 - y0
    g = np.zeros((h, w, 3), np.uint8)
    g[:] = (rng.randint(60, 200), rng.randint(60, 200), rng.randint(60, 200))
    cv2.circle(g, (w // 2, int(h * 0.42)), int(w * 0.25), (rng.randint(120, 220),) * 3, -1)
    cv2.ellipse(g, (w // 2, h), (int(w * 0.45), int(h * 0.35)), 0, 180, 360, (40, 40, 90), -1)
    img.paste(Image.fromarray(g), (x0, y0))


def fill_panel(panel: str, answers: dict, rng: random.Random) -> np.ndarray:
    t = load_template()
    base = np.array(render_panel(panel, SCALE_W))
    img = Image.fromarray(base).convert("RGB")
    draw = ImageDraw.Draw(img)
    W, H = img.size
    font_path = rng.choice(STYLE["fonts"])
    pen = rng.choice(PENS)
    for f in t.by_panel(panel):
        value = val_get(answers, f.key)
        if f.type == "choice":
            for o in f.options:
                if o.value == value:
                    draw_tick(draw, o.box.to_px(W, H), pen, rng)
            continue
        if f.type == "mark":
            if value:
                if f.key.startswith("photographs."):
                    paste_photo(img, f.boxes[0].to_px(W, H), rng)
                else:
                    draw_scribble(draw, f.boxes[0].to_px(W, H), pen, rng)
            continue
        if value is None:
            continue
        text = str(value)
        if STYLE["case"] == "title" and f.type not in ("email",):
            text = text.title()
        parts = [p.strip() for p in text.split(",")] if len(f.boxes) > 1 else [text]
        # Spread an address over its lines.
        per = max(1, -(-len(parts) // len(f.boxes)))
        for li, box in enumerate(f.boxes):
            chunk = ", ".join(parts[li * per : (li + 1) * per])
            if chunk:
                write_line(draw, chunk, box.to_px(W, H), rng, font_path, pen)
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def photograph(page: np.ndarray, rng: random.Random, severity: float = 1.0) -> np.ndarray:
    """Make a clean page look like a phone photo of it lying on a table."""
    h, w = page.shape[:2]
    # Page curl: bend rows a little, more towards one edge.
    amp = rng.uniform(0.002, 0.008) * h * severity
    xs = np.arange(w, dtype=np.float32)
    ys = np.arange(h, dtype=np.float32)
    mx, my = np.meshgrid(xs, ys)
    my = my + amp * np.sin(np.pi * mx / w + rng.uniform(-0.5, 0.5)) * (mx / w)
    page = cv2.remap(page, mx, my.astype(np.float32), cv2.INTER_LINEAR, borderValue=(255, 255, 255))
    # On a table, with a margin.
    m = int(0.12 * max(h, w))
    table = np.full((h + 2 * m, w + 2 * m, 3), (rng.randint(60, 140), rng.randint(50, 120), rng.randint(40, 100)), np.uint8)
    table[m : m + h, m : m + w] = page
    # Perspective: move each corner of the page.
    j = 0.06 * w * severity
    src = np.float32([[m, m], [m + w, m], [m + w, m + h], [m, m + h]])
    dst = src + np.float32([[rng.uniform(-j, j), rng.uniform(-j, j)] for _ in range(4)])
    ang = np.deg2rad(rng.uniform(-6, 6) * severity)
    c = np.float32([table.shape[1] / 2, table.shape[0] / 2])
    rot = np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]], np.float32)
    dst = (dst - c) @ rot.T + c
    M = cv2.getPerspectiveTransform(src, dst)
    out = cv2.warpPerspective(table, M, (table.shape[1], table.shape[0]), borderMode=cv2.BORDER_REPLICATE)
    # Uneven light and a soft shadow.
    gy, gx = np.mgrid[0 : out.shape[0], 0 : out.shape[1]].astype(np.float32)
    light = 0.75 + 0.25 * (gx / out.shape[1]) * rng.uniform(0.5, 1) + 0.1 * (gy / out.shape[0])
    sx = rng.uniform(0.2, 0.8) * out.shape[1]
    light *= 1 - 0.25 * severity * np.exp(-(((gx - sx) / (0.15 * out.shape[1])) ** 2))
    out = np.clip(out.astype(np.float32) * light[..., None], 0, 255).astype(np.uint8)
    out = cv2.GaussianBlur(out, (0, 0), rng.uniform(0.3, 1.2) * severity + 0.01)
    noise = np.random.default_rng(rng.randint(0, 1 << 30)).normal(0, 4 * severity, out.shape)
    out = np.clip(out + noise, 0, 255).astype(np.uint8)
    # Phone-sized: ~4000 px on the long side, sometimes held sideways.
    s = 4000 / max(out.shape[:2])
    out = cv2.resize(out, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    if rng.random() < 0.15:
        out = cv2.rotate(out, rng.choice([cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_180]))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=5)
    ap.add_argument("--out", type=Path, default=Path("data/synthetic"))
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--severity", type=float, default=1.0, help="how badly the photos are taken (0.5 easy .. 1.5 hard)")
    ap.add_argument("--cursive", action="store_true", help="joined-up script fonts in mixed case")
    args = ap.parse_args()
    if args.cursive:
        STYLE.update(fonts=CURSIVE_FONTS, case="title")
    rng = random.Random(args.seed)
    (args.out / "labels").mkdir(parents=True, exist_ok=True)
    for n in range(1, args.count + 1):
        name = f"syn-{n:03d}"
        answers = fake_answers(rng)
        folder = args.out / "images" / name
        folder.mkdir(parents=True, exist_ok=True)
        for panel in PANELS:
            page = fill_panel(panel, answers, rng)
            cv2.imwrite(str(folder / f"{panel}.jpg"), photograph(page, rng, args.severity), [cv2.IMWRITE_JPEG_QUALITY, rng.randint(70, 90)])
        (args.out / "labels" / f"{name}.json").write_text(json.dumps(answers, indent=2) + "\n")
        print("wrote", name)


if __name__ == "__main__":
    main()
