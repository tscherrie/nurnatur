#!/usr/bin/env python3
"""
generator.py
------------
Generate Nur Natur assets with black-forest-labs/flux-kontext-pro (Replicate).

• Reads prompts.csv  (columns: filename,prompt)
• Sends anchor.png as style reference every call
• Creates ONE 16:9 PNG per asset → generated/<filename>.png
• Safe to resume: skips files already on disk
"""

import csv, io, os, time, requests
from pathlib import Path
import replicate
from tqdm import tqdm
from dotenv import load_dotenv

load_dotenv()

# Get the directory of the script to build robust paths
SCRIPT_DIR = Path(__file__).parent.resolve()

# ─── Configuration ──────────────────────────────────────────────────────────
MODEL            = "black-forest-labs/flux-kontext-pro"
API_TOKEN        = os.getenv("REPLICATE_API_TOKEN")

if not API_TOKEN:
    raise SystemExit("❌  REPLICATE_API_TOKEN not found in environment or .env file.")

# Strip whitespace from the token to prevent authentication errors
API_TOKEN = API_TOKEN.strip()

CSV_PATH         = SCRIPT_DIR.parent / "prompts.csv"
ANCHOR_PATH      = SCRIPT_DIR / "anchor.png"
OUT_DIR          = SCRIPT_DIR / "generated"
RATE_LIMIT_SEC   = 1.5                         # polite pause between calls
# ────────────────────────────────────────────────────────────────────────────

client = replicate.Client(api_token=API_TOKEN)


def run_flux(prompt: str, img_path: Path) -> bytes:
    """Call the model and return raw image bytes."""
    with img_path.open("rb") as img_file:
        result = client.run(
            MODEL,
            input={
                "prompt": prompt,
                "input_image": img_file,
                "aspect_ratio": "16:9",
            },
        )

    # `result` may be a URL, bytes, or file-like stream—handle all three.
    if isinstance(result, bytes):
        return result
    if isinstance(result, str) and result.startswith("http"):
        resp = requests.get(result, timeout=60); resp.raise_for_status()
        return resp.content
    if hasattr(result, "read"):
        return result.read()
    raise RuntimeError(f"Unexpected result type: {type(result)}")


def main() -> None:
    if not ANCHOR_PATH.exists():
        raise SystemExit(f"❌  Anchor image {ANCHOR_PATH} not found.")
    OUT_DIR.mkdir(exist_ok=True)

    rows = list(csv.DictReader(CSV_PATH.open()))
    if not rows:
        raise SystemExit("⚠️  prompts.csv is empty.")

    last_img_path = ANCHOR_PATH
    for row in tqdm(rows, desc="Generating"):
        fname, prompt = row["filename"].strip(), row["prompt"].strip()
        out_path = OUT_DIR / f"{fname}.png"
        if out_path.exists():
            last_img_path = out_path  # for resuming
            continue

        img_bytes = run_flux(prompt, last_img_path)
        out_path.write_bytes(img_bytes)
        last_img_path = out_path  # chain to next
        time.sleep(RATE_LIMIT_SEC)

    print(f"\n✅  Finished! Assets saved to {OUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
