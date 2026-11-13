"""End to end on one synthetic form, without a recogniser: finding the panels,
alignment, tick boxes, marks and blank detection."""

import random

import cv2
import pytest

from eval.make_synthetic import fake_answers, fill_panel, photograph
from ocr.pipeline import extract, get_path
from ocr.template import PANELS, load_template


@pytest.fixture(scope="module")
def form(tmp_path_factory):
    rng = random.Random(11)
    answers = fake_answers(rng)
    folder = tmp_path_factory.mktemp("form")
    paths = []
    for panel in PANELS:
        p = folder / f"{panel}.jpg"
        cv2.imwrite(str(p), photograph(fill_panel(panel, answers, rng), rng, 1.0), [cv2.IMWRITE_JPEG_QUALITY, 80])
        paths.append(str(p))
    return answers, extract(paths, reader=None)


def test_all_panels_found(form):
    _, res = form
    assert res["missingPanels"] == []
    assert all(len(p["panels"]) == 1 for p in res["photos"])


def test_tick_boxes_and_marks(form):
    answers, res = form
    for f in load_template().fields:
        if f.type in ("choice", "mark"):
            assert res["fields"][f.key]["value"] == get_path(answers, f.key), f.key


def test_blank_fields_are_seen_as_blank(form):
    answers, res = form
    # With no recogniser, a field with writing has value None but is not marked
    # confidently empty; a blank field is confidently empty.
    for f in load_template().fields:
        if f.type in ("choice", "mark"):
            continue
        if get_path(answers, f.key) is None:
            assert res["fields"][f.key]["confidence"] == 0.95, f.key
