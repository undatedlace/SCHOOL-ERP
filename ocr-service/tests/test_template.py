import json

from ocr.pipeline import get_path
from ocr.template import PANELS, SCHEMA_JSON, load_template, render_panel

NOT_READ = {"officeUse.admissionStatus"}  # struck out by the office, not ticked


def _leaf_keys(obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _leaf_keys(v, f"{prefix}{k}.")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _leaf_keys(v, f"{prefix}{i}.")
    else:
        yield prefix[:-1]


def test_every_schema_field_has_a_box():
    schema = json.loads(SCHEMA_JSON.read_text())
    keys = {f.key for f in load_template().fields}
    assert set(_leaf_keys(schema)) - NOT_READ == keys


def test_boxes_are_inside_the_panel_and_not_empty():
    for f in load_template().fields:
        for b in list(f.boxes) + [o.box for o in f.options]:
            assert 0 <= b.x0 < b.x1 <= 1 and 0 <= b.y0 < b.y1 <= 1, f.key


def test_config_keys_exist_in_schema():
    schema = json.loads(SCHEMA_JSON.read_text())
    for f in load_template().fields:
        assert get_path(schema, f.key) is None  # exists (all schema leaves are null)


def test_panels_render_as_a4():
    for p in PANELS:
        h, w = render_panel(p).shape
        assert abs(h / w - 2 ** 0.5) < 0.01
