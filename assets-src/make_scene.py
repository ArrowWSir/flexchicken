"""Build the turning-table scene from the owner's images.

Outputs to web/public/scene/:
  plate.webp       the real plate, cut out of plate 1.jpg along its rim
  table-top.webp,  the owner's travertine table (table.jpg): see make_table.py
  table-edge.webp
  mat.webp         the owner's round jute table mat (table mat.jpg), cut off
                   its white backdrop, seen at the plate's camera tilt, with
                   its braided edge showing a little thickness
  scene.json       geometry and colours measured from the photo

Measured in plate 1.jpg (736 x 920):
  plate ellipse centre (359, 529), half-axes 258 x 138  -> camera tilt 0.535

The wooden top (wood finish.jpg) was replaced by table.jpg on 2026-10-09.
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from make_table import build_table

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "plate 1.jpg")
MAT_SRC = os.path.join(HERE, "..", "table mat.jpg")
OUT = os.path.join(HERE, "..", "web", "public", "scene")

PLATE_CENTRE = (359, 529)
PLATE_AXES = (258, 138)
PLATE_PAD = (5, 4)  # include the rim's outer bevel
TILT = PLATE_AXES[1] / PLATE_AXES[0]
MAT_WIDTH = 720  # output width; the stage never draws a mat wider than ~260px
MAT_BACKDROP = 40  # how far from white a pixel must be to count as mat
MAT_THICKNESS = 0.012  # x mat width: the braided edge seen below the top
MAT_EDGE_SHADE = 0.55


def plate_cutout(photo: Image.Image) -> Image.Image:
    cx, cy = PLATE_CENTRE
    ax, ay = PLATE_AXES[0] + PLATE_PAD[0], PLATE_AXES[1] + PLATE_PAD[1]
    box = (cx - ax, cy - ay, cx + ax, cy + ay)
    crop = photo.crop(box).convert("RGBA")
    mask = Image.new("L", crop.size, 0)
    ImageDraw.Draw(mask).ellipse((1, 1, crop.width - 2, crop.height - 2), fill=255)
    crop.putalpha(mask.filter(ImageFilter.GaussianBlur(1.2)))
    return crop


def mat_cutout(photo: Image.Image) -> Image.Image:
    """The round mat, cut off its white backdrop and tilted like the plate."""
    px = np.asarray(photo, dtype=float)
    is_mat = (255 - px).max(axis=2) > MAT_BACKDROP
    rows, cols = np.nonzero(is_mat)
    # The mat is a circle: its extent gives the centre and radius.
    left, right, top, bottom = cols.min(), cols.max(), rows.min(), rows.max()
    radius = min(right - left, bottom - top) / 2
    cx, cy = (left + right) / 2, (top + bottom) / 2
    box = tuple(int(round(v)) for v in (cx - radius, cy - radius, cx + radius, cy + radius))
    disc = photo.crop(box).convert("RGBA")
    mask = Image.new("L", disc.size, 0)
    ImageDraw.Draw(mask).ellipse((1, 1, disc.width - 2, disc.height - 2), fill=255)
    disc.putalpha(mask.filter(ImageFilter.GaussianBlur(1.2)))

    height = round(MAT_WIDTH * TILT)
    face = disc.resize((MAT_WIDTH, height), Image.LANCZOS)
    # The braided edge: a darker copy just below the face.
    drop = max(2, round(MAT_WIDTH * MAT_THICKNESS))
    edge = face.copy()
    rgb = edge.convert("RGB").point(lambda v: int(v * MAT_EDGE_SHADE))
    edge = Image.merge("RGBA", (*rgb.split(), edge.getchannel("A")))
    out = Image.new("RGBA", (MAT_WIDTH, height + drop), (0, 0, 0, 0))
    out.alpha_composite(edge, (0, drop))
    out.alpha_composite(face, (0, 0))
    return out


def hex_of(rgb) -> str:
    return "#{:02x}{:02x}{:02x}".format(*[int(c) for c in rgb[:3]])


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    photo = Image.open(SRC).convert("RGB")

    plate = plate_cutout(photo)
    plate.save(os.path.join(OUT, "plate.webp"), lossless=True, method=6)

    top_colour = build_table()

    mat = mat_cutout(Image.open(MAT_SRC).convert("RGB"))
    mat.save(os.path.join(OUT, "mat.webp"), quality=90, method=6)

    pixels = np.asarray(photo, dtype=float)
    scene = {
        "tilt": round(TILT, 3),
        "plateAspect": round(plate.height / plate.width, 3),
        "matAspect": round(mat.height / mat.width, 3),
        "wall": hex_of(pixels[30:330, 100:640].reshape(-1, 3).mean(0)),
        "top": top_colour,
    }
    with open(os.path.join(OUT, "scene.json"), "w", encoding="utf-8") as f:
        json.dump(scene, f, indent=2)
    print(scene, "plate", plate.size, "mat", mat.size)


if __name__ == "__main__":
    main()
