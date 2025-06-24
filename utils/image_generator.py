#!/usr/bin/env python3
"""
Batch-generate Nur Natur assets with GPT-Image-1

• Reads prompts.csv (fields: filename,prompt[,quality])
• Creates TWO PNG variants per prompt
• First image becomes a style-anchor that’s fed into every edit call
• Resumable – already-generated files are skipped
"""

import base64, csv, os, time
from pathlib import Path
import requests
from openai import OpenAI
from tqdm import tqdm

# ────── CONFIG ───────────────────────────────────────────────────────────────
MODEL           = "gpt-image-1"
CSV_PATH        = Path("prompts.csv")
OUT_DIR         = Path("generated")
SIZE            = "1024x1024"          # keep fixed for coherence
QUALITY_DEFAULT = "high"               # low | medium | high | auto
N_VARIANTS      = 2                    # 2 images per prompt
OUTPUT_FORMAT   = "png"                # png | jpeg | webp  (png → alpha OK)
RATE_LIMIT_SEC  = 1.2                  # polite pause between calls
# ─────────────────────────────────────────────────────────────────────────────

client = OpenAI()                      # uses OPENAI_API_KEY env var


def save_b64(image_obj, path: Path) -> None:
    """Write the base64 (or URL) image data to disk."""
    if hasattr(image_obj, "b64_json") and image_obj.b64_json:
        path.write_bytes(base64.b64decode(image_obj.b64_json))
    else:  # fallback to URL
        r = requests.get(image_obj.url, timeout=60)
        r.raise_for_status()
        path.write_bytes(r.content)


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)

    rows = list(csv.DictReader(CSV_PATH.open()))
    if not rows:
        raise SystemExit("⚠️  prompts.csv is empty.")

    style_anchor: Path | None = None

    for idx, row in enumerate(tqdm(rows, desc="Generating")):
        fname   = row["filename"].strip()
        prompt  = row["prompt"].strip()
        quality = row.get("quality", QUALITY_DEFAULT).strip() or QUALITY_DEFAULT

        img1 = OUT_DIR / f"{fname}_v1.png"
        img2 = OUT_DIR / f"{fname}_v2.png"
        if img1.exists() and img2.exists():
            continue  # resumable: skip if already on disk

        kwargs = dict(
            model=MODEL,
            prompt=prompt,
            n=N_VARIANTS,
            size=SIZE,
            quality=quality,
            output_format=OUTPUT_FORMAT,
        )

        # First prompt → fresh generation, becomes style anchor
        if style_anchor is None:
            resp = client.images.generate(**kwargs)
        else:
            with style_anchor.open("rb") as anchor:
                resp = client.images.edit(image=[anchor], **kwargs)

        save_b64(resp.data[0], img1)
        save_b64(resp.data[1], img2)

        if style_anchor is None:
            style_anchor = img1            # lock global style

        time.sleep(RATE_LIMIT_SEC)

    print(f"\n✅  All assets saved to {OUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
