"""Build templates/hera_admission_fields.json from the measured underlines.

Each written field is given by the printed line it sits on: (x0, x1, y) as
fractions of the panel (measured with `python -m eval.find_lines <panel>`).
The crop box reaches up from the line to just below the nearest printed line
above it (parents often write above the line), at most ABOVE high, and a little
below it for descenders. Tick boxes and photo frames are given as rectangles.

    python -m eval.build_fields          # writes the config
    python -m eval.draw_fields           # draws it on the blank panels to check
"""

from __future__ import annotations

import json

import numpy as np

from eval.find_lines import find_underlines
from ocr.template import FIELDS_JSON, render_panel

ABOVE = 0.026  # max box height above the line (fraction of panel height, ~1.1 lines)
BELOW = 0.005  # below the line, for descenders
GAP = 0.004  # keep this far below the printed line above
RIGHT = 0.008  # writing often runs past the end of the line

L = tuple[float, float, float]  # x0, x1, y

# key, type, lines (or "options"), extra
SPEC: dict[str, list[tuple]] = {
    "page1": [
        ("formNo", "digits", [(0.1540, 0.3444, 0.2856)]),
        ("date", "date", [(0.7629, 0.9331, 0.2845)]),
        ("photographs.child", "mark", "rect", (0.1282, 0.4761, 0.2685, 0.5815)),
        ("photographs.mother", "mark", "rect", (0.3218, 0.4761, 0.4621, 0.5815)),
        ("photographs.father", "mark", "rect", (0.5169, 0.4761, 0.6573, 0.5815)),
        ("photographs.guardian", "mark", "rect", (0.7113, 0.4761, 0.8516, 0.5815)),
        ("admissionClass", "choice", "options", [
            ("STD_1", (0.1911, 0.6078, 0.2347, 0.6237)),
            ("STD_2", (0.3540, 0.6078, 0.3968, 0.6237)),
            ("NURSERY", (0.4782, 0.6078, 0.5218, 0.6237)),
            ("JR_KG", (0.5952, 0.6078, 0.6387, 0.6237)),
            ("SR_KG", (0.7169, 0.6078, 0.7605, 0.6237)),
            ("PLAY_GROUP", (0.8629, 0.6078, 0.9056, 0.6237)),
        ]),
        ("student.name.surname", "name", [(0.1218, 0.3815, 0.6779)]),
        ("student.name.childName", "name", [(0.3935, 0.6532, 0.6779)]),
        ("student.name.fatherName", "name", [(0.6653, 0.9250, 0.6779)]),
        ("student.gender", "choice", "options", [
            ("MALE", (0.1815, 0.7172, 0.2073, 0.7360)),
            ("FEMALE", (0.2871, 0.7172, 0.3129, 0.7360)),
        ]),
        ("student.ageAsOn.date", "date", [(0.4048, 0.5645, 0.7332)]),
        ("student.ageAsOn.years", "digits", [(0.5694, 0.7113, 0.7332)]),
        ("student.ageAsOn.months", "digits", [(0.7556, 0.8629, 0.7320)]),
        ("student.dateOfBirth", "date", [(0.1669, 0.3339, 0.7611)]),
        ("student.dateOfBirthInWords.day", "text", [(0.4185, 0.5600, 0.7611)]),
        ("student.dateOfBirthInWords.month", "text", [(0.5600, 0.7400, 0.7611)], {"list": "months"}),
        ("student.dateOfBirthInWords.year", "text", [(0.7400, 0.9323, 0.7611)]),
        ("student.placeOfBirth.townCity", "text", [(0.1742, 0.4700, 0.7999)]),
        ("student.placeOfBirth.state", "text", [(0.4700, 0.6637, 0.7999)], {"list": "states"}),
        ("student.nationality", "text", [(0.7516, 0.9323, 0.7999)], {"list": "nationalities"}),
        ("student.religion", "text", [(0.1371, 0.3484, 0.8387)], {"list": "religions"}),
        ("student.community", "text", [(0.4508, 0.6492, 0.8381)]),
        ("student.motherTongue", "text", [(0.7823, 0.9323, 0.8381)], {"list": "languages"}),
        ("student.permanentAddress", "address", [(0.2306, 0.9323, 0.8637), (0.0629, 0.9331, 0.8877), (0.0629, 0.9331, 0.9122)]),
        ("student.communicationAddress", "address", [(0.2734, 0.9323, 0.9396), (0.0629, 0.9331, 0.9595)]),
    ],
    "page2": [
        ("student.languagesKnown.0", "text", [(0.4379, 0.5839, 0.1038)], {"list": "languages"}),
        ("student.languagesKnown.1", "text", [(0.6048, 0.7484, 0.1038)], {"list": "languages"}),
        ("student.languagesKnown.2", "text", [(0.7685, 0.9242, 0.1038)], {"list": "languages"}),
        ("student.languagesSpokenAtHome.main", "text", [(0.1250, 0.4589, 0.1482)], {"list": "languages"}),
        ("student.languagesSpokenAtHome.other", "text", [(0.6089, 0.9250, 0.1517)], {"list": "languages"}),
        ("student.lastSchool.attendedFrom", "date", [(0.5024, 0.6952, 0.1733)]),
        ("student.lastSchool.attendedTo", "date", [(0.7234, 0.9242, 0.1762)]),
        ("student.lastSchool.nameAndAddress", "address", [(0.3137, 0.9250, 0.2070)]),
        ("student.lastSchool.lastClassAttended", "text", [(0.2419, 0.4556, 0.2309)]),
        ("student.lastSchool.mediumOfInstruction", "text", [(0.6395, 0.9250, 0.2332)], {"list": "languages"}),
        ("student.lastSchool.reasonForChange", "address", [(0.3798, 0.9250, 0.2548), (0.0750, 0.9105, 0.2794)]),
        ("student.illnessOrDisabilities", "address", [(0.8500, 0.9250, 0.3062), (0.0758, 0.9113, 0.3409)]),
        ("father.name", "name", [(0.2008, 0.9250, 0.3962)], {"top": 0.378}),  # header bar above
        ("father.age", "digits", [(0.1194, 0.2065, 0.4190)]),
        ("father.qualification", "text", [(0.3621, 0.5105, 0.4196)]),
        ("father.occupation", "text", [(0.6121, 0.9105, 0.4179)]),
        ("father.email", "email", [(0.1290, 0.5065, 0.4424)]),
        ("father.designation", "text", [(0.1694, 0.5065, 0.4618)]),
        ("father.officeAddress", "address", [(0.6387, 0.9250, 0.4641)]),
        ("mother.name", "name", [(0.1960, 0.5000, 0.5000)]),
        ("mother.occupation", "text", [(0.6145, 0.7153, 0.5023)]),
        ("mother.qualification", "text", [(0.8210, 0.9250, 0.5034)]),
        ("familyContact.residentialAddress", "address", [(0.2379, 0.9250, 0.5336)]),
        ("familyContact.phone", "phone", [(0.1339, 0.3532, 0.5564)]),
        ("familyContact.mobile", "phone", [(0.4194, 0.6694, 0.5582)]),
        ("familyContact.fax", "phone", [(0.7113, 0.9250, 0.5593)]),
        ("familyContact.monthlyIncome", "money", [(0.1992, 0.4992, 0.5792)]),
        ("familyContact.motherTongue", "text", [(0.6298, 0.9250, 0.5798)], {"list": "languages"}),
        *[
            row
            for i, y in enumerate((0.6403, 0.6631, 0.6853, 0.7087))
            for row in (
                (f"siblings.{i}.name", "name", [(0.0903, 0.3855, y)]),
                (f"siblings.{i}.age", "digits", [(0.4016, 0.5008, y)]),
                (f"siblings.{i}.schoolCollege", "text", [(0.5250, 0.7831, y)]),
                (f"siblings.{i}.class", "text", [(0.8040, 0.9008, y)]),
            )
        ],
        ("guardian.name.firstName", "name", [(0.3105, 0.5100, 0.7765)]),
        ("guardian.name.middleName", "name", [(0.5100, 0.7100, 0.7765)]),
        ("guardian.name.lastName", "name", [(0.7100, 0.9097, 0.7765)]),
        ("guardian.relationshipWithStudent", "text", [(0.2823, 0.9153, 0.8119)]),
        ("guardian.age", "digits", [(0.1153, 0.2032, 0.8387)]),
        ("guardian.qualification", "text", [(0.3605, 0.5040, 0.8387)]),
        ("guardian.occupation", "text", [(0.6073, 0.9145, 0.8409)]),
        ("guardian.designation", "text", [(0.1702, 0.3411, 0.8643)]),
        ("guardian.officeAddress", "address", [(0.4645, 0.9145, 0.8649), (0.0734, 0.5194, 0.8928)]),
        ("guardian.email", "email", [(0.5766, 0.9145, 0.8928)]),
        ("guardian.residentialAddress", "address", [(0.2452, 0.9145, 0.9168)]),
        ("guardian.phone", "phone", [(0.1379, 0.3476, 0.9470)]),
        ("guardian.mobile", "phone", [(0.4097, 0.6637, 0.9470)]),
        ("guardian.fax", "phone", [(0.7056, 0.9145, 0.9470)]),
    ],
    "page3": [
        ("undertaking.studentName", "name", [(0.1653, 0.5540, 0.4920)]),
        ("undertaking.annualFees", "money", [(0.8450, 0.9050, 0.5587)]),
        ("undertaking.academicYearFrom", "year2", [(0.2218, 0.2524, 0.5753)]),
        ("undertaking.academicYearTo", "year2", [(0.2847, 0.3153, 0.5753)]),
        ("undertaking.effectiveFrom", "year2", [(0.4097, 0.4460, 0.5753)]),
        ("undertaking.effectiveTo", "text", [(0.4589, 0.5540, 0.5753)]),
    ],
    "page4": [
        ("declaration.studentName", "name", [(0.4444, 0.8363, 0.0633)]),
        ("declaration.fatherSignature", "mark", [(0.2710, 0.4621, 0.4299)]),
        ("declaration.motherSignature", "mark", [(0.6331, 0.8306, 0.4287)]),
        ("officeUse.receivedOn", "date", [(0.2113, 0.5081, 0.4960)]),
        ("officeUse.feesPaidOn", "date", [(0.2145, 0.5081, 0.5217)]),
        ("officeUse.feesReceiptNo", "text", [(0.2444, 0.5081, 0.5485)]),
        ("officeUse.checkedBy", "name", [(0.2089, 0.5081, 0.5753)]),
        ("officeUse.authoritySignature", "mark", [(0.2823, 0.5081, 0.6015)]),
        ("officeUse.admittedToClass", "text", [(0.6839, 0.7887, 0.5165)]),
        ("officeUse.division", "text", [(0.8242, 0.9210, 0.5165)]),
        ("officeUse.approvalSignature", "mark", [(0.5194, 0.7524, 0.5690)]),
        ("officeUse.approvalDate", "date", [(0.7968, 0.9210, 0.5690)]),
    ],
}

# Not read: officeUse.admissionStatus ("GRANTED / REFUSED" is struck out or circled
# by the office, not ticked, and the ERP records the decision itself).


def _r(v: float) -> float:
    return round(v, 4)


def line_box(x0: float, x1: float, y: float, printed: list[tuple[float, float, float]]) -> list[float]:
    """Box above a line, stopping just under the nearest printed line above that overlaps it."""
    top = y - ABOVE
    for lx0, lx1, ly in printed:
        overlaps = min(x1, lx1) - max(x0, lx0) > 0.01
        if overlaps and y - ABOVE - GAP < ly < y - 0.005:
            top = max(top, ly + GAP)
    return [_r(x0), _r(top), _r(min(x1 + RIGHT, 0.97)), _r(y + BELOW)]


def build() -> dict:
    fields = []
    for panel, rows in SPEC.items():
        gray = np.array(render_panel(panel))
        h, w = gray.shape
        printed = [(a / w, c / w, b / h) for a, b, c, _ in find_underlines(gray)]
        for row in rows:
            key, ftype, what = row[0], row[1], row[2]
            extra = dict(row[3]) if len(row) > 3 and isinstance(row[3], dict) else {}
            f: dict = {"key": key, "panel": panel, "type": ftype}
            if what == "options":
                inset = 0.003
                f["options"] = [
                    {"value": v, "box": [_r(a + inset), _r(b + inset), _r(c - inset), _r(d - inset)]} for v, (a, b, c, d) in row[3]
                ]
            elif what == "rect":
                a, b, c, d = row[3]
                inset = 0.006  # inside the printed frame
                f["boxes"] = [[_r(a + inset), _r(b + inset), _r(c - inset), _r(d - inset)]]
            else:
                f["boxes"] = [line_box(x0, x1, y, printed) for x0, x1, y in what]
            top = extra.pop("top", None)
            if top is not None:
                f["boxes"] = [[b[0], max(b[1], top), b[2], b[3]] for b in f["boxes"]]
            f.update(extra)
            fields.append(f)
    return {"form": "hera_admission", "version": 1, "units": "fractions of the A4 panel (x0, y0, x1, y1)", "fields": fields}


if __name__ == "__main__":
    cfg = build()
    FIELDS_JSON.write_text(json.dumps(cfg, indent=1) + "\n")
    print(f"wrote {len(cfg['fields'])} fields to {FIELDS_JSON}")
