"""Create local review contact sheets; never publish them as product photography."""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
products = json.loads((ROOT / "demo/catalog.json").read_text(encoding="utf-8"))["products"]
for start in range(0, len(products), 25):
    sheet = Image.new("RGB", (1250, 1250), "#f4f3fb")
    draw = ImageDraw.Draw(sheet)
    for index, product in enumerate(products[start : start + 25]):
        x, y = (index % 5) * 250, (index // 5) * 250
        with Image.open(ROOT / "frontend/public/demo-photos" / product["image"]["file"]) as image:
            thumb = ImageOps.contain(image.convert("RGB"), (230, 185))
            sheet.paste(thumb, (x + (250 - thumb.width) // 2, y + 6 + (185 - thumb.height) // 2))
        draw.text((x + 10, y + 198), f"{start + index + 1:03d} {product['name']}", fill="#242440")
        draw.text((x + 10, y + 217), product["image"]["title"][5:39], fill="#65657d")
    sheet.save(ROOT / f"demo/.cache/review-{start // 25 + 1}.jpg")
