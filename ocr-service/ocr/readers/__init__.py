"""Line recognisers. Each takes greyscale crops of one written line and returns
(text, confidence 0..1) per crop. Heavy libraries are imported only when a
reader is created, so the rest of the pipeline runs without them."""

from __future__ import annotations

from typing import Protocol

import numpy as np


class Reader(Protocol):
    name: str

    def read(self, crops: list[np.ndarray]) -> list[tuple[str, float]]: ...


def make_reader(name: str) -> Reader:
    if name in ("trocr-small", "trocr-base"):
        from ocr.readers.trocr import TrOCRReader

        return TrOCRReader(f"microsoft/trocr-{name.split('-')[1]}-handwritten", name)
    if name == "rapidocr":
        from ocr.readers.rapid import RapidReader

        return RapidReader()
    raise ValueError(f"unknown reader {name!r}; choose trocr-small, trocr-base or rapidocr")


READERS = ("trocr-small", "trocr-base", "rapidocr")
