"""The HTTP wrapper, with a stub reader so no model is loaded."""

import io
import random

import cv2
import pytest
from fastapi.testclient import TestClient

from app import main
from eval.make_synthetic import fake_answers, fill_panel, photograph


class StubReader:
    name = "stub"

    def read(self, crops):
        return [("STUB", 0.9) for _ in crops]


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(main, "make_reader", lambda name: StubReader())
    monkeypatch.delenv("OCR_SERVICE_TOKEN", raising=False)
    with TestClient(main.app) as c:
        yield c


def _photo(panel: str) -> bytes:
    rng = random.Random(3)
    img = photograph(fill_panel(panel, fake_answers(rng), rng), rng, 0.8)
    return cv2.imencode(".jpg", img)[1].tobytes()


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_extract_returns_fields(client):
    r = client.post("/extract", files=[("files", ("p1.jpg", _photo("page1"), "image/jpeg"))])
    assert r.status_code == 200
    body = r.json()
    assert "page1" not in body["missingPanels"]
    assert body["fields"]["student.name.surname"]["raw"] == "STUB"
    assert body["data"]["student"]["name"]["surname"] == "STUB"


def test_not_a_photo_is_refused(client):
    r = client.post("/extract", files=[("files", ("x.jpg", b"not an image", "image/jpeg"))])
    assert r.status_code == 400


def test_token_is_checked(client, monkeypatch):
    monkeypatch.setenv("OCR_SERVICE_TOKEN", "s3cret")
    files = [("files", ("p1.jpg", io.BytesIO(b"x"), "image/jpeg"))]
    assert client.post("/extract", files=files).status_code == 401
    assert client.post("/extract", files=files, headers={"X-OCR-Token": "wrong"}).status_code == 401
