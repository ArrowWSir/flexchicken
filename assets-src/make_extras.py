"""Pictures the shop has no photo for yet, made from what we do have.

- 7up: the Uber Eats photo's white "7" sits on a white background, so the
  background remover took it too and the card showed through the can. A can
  is convex, so the cut-out is filled out to its convex hull.
- Water: a plain bottle with no brand, drawn in water-bottle.svg. Render it
  first (see below), this script places it like every other dish.
- Box meals: each is the burger meal photo (burger, chips, can) with 3 wings
  in front, as the box has "chips, drink & 3 wings". Run make_plated.py
  first: it lays out the 3 wings. (The variety box is drawn on its plate
  by make_plated.py.)
- Category badges: one dish per category, cropped tight and centred, so it
  fills the round badge instead of sitting small at the bottom of it.
  Output: web/public/badges/{category id}.webp

Render the bottle before running (from web/, needs Playwright):
  node scripts/render-svg.mjs ../assets-src/water-bottle.svg ../assets-src/.water-bottle.png
Then: python assets-src/make_extras.py
"""
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter
from rembg import new_session, remove

from make_food import OUT, ROOT, SIZE, place

HERE = os.path.dirname(os.path.abspath(__file__))
UBER = os.path.join(ROOT, "menu item images")
BADGES = os.path.join(ROOT, "web", "public", "badges")

# Box meal slug -> the meal photo it is built on.
BOX_MEALS = {
    "chicken-fillet-burger-box-meal": "chicken-fillet-burger-meal",
    "1-4-pounder-burger-box-meal": "cheese-burger-meal",  # one beef patty
    "1-2-pounder-burger-box-meal": "1-2-pounder-burger-meal",
    "spicy-chicken-burger-box-meal": "spicy-chicken-burger-meal",
    "fusion-flex-burger-box-meal": "fusion-flex-burger-meal",  # already boxed, with wings
}
WINGS = os.path.join(HERE, ".wings-3.png")  # exactly 3, made by make_plated.py
HAS_WINGS = {"fusion-flex-burger-meal"}
WINGS_WIDTH = 0.36  # x the meal photo's width
WINGS_OVERLAP = 0.28  # how far the wings tuck under the meal, x their width

# Category id (app/lib/menuBoard.js) -> the dish its badge shows.
BADGE_DISHES = {
    "burgers": "chicken-fillet-burger",
    "wraps": "chicken-wrap",
    "bbq": "bbq-fillet-burger",
    "ribs": "bbq-lamb-ribs-x-3",
    "peri-peri": "peri-peri-burger",
    "burger-meals": "chicken-fillet-burger-meal",
    "box-meals": "flex-variety-box",
    "wings-chicken": "2-piece-chicken",
    "boneless": "5-chicken-strips",
    "sides": "onion-ringas-x-8",
}
BADGE_SIZE = 264  # 84px badge at 3x
BADGE_FILL = 0.9  # the dish's longer side, x the badge


def load(slug: str) -> Image.Image:
    """A dish's picture: the one drawn on its plate if there is one."""
    plated = os.path.join(OUT, "plated", f"{slug}.webp")
    im = Image.open(plated if os.path.exists(plated) else os.path.join(OUT, f"{slug}.webp")).convert("RGBA")
    return im.crop(im.getbbox())


def save(im: Image.Image, slug: str) -> None:
    place(im).save(os.path.join(OUT, f"{slug}.webp"), quality=84, method=6)
    print("ok", slug)


def cross(o: tuple, a: tuple, b: tuple) -> int:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def convex_hull(points: list) -> list:
    """Andrew's monotone chain."""
    points = sorted(set(points))
    lower, upper = [], []
    for p in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def make_7up(session) -> None:
    src = Image.open(os.path.join(UBER, "7up.jpeg")).convert("RGB")
    cut = remove(src, session=session, post_process_mask=True)
    alpha = cut.getchannel("A")
    px = alpha.load()
    edge = []
    for y in range(alpha.height):
        row = [x for x in range(alpha.width) if px[x, y] > 128]
        if row:
            edge += [(row[0], y), (row[-1], y)]
    hull = Image.new("L", alpha.size, 0)
    ImageDraw.Draw(hull).polygon(convex_hull(edge), fill=255)
    hull = hull.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    can = src.convert("RGBA")
    can.putalpha(ImageChops.lighter(alpha, hull))
    save(can, "7up")


def make_water() -> None:
    bottle = Image.open(os.path.join(HERE, ".water-bottle.png")).convert("RGBA")
    save(bottle.crop(bottle.getbbox()), "water")


def make_box(meal_slug: str) -> Image.Image:
    meal = load(meal_slug)
    if meal_slug in HAS_WINGS:
        return meal
    wings = Image.open(WINGS).convert("RGBA")
    wings = wings.crop(wings.getbbox())
    w = round(meal.width * WINGS_WIDTH)
    wings = wings.resize((w, round(wings.height * w / wings.width)), Image.LANCZOS)
    # The wings sit in front, low and right of centre, overlapping the meal.
    width = meal.width + round(w * (1 - WINGS_OVERLAP)) - round(meal.width * 0.35)
    width = max(width, meal.width)
    height = meal.height + round(wings.height * 0.35)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas.alpha_composite(meal, (0, 0))
    shadow = Image.new("RGBA", (w, wings.height), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((w * 0.08, wings.height * 0.7, w * 0.92, wings.height * 1.0), fill=(40, 20, 8, 90))
    x = width - w
    y = height - wings.height
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(8)), (x, y))
    canvas.alpha_composite(wings, (x, y))
    return canvas


def make_badge(slug: str, category: str) -> None:
    dish = load(slug)
    side = round(BADGE_SIZE * BADGE_FILL)
    scale = side / max(dish.width, dish.height)
    dish = dish.resize((round(dish.width * scale), round(dish.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (BADGE_SIZE, BADGE_SIZE), (0, 0, 0, 0))
    # Centred, a touch low: the eye reads a dish's middle as above its base.
    top = (BADGE_SIZE - dish.height) // 2 + round(BADGE_SIZE * 0.03)
    canvas.alpha_composite(dish, ((BADGE_SIZE - dish.width) // 2, top))
    canvas.save(os.path.join(BADGES, f"{category}.webp"), quality=88, method=6)
    print("badge", category)


def main() -> None:
    os.makedirs(BADGES, exist_ok=True)
    make_7up(new_session("isnet-general-use"))
    make_water()
    for slug, meal in BOX_MEALS.items():
        save(make_box(meal), slug)
    for category, slug in BADGE_DISHES.items():
        make_badge(slug, category)


if __name__ == "__main__":
    main()
