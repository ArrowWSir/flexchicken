"""Dish cut-outs from the shop's Uber Eats photos, for dishes the live site has no photo for.

Source photos sit in `menu item images/`, named after the Uber Eats item.
Each is mapped to the product slugs it stands in for, cut out with rembg and
placed with the same spec as make_food.py. Output: web/public/menu/{slug}.webp

Existing cut-outs are kept unless --force is passed.
"""
import os
import sys

from PIL import Image
from rembg import new_session, remove

from make_food import OUT, ROOT, place

SRC = os.path.join(ROOT, "menu item images")

# Uber Eats photo -> product slugs (site-data/data/products.json) it is used for.
PHOTOS = {
    "Double Fillet Burger.jpeg": ["double-fillet-burger"],
    "Hash Brown Stack.jpeg": ["hash-brown-stack"],
    "Onion Rings (8).jpeg": ["onion-ringas-x-4", "onion-ringas-x-8", "onion-ringas-x-12"],
    "BBQ Ribs Meal.jpeg": ["bbq-lamb-ribs-x-1", "bbq-lamb-ribs-x-3", "bbq-lamb-ribs-x-5", "bbq-lamb-ribs-x-12"],
    # The live site's 7up cut-out lost half the can; this photo replaces it.
    "7up.jpeg": ["7up"],
}
REPLACE = {"7up"}


def main() -> None:
    force = "--force" in sys.argv
    session = new_session("isnet-general-use")
    done = skipped = 0
    for photo, slugs in PHOTOS.items():
        todo = [s for s in slugs if force or s in REPLACE or not os.path.exists(os.path.join(OUT, f"{s}.webp"))]
        if not todo:
            skipped += len(slugs)
            continue
        src = Image.open(os.path.join(SRC, photo)).convert("RGB")
        cut = remove(src, session=session, post_process_mask=True)
        if not cut.getbbox():
            print("empty cut-out:", photo)
            continue
        dish = place(cut)
        for slug in todo:
            dish.save(os.path.join(OUT, f"{slug}.webp"), quality=84, method=6)
            done += 1
            print("ok", slug, "<-", photo)
        skipped += len(slugs) - len(todo)
    print(f"cut-outs: {done} written, {skipped} skipped")


if __name__ == "__main__":
    main()
