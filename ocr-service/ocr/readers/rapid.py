"""RapidOCR: PaddleOCR's recognition model through ONNX Runtime. Tiny and fast;
strong on print-like capitals and digits, weaker on joined-up writing."""

from __future__ import annotations

import numpy as np


class RapidReader:
    name = "rapidocr"

    def __init__(self):
        from rapidocr_onnxruntime import RapidOCR

        self.engine = RapidOCR()

    def read(self, crops: list[np.ndarray]) -> list[tuple[str, float]]:
        out = []
        for c in crops:
            # Recognition only: the crop is already one line.
            res, _ = self.engine(c, use_det=False, use_cls=False, use_rec=True)
            if res:
                text, score = res[0][0], float(res[0][1])
            else:
                text, score = "", 0.0
            out.append((text.strip(), round(score, 3)))
        return out
