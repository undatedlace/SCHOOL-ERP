"""Microsoft TrOCR (handwritten), run with PyTorch. Laptop evaluation only:
the deployed service will run the same model exported to ONNX int8."""

from __future__ import annotations

import numpy as np


class TrOCRReader:
    def __init__(self, model_id: str, name: str, batch: int = 8):
        import torch
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel

        self.name = name
        self.torch = torch
        torch.set_num_threads(max(1, torch.get_num_threads()))
        self.processor = TrOCRProcessor.from_pretrained(model_id)
        self.model = VisionEncoderDecoderModel.from_pretrained(model_id).eval()
        self.batch = batch

    def read(self, crops: list[np.ndarray]) -> list[tuple[str, float]]:
        from PIL import Image

        out: list[tuple[str, float]] = []
        for i in range(0, len(crops), self.batch):
            chunk = [Image.fromarray(c).convert("RGB") for c in crops[i : i + self.batch]]
            pixels = self.processor(images=chunk, return_tensors="pt").pixel_values
            with self.torch.no_grad():
                gen = self.model.generate(
                    pixels, max_new_tokens=48, num_beams=1, output_scores=True, return_dict_in_generate=True
                )
            texts = self.processor.batch_decode(gen.sequences, skip_special_tokens=True)
            scores = self.model.compute_transition_scores(gen.sequences, gen.scores, normalize_logits=True)
            for text, s in zip(texts, scores):
                s = s[self.torch.isfinite(s)]
                # Mean token probability: a rough but useful "how sure" number.
                conf = float(self.torch.exp(s).mean()) if s.numel() else 0.0
                out.append((text.strip(), round(conf, 3)))
        return out
