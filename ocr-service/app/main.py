"""HTTP wrapper around the pipeline. Only the Nest API calls it.

    OCR_READER=trocr-base .venv/bin/uvicorn app.main:app --port 8001 --workers 1   (or: npm run ocr)

GET  /health    {"status": "ok", "reader": ...}
POST /extract   multipart, one or more "files" (photos of the form) -> the pipeline result

Environment:
    OCR_READER         trocr-base (default), trocr-small or rapidocr
    OCR_SERVICE_TOKEN  if set, every /extract request must send it as X-OCR-Token
"""

from __future__ import annotations

import hmac
import logging
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError

from ocr.pipeline import extract
from ocr.readers import READERS, make_reader

MAX_FILES = 8
MAX_BYTES = 15 * 1024 * 1024
# Refuse absurd images before decoding them (a decompression bomb); phones are ~12-50 MP.
Image.MAX_IMAGE_PIXELS = 60_000_000

log = logging.getLogger("ocr")
state: dict = {}
# One form at a time: the model and the image work are memory-heavy (512 MB target).
busy = threading.Lock()


@asynccontextmanager
async def lifespan(_: FastAPI):
    name = os.environ.get("OCR_READER", "trocr-base")
    if name not in READERS:
        raise RuntimeError(f"OCR_READER must be one of {READERS}")
    state["reader"] = make_reader(name)  # loaded once, kept in memory
    state["reader_name"] = name
    yield
    state.clear()


app = FastAPI(title="School ERP OCR", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def _check_token(token: str | None) -> None:
    expected = os.environ.get("OCR_SERVICE_TOKEN")
    if expected and not hmac.compare_digest((token or "").encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Bad or missing X-OCR-Token")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "reader": state.get("reader_name")}


def _run(photos: list[bytes]) -> dict:
    with busy:
        return extract(photos, state["reader"])


@app.post("/extract")
async def extract_form(files: list[UploadFile] = File(...), x_ocr_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ocr_token)
    if not files or len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Send between 1 and {MAX_FILES} photos")
    photos = []
    for f in files:
        data = await f.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(status_code=413, detail="Each photo must be 15 MB or smaller")
        photos.append(data)
    try:
        result = await run_in_threadpool(_run, photos)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as e:
        raise HTTPException(status_code=400, detail="One of the files is not a photo that can be read (JPEG, PNG or WebP)") from e
    result["reader"] = state["reader_name"]
    # Do not log the result: it holds children's and parents' details.
    log.info("extracted %d photos in %ss, missing %s", len(photos), result["seconds"], result["missingPanels"])
    return result
