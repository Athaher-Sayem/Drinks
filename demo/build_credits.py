"""Build an escaped, script-free photo attribution page from the verified manifest."""

import html
from pathlib import Path

from import_catalog import load_catalog

ROOT = Path(__file__).resolve().parents[1]


def main():
    catalog = load_catalog()
    rows = []
    escape = html.escape
    for product in catalog["products"]:
        image = product["image"]
        rows.append(
            f'<article id="{escape(product["slug"])}">'
            f'<img src="/demo-photos/{escape(image["file"])}" '
            f'alt="Representative {escape(product["name"].lower())} photograph" '
            'loading="lazy" width="320" height="220">'
            f"<h2>{escape(product['name'])}</h2>"
            f"<p>{escape(image['title'])}</p><p>Creator: {escape(image['author'])}</p>"
            f'<p><a href="{escape(image["source_url"])}" rel="noreferrer">'
            "Original file and provenance</a> · "
            f'<a href="{escape(image["license_url"])}" rel="noreferrer">'
            f"{escape(image['license'])}</a></p>"
            f'<p class="changes">{escape(image["changes"])} '
            "The thumbnail retains the original license.</p></article>"
        )
    output = (
        '<!doctype html><html lang="en"><head><meta charset="UTF-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="robots" content="noindex"><title>Demo photo credits · Everyday Market</title>'
        '<link rel="stylesheet" href="/demo-credits.css"></head><body><main>'
        '<a href="/">← Back to the storefront</a><h1>The photographs behind the collection.</h1>'
        '<p class="intro">100 example products, with representative photographs sourced online '
        "from Wikimedia Commons. These are demonstration records, not supplier listings. "
        "Creators do not endorse this store.</p>"
        '<p class="intro">Each photograph is individually credited below. Copyright and reuse '
        "rights remain with the original creators under the linked licenses. "
        "CC BY-SA derivatives retain their source license. "
        "Only resizing, orientation normalization, and WebP conversion were performed.</p>"
        '<p class="intro">Review source pages and any non-copyright restrictions before '
        "commercial reuse; Commons metadata is not a legal warranty. Replace representative "
        "photos with your own supplier-approved product photos for a real store.</p>"
        '<section class="credits-grid" aria-label="Photo credits">'
        + "".join(rows)
        + "</section></main></body></html>"
    )
    (ROOT / "frontend/public/photo-credits.html").write_text(output, encoding="utf-8")
    print("Built photo-credits.html with 100 source, creator, license and change notices.")


if __name__ == "__main__":
    main()
