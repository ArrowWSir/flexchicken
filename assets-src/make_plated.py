"""Dishes of pieces (wings, chicken, ribs, onion rings) rendered in 3D on the
table's plate, with exactly as many pieces as the dish's name says.

Each piece is one cut out of the shop's own photos (make_pieces.py), made
solid and dropped onto the plate by plate3d.py, then seen by the table's
camera. A meal's can and chips stand behind the food as upright pictures.
If a piece ends up hidden, the pile is shaken again, so every piece the name
counts can be counted on the plate.

The pictures are drawn to the plate: its width is the picture's width and its
centre sits at plate3d.CENTRE_Y. They go in web/public/menu/plated/, which
tells the table to stand them on the plate as drawn (TableStage).
Also writes assets-src/.wings-3.png, the 3 wings make_extras.py puts in the
burger box meals.

  python assets-src/make_plated.py [slug ...]
"""
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageEnhance
from scipy import ndimage

import plate3d as p3
from make_food import OUT
from make_pieces import HERE, level, piece

PLATED = os.path.join(OUT, "plated")
BOX_WINGS = os.path.join(HERE, ".wings-3.png")

# Real sizes, cm. The plate is 24 cm across; a meal's is 32, to fit the can.
PLATE_CM, MEAL_PLATE_CM = 24, 32
FOOD_ZONE = 8.5  # the food stays this close to the plate's centre, cm
# length: along the piece; ridge: its thickest half-width, cm; top: how tall
# it stands, x its half-width (food lies flat on the plate, so its underside
# is flat and its top is a dome).
KINDS = {
    "wing": dict(length=8.5, top=1.6, ridge=1.7),
    "drumstick": dict(length=12.5, top=1.7, ridge=2.5),
    "thigh": dict(length=10.0, top=1.5, ridge=2.4),
    "rib": dict(length=12.5, top=1.1, ridge=1.5, bumps=0.08, level=True),
    "ring": dict(length=6.5, top=1.9, ridge=0.65, bumps=0.06),
}
MIN_SEEN = 0.35  # every piece shows at least this much, or the pile is shaken again
# A piece's photo was taken from higher than the table's camera, so it is
# squashed this much top to bottom to sit on the plate.
FORESHORTEN = 0.78
WARM = np.array([1.0, 0.82, 0.62])  # colour shade leans to, per unit of darkening
TRIES = 14

WINGS = ["wing-a", "wing-b", "wing-c", "wing-d"]


def take(names: list, n: int) -> list:
    return [names[i % len(names)] for i in range(n)]


def wings(n: int) -> list:
    return take(WINGS, n)


# Slug -> the pieces, in the order they are dropped, and how they are laid.
DISHES = {
    **{f"{n}-spicy-wings": dict(pieces=wings(n)) for n in (4, 6, 8, 12, 20)},
    "1-piece-chicken": dict(pieces=["drumstick"]),
    "2-piece-chicken": dict(pieces=["thigh", "drumstick"]),
    "3-piece-chicken": dict(pieces=take(["thigh", "drumstick"], 3)),
    "4-piece-chicken": dict(pieces=take(["thigh", "drumstick"], 4)),
    "6-piece-chicken": dict(pieces=take(["thigh", "drumstick"], 6)),
    "10-piece-chicken": dict(pieces=take(["thigh", "drumstick"], 10)),
    "bbq-lamb-ribs-x-1": dict(pieces=["rib-b"], layout="shingle"),
    "bbq-ribs-2": dict(pieces=take(["rib-b", "rib-a"], 2), layout="shingle"),
    "bbq-lamb-ribs-x-5": dict(pieces=take(["rib-b", "rib-a"], 5), layout="shingle"),
    "bbq-ribs-8": dict(pieces=take(["rib-b", "rib-a"], 8), layout="shingle"),
    "bbq-lamb-ribs-x-12": dict(pieces=take(["rib-b", "rib-a"], 12), layout="shingle"),
    "onion-ringas-x-4": dict(pieces=take(["ring-a", "ring-c"], 6)),  # "Onion Rings (6 Pcs)"
    "onion-ringas-x-8": dict(pieces=take(["ring-a", "ring-c"], 12)),  # (12 Pcs)
    "onion-ringas-x-12": dict(pieces=take(["ring-a", "ring-c"], 20)),  # (20 Pcs)
    # Meals: the food in front, a can and chips behind.
    "3-spicy-wings-meal": dict(pieces=wings(3), meal=True),
    "6-spicy-wings-meal": dict(pieces=wings(6), meal=True),
    "flex-combo-meal-1": dict(pieces=["drumstick", *wings(3)], meal=True),
    "1-piece-chicken-meal": dict(pieces=["drumstick"], meal=True),
    "2-piece-chicken-meal": dict(pieces=["thigh", "drumstick"], meal=True),
    "3-piece-chicken-meal": dict(pieces=take(["thigh", "drumstick"], 3), meal=True),
    "flex-variety-box": dict(pieces=["thigh", "drumstick", *wings(3)], meal=True),
}
MEAL_FOOD = (-3.6, -2.4, 7.0)  # a meal's food: centre x, y and reach, cm
# A meal's upright pictures: (picture, centre x, y, width, footprint radius), cm.
MEAL_SIDES = [("can", 2.6, 6.4, 6.6, 3.3), ("chips", 8.2, 2.6, 8.0, 3.6)]


def kind_of(name: str) -> dict:
    return KINDS[name.split("-")[0]]


def length_px(im: Image.Image) -> float:
    ys, xs = np.nonzero(np.array(im.getchannel("A")) > 128)
    pts = np.vstack([xs - xs.mean(), ys - ys.mean()])
    axis = np.linalg.eigh(np.cov(pts))[1][:, -1]
    along = axis @ pts
    return float(along.max() - along.min())


def shaped(name: str, res: float, rng: random.Random, turn: float) -> tuple:
    """One piece, at its real size, turned, maybe mirrored, lit a touch
    differently from its twins: its photo and its solid."""
    kind = kind_of(name)
    im = level(piece(name)) if kind.get("level") else piece(name)
    if rng.random() < 0.5:
        im = im.transpose(Image.FLIP_LEFT_RIGHT if not kind.get("level") else Image.FLIP_TOP_BOTTOM)
    k = kind["length"] * res / length_px(im)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    im = im.rotate(turn, resample=Image.BICUBIC, expand=True)
    alpha = im.getchannel("A")
    rgb = ImageEnhance.Brightness(im.convert("RGB")).enhance(rng.uniform(0.94, 1.04))
    rgb = ImageEnhance.Color(rgb).enhance(rng.uniform(0.96, 1.06)).convert("RGBA")
    rgb.putalpha(alpha)
    return rgb, p3.solid(rgb, res, kind)


def lying(name: str, rng: random.Random) -> float:
    """How far a piece is turned. Long pieces lie across the plate, either way
    round: one turned to point at the camera would read as standing up."""
    if name.startswith("ring"):
        return rng.uniform(0, 360)
    return rng.choice((0, 180)) + rng.uniform(-30, 30)


def mound(names: list, centre: tuple, reach: float, rng: random.Random) -> list:
    """(x, y, turn) for each piece: spread in a sunflower spiral, the outer
    ones dropped first so the middle ones settle on top."""
    n = len(names)
    area = sum(kind_of(nm)["length"] ** 2 * 0.32 for nm in names)
    # A few pieces lie side by side on the plate; more pile up.
    radius = min(reach, math.sqrt(area * (1.5 if n <= 4 else 0.9) / math.pi))
    golden = math.pi * (3 - math.sqrt(5))
    spin = rng.uniform(0, 2 * math.pi)
    spots = []
    for k in range(n):
        r = 0 if n == 1 else radius * math.sqrt((k + 0.5) / n) * rng.uniform(0.85, 1.05)
        a = k * golden + spin
        spots.append((centre[0] + r * math.cos(a), centre[1] + r * math.sin(a), lying(names[k], rng)))
    return spots[::-1]


def shingle(names: list, rng: random.Random) -> list:
    """Ribs side by side, slanting, each resting on the edge of the one
    behind it, like ribs laid on a plate."""
    n = len(names)
    slant = rng.uniform(16, 26)
    step = min(2.4, 15 / max(1, n - 1))
    across = (math.sin(math.radians(slant)), -math.cos(math.radians(slant)))  # towards the camera
    spots = []
    for k in range(n):
        off = (k - (n - 1) / 2) * step
        spots.append((off * across[0] + rng.uniform(-0.4, 0.4), off * across[1], slant + rng.uniform(-4, 4)))
    return spots


def build(spec: dict, rng: random.Random) -> tuple:
    """Drops the dish's pieces onto the plate; returns the scene and, for
    each piece, its photo and where it came to rest."""
    meal = spec.get("meal", False)
    scene = p3.Scene(MEAL_PLATE_CM if meal else PLATE_CM)
    names = spec["pieces"]
    if spec.get("layout") == "shingle":
        spots = shingle(names, rng)
    elif meal:
        spots = mound(names, MEAL_FOOD[:2], MEAL_FOOD[2], rng)
    else:
        spots = mound(names, (0, 0), FOOD_ZONE, rng)
    pieces = []
    for name, (x, y, turn) in zip(names, spots):
        photo, body = shaped(name, scene.res, rng, turn)
        pieces.append((photo, body, p3.drop(scene, body, x, y)))
    return scene, pieces


def can() -> Image.Image:
    im = Image.open(os.path.join(OUT, "coca-cola.webp")).convert("RGBA")
    return im.crop(im.getbbox())


def chips() -> Image.Image:
    """The chips from the 3 wings meal photo. A wing hid the box's lower left
    corner there; the box is the same both sides, so its right is mirrored in."""
    meal = np.array(Image.open(os.path.join(OUT, "3-spicy-wings-meal.webp")).convert("RGBA"))
    box = meal[350:660, 465:690].copy()
    r, g, b = (box[..., i].astype(int) for i in range(3))
    # Left of the box the chips stand in front of the can: keep only chips.
    can_side = np.zeros(box.shape[:2], bool)
    can_side[:, :20] = True
    box[can_side & ~((r > 150) & (g > 110) & (b < 140) & (r - g < 90)), 3] = 0
    axis = 105  # the box's middle, px into the crop
    rows = slice(90, 310)
    for x in range(15, 72):
        box[rows, x] = box[rows, 2 * axis - x]
    im = Image.fromarray(box)
    return im.crop(im.getbbox())


SIDE_PICTURES = {"can": can, "chips": chips}


def side_shadows(scene: p3.Scene) -> tuple:
    """The ground shadow each upright picture throws, and its footprint."""
    n, res = scene.n, scene.res
    rows, cols = np.mgrid[0:n, 0:n]
    x = (cols - n / 2) / res
    y = (n / 2 - rows) / res
    flat = math.hypot(p3.LIGHT[0], p3.LIGHT[1])
    away = (-p3.LIGHT[0] / flat, -p3.LIGHT[1] / flat)
    shade = np.zeros((n, n), np.float32)
    feet = np.zeros((n, n), np.float32)
    for name, cx, cy, width, foot in MEAL_SIDES:
        height = width * SIDE_ASPECT[name]
        reach = height * flat / p3.LIGHT[2]
        t = np.clip(((x - cx) * away[0] + (y - cy) * away[1]) / reach, 0, 1)
        dist = np.hypot(x - cx - t * reach * away[0], y - cy - t * reach * away[1])
        shade = np.maximum(shade, (dist < foot * (1 - 0.35 * t)).astype(np.float32))
        feet = np.maximum(feet, (np.hypot(x - cx, y - cy) < foot).astype(np.float32))
    return shade, feet


SIDE_ASPECT = {}  # height / width of each upright picture, filled when loaded


def over(canvas: np.ndarray, rgb: np.ndarray, alpha: np.ndarray, where: np.ndarray = None) -> None:
    """Paints colour over the premultiplied canvas, only where `where` is set."""
    a = alpha if where is None else np.where(where, alpha, 0)
    canvas[..., :3] = rgb * a[..., None] + canvas[..., :3] * (1 - a[..., None])
    canvas[..., 3] = a + canvas[..., 3] * (1 - a)


def stand(canvas: np.ndarray, scene: p3.Scene, im: Image.Image, cx: float, cy: float, width: float, foot: float) -> np.ndarray:
    """An upright picture standing on the plate at (cx, cy), cm; returns
    where it covers the canvas."""
    res, n = scene.res, scene.n
    w = round(width * res)
    h = round(w * im.height / im.width * p3.COS)
    pic = np.asarray(im.resize((w, h), Image.LANCZOS), np.float32) / 255
    left = round(n / 2 + cx * res - w / 2)
    bottom = round(p3.CENTRE_Y * p3.SS - (cy - foot) * p3.SIN * res)
    return paint(canvas, pic, left, bottom - h)


def paint(canvas: np.ndarray, pic: np.ndarray, left: int, top: int) -> np.ndarray:
    """Paints a straight-alpha RGBA array onto the canvas at (left, top);
    returns where it covers the canvas."""
    n = canvas.shape[0]
    h, w = pic.shape[:2]
    sr, sc = slice(max(0, top), min(n, top + h)), slice(max(0, left), min(n, left + w))
    covers = np.zeros(canvas.shape[:2], bool)
    if sr.start >= sr.stop or sc.start >= sc.stop:
        return covers
    part = pic[sr.start - top:sr.stop - top, sc.start - left:sc.stop - left]
    over(canvas[sr, sc], part[..., :3], part[..., 3])
    covers[sr, sc] = part[..., 3] > 0.5
    return covers


def lay(canvas: np.ndarray, scene: p3.Scene, photo: Image.Image, body: dict, rest: dict, shadow: np.ndarray) -> np.ndarray:
    """A piece's photo laid where it came to rest: its front edge where it
    touches the plate (or the food under it), lifted and tipped as it lies,
    squashed a little for the table's lower camera, and lit and shadowed as
    the 3D pile is. Returns where it covers the canvas."""
    h, w = photo.height, photo.width
    a, b = rest["lean"]
    mid_r, mid_c = rest["mid"]
    front = rest["front"]
    # Picture px down per photo row, and per photo column (from the lean).
    p = FORESHORTEN + b * p3.COS
    q = -a * p3.COS
    lift = rest["z"] + b * (mid_r - front) / scene.res
    y0 = p3.screen_y(scene, rest["row"] + front, lift) - p * front - q * mid_c
    ys = [y0 + p * r + q * c for r in (0, h) for c in (0, w)]
    top = math.floor(min(ys))
    size = (w, math.ceil(max(ys)) - top + 1)
    warp = (1, 0, 0, -q / p, 1 / p, (top - y0) / p)
    rgba = photo.convert("RGBa").transform(size, Image.AFFINE, warp, Image.BILINEAR).convert("RGBA")
    r0, c0 = rest["row"], rest["col"]
    # Shadows other pieces throw on it, only where it is the top of the pile.
    shaded = np.zeros((h, w), np.float32)
    gr, gc = slice(max(0, r0), min(scene.n, r0 + h)), slice(max(0, c0), min(scene.n, c0 + w))
    own = scene.ids[gr, gc] == rest["id"]
    shaded[gr.start - r0:gr.stop - r0, gc.start - c0:gc.stop - c0] = np.where(own, shadow[gr, gc], 0)
    lit = p3.lighting(body) * (1 - 0.38 * shaded)
    lit = np.asarray(Image.fromarray(lit, "F").transform(size, Image.AFFINE, warp, Image.BILINEAR))
    pic = np.asarray(rgba, np.float32) / 255
    lit = np.clip(lit, 0.3, 1.2)[..., None]
    # Shade on fried food turns a warmer brown, not grey.
    pic[..., :3] *= lit * WARM ** (1 - np.minimum(lit, 1))
    return paint(canvas, pic, c0, top)


def draw_order(items: list) -> list:
    """Back to front, but a piece lying on others always after them."""
    left = set(range(len(items)))
    order = []
    while left:
        ready = [i for i in left if not (items[i]["on"] & left)] or list(left)
        nxt = min(ready, key=lambda i: items[i]["key"])
        order.append(nxt)
        left.remove(nxt)
    return order


def picture(spec: dict, seed: int) -> tuple:
    """Renders the dish once; returns the picture and how much of each piece shows."""
    rng = random.Random(seed)
    scene, pieces = build(spec, rng)
    shadow = p3.cast_shadow(scene.top, scene.res)
    meal = spec.get("meal", False)
    if meal:
        side_shade, feet = side_shadows(scene)
        shadow = np.maximum(shadow, p3.soft(side_shade, scene.res * 0.3))
    ground = p3.ground_shadow(scene, shadow)
    if meal:
        ground = np.clip(1 - (1 - ground) * (1 - 0.4 * p3.soft(feet, scene.res * 0.5)), 0, 1)
    n = scene.n
    canvas = np.zeros((n, n, 4), np.float32)
    over(canvas, np.broadcast_to(p3.SHADOW_RGB, (n, n, 3)), p3.plate_layer(scene, ground) * 0.9)

    def piece_item(photo: Image.Image, body: dict, rest: dict) -> dict:
        return {"key": p3.screen_y(scene, rest["row"] + rest["front"], 0), "on": rest["on"],
                "draw": lambda: lay(canvas, scene, photo, body, rest, shadow)}

    def side_item(name: str, cx: float, cy: float, width: float, foot: float) -> dict:
        row = n / 2 - (cy - foot) * scene.res - 0.5
        return {"key": p3.screen_y(scene, row, 0), "on": set(),
                "draw": lambda: stand(canvas, scene, SIDE_PICTURES[name](), cx, cy, width, foot)}

    items = [piece_item(*p) for p in pieces]
    items += [side_item(*side) for side in (MEAL_SIDES if meal else [])]
    ids = np.full((n, n), -1, np.int16)
    drawn = {}
    for i in draw_order(items):
        covers = items[i]["draw"]()
        ids[covers] = i
        drawn[i] = max(1, int(covers.sum()))
    seen = [float((ids == i).sum()) / drawn[i] for i in range(len(pieces))]
    return shrink(canvas), seen


def shrink(canvas: np.ndarray) -> Image.Image:
    """The supersampled render, shrunk to size with smooth edges."""
    n = p3.SIZE
    small = canvas.reshape(n, p3.SS, n, p3.SS, 4).mean(axis=(1, 3))
    alpha = small[..., 3:4]
    rgb = np.where(alpha > 0, small[..., :3] / np.maximum(alpha, 1e-6), 0)
    out = np.concatenate([rgb, alpha], axis=-1)
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA")


def best_picture(slug: str, spec: dict) -> Image.Image:
    """Shakes the pile until every piece shows."""
    best = None
    base = sum(map(ord, slug))
    for t in range(TRIES):
        im, seen = picture(spec, base + t)
        low = min(seen) if seen else 1
        if best is None or low > best[0]:
            best = (low, im)
        if low >= MIN_SEEN:
            break
    print(f"ok {slug}: {len(spec['pieces'])} pieces, least seen {best[0]:.2f}")
    return best[1]


def main() -> None:
    os.makedirs(PLATED, exist_ok=True)
    for name, make in SIDE_PICTURES.items():
        im = make()
        SIDE_ASPECT[name] = im.height / im.width
    only = set(sys.argv[1:])
    for slug, spec in DISHES.items():
        if only and slug not in only:
            continue
        best_picture(slug, spec).save(os.path.join(PLATED, f"{slug}.webp"), quality=86, method=6)
    if not only or "box-wings" in only:
        im, _ = picture(dict(pieces=wings(3)), 7)
        im.crop(im.getbbox()).save(BOX_WINGS)
        print("ok box wings ->", BOX_WINGS)


if __name__ == "__main__":
    main()
