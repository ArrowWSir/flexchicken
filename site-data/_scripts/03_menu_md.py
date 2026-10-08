"""Render data/products.json + data/menu-sections.json into a readable data/menu.md."""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "data")


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def fmt_options(product):
    parts = []
    for opt in product["options"]:
        choices = ", ".join(c["label"] + (f" (+£{c['price_add']:.2f})" if c["price_add"] else "") for c in opt["choices"])
        req = "required" if opt["required"] else "optional"
        parts.append(f"{opt['label'].rstrip(':')} [{req}]: {choices}")
    return "<br>".join(parts)


def row(p):
    img = "yes" if any(i["local"] for i in p["images"]) else "**no**"
    return f"| {p['name']} | £{p['price']:.2f} | {p['description'] or ''} | {fmt_options(p) or '–'} | {img} | `{p['slug']}` |"


def main():
    products = load("products.json")
    sections = load("menu-sections.json")
    by_id = {p["id"]: p for p in products}
    lines = [
        "# Flex Chicken: Full Menu",
        "",
        "Generated from `products.json` and `menu-sections.json`. Prices are in GBP.",
        "Sections and item order follow the live `/full-menu/` page.",
        "",
    ]
    listed = set()
    for sec in sections["sections"]:
        lines += [f"## {sec['title']}  (`#{sec['anchor']}`)", "", "| Item | Price | Description | Options | Photo | Slug |", "|---|---|---|---|---|---|"]
        for pid in sec["product_ids"]:
            if pid in by_id:
                lines.append(row(by_id[pid]))
                listed.add(pid)
        lines.append("")
    orphans = [p for p in products if p["id"] not in listed]
    if orphans:
        lines += ["## Not shown on the full menu page", "", "| Item | Price | Description | Options | Photo | Slug |", "|---|---|---|---|---|---|"]
        lines += [row(p) for p in orphans]
        lines.append("")
    with open(os.path.join(DATA, "menu.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"menu.md: {len(listed)} listed, {len(orphans)} orphans")


if __name__ == "__main__":
    main()
