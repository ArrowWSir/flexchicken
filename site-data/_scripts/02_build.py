"""Build clean structured data (menu, options, images) from raw downloads."""
import html
import json
import os
import re
import urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAW = os.path.join(ROOT, "raw")
OUT = os.path.join(ROOT, "data")


def load(name):
    with open(os.path.join(RAW, "api", f"{name}.json"), encoding="utf-8") as f:
        return json.load(f)


def read_html(name):
    path = os.path.join(RAW, "html", f"{name}.html")
    return open(path, encoding="utf-8").read() if os.path.exists(path) else ""


def clean(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    return " ".join(html.unescape(text).split())


def original_url(url):
    return re.sub(r"-\d+x\d+(\.\w+)$", r"\1", url)


def local_image(url):
    if not url or "woocommerce-placeholder" in url:
        return None
    rel = urllib.parse.unquote(urllib.parse.urlparse(original_url(url)).path.split("/wp-content/uploads/")[-1])
    return f"images/{rel}" if os.path.exists(os.path.join(ROOT, "images", rel)) else None


def parse_options(page):
    """Parse WAPF (Advanced Product Fields) option groups from a product page."""
    fields = []
    form = page.split('class="wapf-wrapper"', 1)[-1].split('name="wapf_field_groups"', 1)[0] if "wapf-wrapper" in page else ""
    for container in form.split('<div class="wapf-field-container ')[1:]:
        ftype = re.match(r"wapf-field-([a-z_-]+)", container)
        label = re.search(r'<div class="wapf-field-label[^"]*"><label><span>(.*?)</span>', container, re.S)
        choices = []
        for c in re.findall(r'<div class="wapf-checkable[^"]*">(.*?)</label>', container, re.S):
            name = re.search(r'<span class="wapf-label-text">(.*?)(?:<span class="wapf-pricing-hint|</span>)', c, re.S)
            price = re.search(r'data-wapf-price="([^"]+)"', c)
            choices.append({
                "label": clean(name.group(1)) if name else "",
                "price_add": float(price.group(1)) if price else 0.0,
                "default": "checked" in c,
            })
        fields.append({
            "label": clean(label.group(1)) if label else "",
            "type": ftype.group(1) if ftype else "unknown",
            "required": 'class="required"' in container,
            "choices": choices,
        })
    return fields


def parse_description(page):
    m = re.search(r'id="tab-description"[^>]*>(.*?)</div>', page, re.S)
    return clean(m.group(1)) if m else ""


def build_products():
    products = []
    for p in sorted(load("products"), key=lambda x: x["menu_order"] if "menu_order" in x else x["id"]):
        page = read_html(f"product__{p['slug']}")
        images = []
        for img in p["images"]:
            images.append({"local": local_image(img["src"]), "source_url": original_url(img["src"]), "alt": img.get("alt", "")})
        price = int(p["prices"]["price"]) / 100
        regular = int(p["prices"]["regular_price"]) / 100
        products.append({
            "id": p["id"],
            "name": html.unescape(p["name"]),
            "slug": p["slug"],
            "url": p["permalink"],
            "price": price,
            "regular_price": regular,
            "on_sale": p["on_sale"],
            "currency": "GBP",
            "description": clean(p["description"]) or parse_description(page),
            "categories": [{"id": c["id"], "slug": c["slug"], "name": html.unescape(c["name"])} for c in p["categories"]],
            "images": images,
            "in_stock": p["is_in_stock"],
            "options": parse_options(page),
        })
    return products


def build_categories():
    cats = []
    for c in load("product_categories"):
        cats.append({
            "id": c["id"], "slug": c["slug"], "name": html.unescape(c["name"]),
            "count": c["count"], "description": clean(c.get("description", "")),
            "image": local_image((c.get("image") or {}).get("src")),
        })
    return cats


def build_menu_sections(products):
    """Section order + product order exactly as shown on /full-menu/."""
    page = read_html("full-menu")
    by_id = {p["id"]: p for p in products}
    nav = [(a, clean(t)) for a, t in re.findall(r'<a href="#([^"]+)"[^>]*>(.*?)</a>', page.split('class="fc-category-wrapper"')[1].split("</div>")[0])]
    parts = re.split(r'<h3 id="([^"]+)"[^>]*>(.*?)</h3>', page)
    sections = []
    for i in range(1, len(parts), 3):
        anchor, title, body = parts[i], clean(parts[i + 1]), parts[i + 2]
        body = body.split("<h3 ")[0]
        ids = []
        for pid in re.findall(r'data-wp-key="product-item-(\d+)"', body):
            if int(pid) not in ids:
                ids.append(int(pid))
        sections.append({
            "anchor": anchor, "title": title,
            "product_ids": ids,
            "products": [by_id[i]["name"] for i in ids if i in by_id],
        })
    present = {s["anchor"] for s in sections}
    return {
        "nav_pills": [{"anchor": a, "label": t, "section_exists": a in present} for a, t in nav],
        "sections": sections,
    }


def build_image_manifest():
    media = load("media")
    items = []
    for m in media:
        src = m.get("source_url", "")
        items.append({
            "id": m["id"], "title": clean(m["title"]["rendered"]), "alt": m.get("alt_text", ""),
            "mime": m.get("mime_type"), "width": (m.get("media_details") or {}).get("width"),
            "height": (m.get("media_details") or {}).get("height"),
            "local": local_image(src), "source_url": src,
        })
    return items


def save(name, data):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    products = build_products()
    save("products.json", products)
    save("categories.json", build_categories())
    save("menu-sections.json", build_menu_sections(products))
    save("images.json", build_image_manifest())
    with_opts = sum(1 for p in products if p["options"])
    print(f"products {len(products)} | with options {with_opts} | with images {sum(1 for p in products if p['images'])}")
