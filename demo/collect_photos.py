"""Collect a small, attributed Commons snapshot; never scrape retailer photographs."""

import argparse
import hashlib
import html
import io
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "frontend/public/demo-photos"
CACHE = ROOT / "demo/.cache"
USER_AGENT = "ReusableStoreDemo/0.1 (https://github.com/Athaher-Sayem/Drinks; example catalog)"
LICENSES = re.compile(r"^(?:CC0|CC BY(?:-SA)? [234]\.[05])$")
Image.MAX_IMAGE_PIXELS = 25_000_000


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def plain(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", str(value)))).strip()


def clean_url(value):
    parsed = urlsplit(value)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


def fetch(url, limit=15_000_000):
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in {
        "commons.wikimedia.org",
        "upload.wikimedia.org",
        "thumb.wikimedia.org",
    }:
        raise ValueError("Only official HTTPS Commons URLs may be downloaded.")
    for attempt in range(4):
        try:
            with urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=35) as response:
                data = response.read(limit + 1)
                if len(data) > limit:
                    raise ValueError("Source image is too large.")
                return data
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2**attempt)


def candidates(term, title=None):
    parameters = {
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": 640,
        "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl|Restrictions|ImageDescription",
        "maxlag": 5,
    }
    if title:
        parameters["titles"] = title
    else:
        parameters.update(
            {
                "generator": "search",
                "gsrsearch": f"{term} filetype:bitmap",
                "gsrnamespace": 6,
                "gsrlimit": 8,
            }
        )
    url = "https://commons.wikimedia.org/w/api.php?" + urlencode(parameters)
    response = json.loads(fetch(url, 3_000_000))
    if "error" in response:
        raise ValueError(f"Commons returned {response['error'].get('code')}")
    result = []
    pages = response.get("query", {}).get("pages", {}).values()
    for page in sorted(pages, key=lambda p: p.get("index", 100)):
        info = page.get("imageinfo", [{}])[0]
        metadata = info.get("extmetadata", {})

        def value(key, values=metadata):
            return plain(values.get(key, {}).get("value", ""))

        license_name = value("LicenseShortName")
        author = value("Artist")
        source = info.get("descriptionurl", "")
        if (
            not LICENSES.fullmatch(license_name)
            or value("Restrictions")
            or not author
            or len(author) > 230
            or len(source) > 250
        ):
            continue
        license_url = value("LicenseUrl").replace("http://", "https://")
        if not license_url.startswith("https://creativecommons.org/"):
            continue
        result.append(
            {
                "title": page["title"],
                "source_url": source,
                "author": author,
                "license": license_name,
                "license_url": license_url,
                "original_url": clean_url(info["url"]),
                "download_url": clean_url(info.get("thumburl") or info["url"]),
                "description": value("ImageDescription")[:400],
            }
        )
    return result


def collect(entry):
    category, name, term, price, index = entry
    override_file = ROOT / "demo/photo-selections.json"
    overrides = (
        json.loads(override_file.read_text(encoding="utf-8")) if override_file.exists() else {}
    )
    selected = overrides.get(slug(name), {})
    selected = {"index": selected} if isinstance(selected, int) else selected
    term = selected.get("query", term)
    identity = selected.get("title", term)
    cache_file = CACHE / f"{slug(name)}.json"
    query_file = CACHE / f"{slug(name)}.query"
    options = json.loads(cache_file.read_text(encoding="utf-8")) if cache_file.exists() else []
    query_changed = not query_file.exists() or query_file.read_text(encoding="utf-8") != identity
    if not options or (("query" in selected or "title" in selected) and query_changed):
        options = candidates(term, selected.get("title"))
        query_file.write_text(identity, encoding="utf-8")
    cache_file.write_text(json.dumps(options, indent=2, ensure_ascii=False), encoding="utf-8")
    options = [
        option
        for option in options
        if urlsplit(option["download_url"])
        .path.lower()
        .endswith((".jpg", ".jpeg", ".png", ".webp"))
    ]
    if not options:
        return {"name": name, "error": "No eligible licensed photo; refine the search term."}
    words = [
        word
        for word in re.findall(r"[a-z]+", term.lower())
        if len(word) > 2 and word not in {"white", "background"}
    ]

    def score(option):
        title = option["title"].lower()
        matches = sum(word in title for word in words)
        unsuitable = any(
            word in title
            for word in [
                "woman",
                " kid ",
                " dog ",
                "shattered",
                "zoom burst",
                "ambigram",
                "ballet",
                "projected",
                "nga ",
                " met ",
            ]
        )
        return matches - (10 if unsuitable else 0)

    default = max(range(len(options)), key=lambda i: score(options[i]))
    image = options[selected.get("index", default)]
    image["author"] = plain(image["author"])
    filename = f"{slug(name)}.webp"
    path = CACHE / filename
    selection_file = CACHE / f"{slug(name)}.selected"
    legacy = ASSETS / filename
    same_source = selection_file.exists() and selection_file.read_text() == image["source_url"]
    if not path.exists() and legacy.exists() and same_source:
        path.write_bytes(legacy.read_bytes())
    if not path.exists() or not same_source:
        raw = fetch(image["download_url"])
        with Image.open(io.BytesIO(raw)) as original:
            if original.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError(
                    f"{name}: unsupported source format {original.format}; select another photo."
                )
            photo = ImageOps.exif_transpose(original).convert("RGB")
            photo.thumbnail((800, 800))
            photo.save(path, "WEBP", quality=84, method=6)
        selection_file.write_text(image["source_url"])
    image["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    image["file"] = f"{slug(name)}-{image['sha256'][:12]}.webp"
    (ASSETS / image["file"]).write_bytes(path.read_bytes())
    image["changes"] = (
        "Resized to at most 800px, orientation normalized, converted to WebP; no content edits."
    )
    return {
        "name": name,
        "slug": slug(name),
        "category": slug(category),
        "price": price,
        "sku": f"GENERAL-{index:03d}",
        "initial_stock": 25,
        "image": image,
        "description": (
            f"A {name.lower()} example for the {category.lower()} collection. "
            "Demonstration product with representative photography; price and stock "
            "are sample values, not a supplier offer."
        ),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=3, choices=[1, 2, 3])
    args = parser.parse_args()
    spec = json.loads((ROOT / "demo/products.json").read_text(encoding="utf-8"))
    rows = [(category, row) for category, products in spec.items() for row in products]
    entries = [(category, *row, index) for index, (category, row) in enumerate(rows, 1)]
    if len(entries) != 100 or len({entry[1] for entry in entries}) != 100:
        raise ValueError("Exactly 100 distinct products are required.")
    ASSETS.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        products = list(pool.map(collect, entries))
    errors = [product for product in products if "error" in product]
    if errors:
        print(json.dumps(errors, indent=2))
        raise SystemExit("Some products need photo selection; no manifest was written.")
    manifest = {
        "catalog_id": "general-store-demo-v1",
        "retrieved_at": datetime.now(UTC).isoformat(),
        "categories": [{"name": category, "slug": slug(category)} for category in spec],
        "products": products,
    }
    (ROOT / "demo/catalog.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    # Retire only the legacy unversioned working files created by this collector.
    for product in products:
        legacy = ASSETS / f"{product['slug']}.webp"
        if legacy.exists():
            legacy.unlink()
    print("Collected 100 licensed images. Review demo/catalog.json and the review contact sheets.")


if __name__ == "__main__":
    main()
