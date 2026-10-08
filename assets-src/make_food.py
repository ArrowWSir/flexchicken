"""Sample dish cut-outs for the turning table, until the owner's photos arrive.

For every product that has a photo on the live site, the background is
removed (rembg) and the dish is placed on a square transparent canvas:
centred, its lowest point at BASE_LINE of the height, so every dish sits on
its plate at the same spot. Output: web/public/menu/{slug}.webp

The owner's real photos should follow the same spec (see PLAN.md, Assets).
"""
import json
import os
import sys

from PIL import Image
from rembg import new_session, remove

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
PRODUCTS = os.path.join(ROOT, "site-data", "data", "products.json")
OUT = os.path.join(ROOT, "web", "public", "menu")

SIZE = 720
DISH_WIDTH = 0.86  # widest a dish may be, x canvas
DISH_HEIGHT = 0.80
BASE_LINE = 0.92  # dish's lowest point, x canvas height


def place(cut: Image.Image) -> Image.Image:
    cut = cut.crop(cut.getbbox())
    scale = min(SIZE * DISH_WIDTH / cut.width, SIZE * DISH_HEIGHT / cut.height)
    cut = cut.resize((round(cut.width * scale), round(cut.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(cut, ((SIZE - cut.width) // 2, round(SIZE * BASE_LINE) - cut.height))
    return canvas


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    session = new_session("isnet-general-use")
    products = json.load(open(PRODUCTS, encoding="utf-8"))
    done = skipped = 0
    for product in products:
        local = next((img["local"] for img in product["images"] if img["local"]), None)
        dest = os.path.join(OUT, f"{product['slug']}.webp")
        if not local or (os.path.exists(dest) and "--force" not in sys.argv):
            skipped += 1
            continue
        src = Image.open(os.path.join(ROOT, "site-data", local)).convert("RGB")
        src.thumbnail((1400, 1400), Image.LANCZOS)
        cut = remove(src, session=session, post_process_mask=True)
        if not cut.getbbox():
            print("empty cut-out:", product["slug"])
            continue
        place(cut).save(dest, quality=84, method=6)
        done += 1
        print("ok", product["slug"])
    print(f"cut-outs: {done} written, {skipped} skipped")


if __name__ == "__main__":
    main()
