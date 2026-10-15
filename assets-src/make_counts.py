"""Dish pictures that show exactly as many pieces as the dish's name says.

The live site used one photo for every size of a dish (the same 7 wings for
4, 8, 12 and 20 wings; the same 4 ribs for 1, 5 and 12 ribs). This script
cuts single whole pieces out of the shop's own photos with SAM (a point on
the piece picks it out, even where it touches its neighbours), then lays out
exactly N of them in a loose pile, each piece turned and lit a little
differently so the pile does not look copied.

Meals are the can and chips from the 3 wings meal photo with an exact pile of
food in front. Dishes with no photo before (1-10 piece chicken, 2 and 8 ribs,
the 1 and 3 piece chicken meals) are made the same way.

Pieces are cached in assets-src/.pieces/; pass --pieces to cut them again
(slow: SAM runs on the CPU). Output: web/public/menu/{slug}.webp, plus
assets-src/.wings-3.png, the 3 wings make_extras.py puts in the box meals.
Run make_food.py first: the can and chips come from its 3 wings meal.
"""
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from scipy import ndimage

from make_food import OUT, ROOT, place

HERE = os.path.dirname(os.path.abspath(__file__))
PIECES = os.path.join(HERE, ".pieces")
SITE = os.path.join(ROOT, "site-data", "images", "2026", "07")
UBER = os.path.join(ROOT, "menu item images")

WINGS_PHOTO = os.path.join(SITE, "6-wings-1-scaled-e1783887641782.jpg")
CHICKEN_PHOTO = os.path.join(SITE, "2-PICE-Chicken-scaled.jpg")
RIBS_PHOTO = os.path.join(UBER, "BBQ Ribs Meal.jpeg")
RINGS_PHOTO = os.path.join(UBER, "Onion Rings (8).jpeg")

# Piece name -> (photo, points as (x, y, 1 = on the piece / 0 = not)). Only
# pieces nothing else covers, so each one is whole. A ring needs points on its
# band and a "not" point in its hole, or SAM picks the hole.
PIECE_POINTS = {
    "wing-a": (WINGS_PHOTO, [(1500, 700, 1)]),
    "wing-b": (WINGS_PHOTO, [(900, 900, 1)]),
    "wing-c": (WINGS_PHOTO, [(800, 500, 1)]),
    "wing-d": (WINGS_PHOTO, [(1300, 350, 1)]),
    "thigh": (CHICKEN_PHOTO, [(878, 805, 1)]),
    "drumstick": (CHICKEN_PHOTO, [(1280, 1189, 1), (1646, 695, 1)]),
    "rib-a": (RIBS_PHOTO, [(280, 290, 1), (350, 320, 1)]),
    "rib-b": (RIBS_PHOTO, [(400, 180, 1)]),
    "ring-a": (RINGS_PHOTO, [(85, 150, 1), (175, 135, 1), (130, 145, 0)]),
    "ring-c": (RINGS_PHOTO, [(345, 130, 1), (445, 130, 1), (395, 130, 0)]),
}

WINGS = ["wing-a", "wing-b", "wing-c", "wing-d"]
CHICKEN = ["drumstick", "thigh"]
RIBS = ["rib-b", "rib-a"]
RINGS = ["ring-a", "ring-c"]
# A piece of chicken is about this much longer than a wing.
PIECE_SCALE = {"drumstick": 1.3, "thigh": 1.3}

# How each kind of piece is piled: (across, down) steps x the piece's size,
# how far a piece may turn, whether it may be mirrored, how far it may stray,
# and how rows shift: "zigzag" puts every other row half a step over so
# pieces show between those in front; "slope" steps each row a little right,
# so ribs laid level stack like the ribs in the shop's photo.
STYLE = {
    "wings": dict(names=WINGS, step=(1.05, 0.72), turn=30, flip=True, jitter=0.12, stagger="zigzag"),
    "chicken": dict(names=CHICKEN, step=(1.0, 0.75), turn=25, flip=True, jitter=0.12, stagger="zigzag"),
    "ribs": dict(names=RIBS, step=(2.3, 0.5), turn=3, flip=False, jitter=0.04, stagger="slope", level=True),
    "rings": dict(names=RINGS, step=(1.0, 0.8), turn=180, flip=True, jitter=0.18, stagger="zigzag"),
}

# Product slug -> (style, pieces in each row, back to front).
PILES = {
    "4-spicy-wings": ("wings", [2, 2]),
    "8-spicy-wings": ("wings", [3, 2, 3]),
    "12-spicy-wings": ("wings", [4, 4, 4]),
    "20-spicy-wings": ("wings", [5, 5, 5, 5]),
    "1-piece-chicken": ("chicken", [1]),
    "2-piece-chicken": ("chicken", [2]),
    "3-piece-chicken": ("chicken", [1, 2]),
    "4-piece-chicken": ("chicken", [2, 2]),
    "6-piece-chicken": ("chicken", [3, 3]),
    "10-piece-chicken": ("chicken", [3, 4, 3]),
    "bbq-lamb-ribs-x-1": ("ribs", [1]),
    "bbq-ribs-2": ("ribs", [1, 1]),
    "bbq-lamb-ribs-x-5": ("ribs", [1, 1, 1, 1, 1]),
    "bbq-ribs-8": ("ribs", [2, 2, 2, 2]),
    "bbq-lamb-ribs-x-12": ("ribs", [2, 2, 2, 2, 2, 2]),
    "onion-ringas-x-4": ("rings", [3, 3]),  # sold as "Onion Rings (6 Pcs)"
    "onion-ringas-x-8": ("rings", [4, 4, 4]),  # (12 Pcs)
    "onion-ringas-x-12": ("rings", [5, 5, 5, 5]),  # (20 Pcs)
}

# Meal slug -> (style, pieces in each row, the pieces in order). The pile
# sits in front of the can and chips.
MEALS = {
    "6-spicy-wings-meal": ("wings", [3, 3], WINGS),
    "flex-combo-meal-1": ("wings", [3, 1], ["wing-a", "wing-c", "wing-b", "drumstick"]),
    "1-piece-chicken-meal": ("chicken", [1], ["drumstick"]),
    "3-piece-chicken-meal": ("chicken", [1, 2], ["drumstick", "thigh", "drumstick"]),
}
# The can and chips in the 3 wings meal cut-out (720 px): the right of the
# picture, less the wing lying across the can's foot.
DRINK_AND_CHIPS = [(395, 260), (700, 260), (700, 650), (522, 650), (522, 520), (490, 468), (450, 446), (395, 428)]
MEAL_WING = 135  # wing size in the meal cut-out, px (sqrt of its area)
FOOD_RIGHT = 530  # the food's right edge tucks over the foot of the can
FOOD_FOOT = 668  # and its foot sits where the 3 wings meal's wings sat
BOX_WINGS = os.path.join(HERE, ".wings-3.png")

SHADOW = (40, 20, 8)
SIDE = 300  # px a wing is drawn at before the dish is fitted to its plate


def largest_part(cut: Image.Image) -> Image.Image:
    """Keeps the biggest solid blob, dropping specks SAM picked up nearby."""
    alpha = np.array(cut.getchannel("A"))
    labels, count = ndimage.label(alpha > 128)
    if count > 1:
        sizes = ndimage.sum(alpha > 128, labels, range(1, count + 1))
        keep = ndimage.binary_dilation(labels == 1 + int(np.argmax(sizes)), iterations=3)
        cut.putalpha(Image.fromarray(np.where(keep, alpha, 0).astype(np.uint8)))
    return cut.crop(cut.getbbox())


def cut_pieces() -> None:
    from rembg import new_session, remove

    os.makedirs(PIECES, exist_ok=True)
    session = new_session("sam")
    for name, (photo, points) in PIECE_POINTS.items():
        src = Image.open(photo).convert("RGB")
        prompt = [{"type": "point", "data": [x, y], "label": label} for x, y, label in points]
        cut = remove(src, session=session, sam_prompt=prompt)
        largest_part(cut).save(os.path.join(PIECES, f"{name}.png"))
        print("piece", name)


def piece(name: str) -> Image.Image:
    return Image.open(os.path.join(PIECES, f"{name}.png")).convert("RGBA")


def level(im: Image.Image) -> Image.Image:
    """Turns a long piece so its long axis lies flat."""
    ys, xs = np.nonzero(np.array(im.getchannel("A")) > 128)
    cov = np.cov(np.vstack([xs - xs.mean(), ys - ys.mean()]))
    vx, vy = np.linalg.eigh(cov)[1][:, -1]
    turned = im.rotate(np.degrees(np.arctan2(vy, vx)), resample=Image.BICUBIC, expand=True)
    return turned.crop(turned.getbbox())


def sized(im: Image.Image, side: float) -> Image.Image:
    """Scales so the piece's solid area equals side x side: pieces cut from
    photos shot at different distances come out the same real size."""
    area = float((np.array(im.getchannel("A")) > 128).sum())
    k = side / area**0.5
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)


def varied(im: Image.Image, rng: random.Random, turn: float, flip: bool) -> Image.Image:
    """The same piece, turned, maybe mirrored and lit a touch differently."""
    if flip and rng.random() < 0.5:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    im = im.rotate(rng.uniform(-turn, turn), resample=Image.BICUBIC, expand=True)
    alpha = im.getchannel("A")
    rgb = ImageEnhance.Brightness(im.convert("RGB")).enhance(rng.uniform(0.93, 1.05))
    rgb = ImageEnhance.Color(rgb).enhance(rng.uniform(0.95, 1.08))
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out.crop(out.getbbox())


def pile(style: str, rows: list, side: float = SIDE, names: list = None, seed: int = 0) -> Image.Image:
    """Exactly sum(rows) pieces in staggered rows, back to front, each in view."""
    kind = STYLE[style]
    names = names or kind["names"]
    rng = random.Random(seed or sum(rows))
    across, down = kind["step"]
    placed = []
    k = 0
    for r, count in enumerate(rows):
        for c in range(count):
            name = names[k % len(names)]
            im = level(piece(name)) if kind.get("level") else piece(name)
            im = varied(sized(im, side * PIECE_SCALE.get(name, 1)), rng, kind["turn"], kind["flip"])
            shift = (0.25 if r % 2 else -0.25) * across if kind["stagger"] == "zigzag" else 0.18 * r
            cx = ((c - (count - 1) / 2) * across + shift) * side
            cy = r * down * side
            cx += rng.uniform(-1, 1) * kind["jitter"] * side
            cy += rng.uniform(-1, 1) * kind["jitter"] * side
            placed.append((cy, cx, im))
            k += 1
    placed.sort(key=lambda p: p[0])  # nearer the front is drawn last, on top
    return compose([(round(cx - im.width / 2), round(cy - im.height / 2), im) for cy, cx, im in placed], side)


def compose(items: list, side: float) -> Image.Image:
    """Draws (x, y, image) in order, each with a soft shadow below it."""
    pad = round(side * 0.3)
    left = min(x for x, _, _ in items) - pad
    top = min(y for _, y, _ in items) - pad
    width = max(x + im.width for x, _, im in items) - left + pad
    height = max(y + im.height for _, y, im in items) - top + pad
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    blur = max(2, side * 0.05)
    room = round(blur * 3)  # so the blur fades out instead of stopping at a hard edge
    for x, y, im in items:
        mask = Image.new("L", (im.width + 2 * room, im.height + 2 * room), 0)
        mask.paste(im.getchannel("A").point(lambda a: a * 0.4), (room, room))
        shade = Image.new("RGBA", mask.size, SHADOW + (0,))
        shade.putalpha(mask.filter(ImageFilter.GaussianBlur(blur)))
        canvas.alpha_composite(shade, (x - left - room, y - top - room + round(side * 0.05)))
        canvas.alpha_composite(im, (x - left, y - top))
    return canvas.crop(canvas.getbbox())


def drink_and_chips() -> Image.Image:
    meal = Image.open(os.path.join(OUT, "3-spicy-wings-meal.webp")).convert("RGBA")
    keep = Image.new("L", meal.size, 0)
    ImageDraw.Draw(keep).polygon(DRINK_AND_CHIPS, fill=255)
    alpha = Image.fromarray(np.minimum(np.array(meal.getchannel("A")), np.array(keep)))
    meal.putalpha(alpha)
    return meal


def meal(style: str, rows: list, names: list) -> Image.Image:
    """Can and chips at the back right, the food in front of them, left."""
    back = drink_and_chips()
    food = pile(style, rows, side=MEAL_WING, names=names, seed=sum(rows) + 100)
    x, y = FOOD_RIGHT - food.width, FOOD_FOOT - food.height
    left, top = min(0, x), min(0, y)
    canvas = Image.new("RGBA", (max(back.width, x + food.width) - left, max(back.height, y + food.height) - top))
    canvas.alpha_composite(back, (-left, -top))
    canvas.alpha_composite(food, (x - left, y - top))
    return canvas.crop(canvas.getbbox())


def save(im: Image.Image, slug: str) -> None:
    dish = place(im)
    rgb = dish.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.4, percent=50, threshold=2))
    rgb.putalpha(dish.getchannel("A"))
    rgb.save(os.path.join(OUT, f"{slug}.webp"), quality=84, method=6)
    print("ok", slug)


def main() -> None:
    if "--pieces" in sys.argv or not os.path.isdir(PIECES):
        cut_pieces()
    for slug, (style, rows) in PILES.items():
        save(pile(style, rows), slug)
    for slug, (style, rows, names) in MEALS.items():
        save(meal(style, rows, names), slug)
    pile("wings", [2, 1]).save(BOX_WINGS)
    print("ok box wings ->", os.path.relpath(BOX_WINGS, ROOT))


if __name__ == "__main__":
    main()
