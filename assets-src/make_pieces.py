"""Single whole pieces of food, cut out of the shop's own photos.

The live site used one photo for every size of a dish (the same 7 wings for
4, 8, 12 and 20 wings). To show the right count, make_plated.py builds each
dish from single pieces: wings, a drumstick, a thigh, ribs and onion rings.
SAM cuts them out: a point on a piece picks out just that piece, even where it
touches its neighbours.

The pieces are kept in assets-src/.pieces/, so the photos (not in git) are
only needed to cut them again: python assets-src/make_pieces.py (slow: SAM
runs on the CPU).
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage

from make_food import ROOT

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


if __name__ == "__main__":
    cut_pieces()
