"""Print cached eligible titles for manual photo selection."""

import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

root = Path(__file__).resolve().parent
for name in sys.argv[1:]:
    options = json.loads((root / ".cache" / f"{name}.json").read_text(encoding="utf-8"))
    options = [
        item
        for item in options
        if urlsplit(item["download_url"]).path.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    ]
    titles = {name: {i: option["title"] for i, option in enumerate(options)}}
    print(json.dumps(titles, ensure_ascii=True))
