"""Brand assets for the web app (web/public/brand/).

  logo-full.png      the colour wordmark as PNG, for social share cards
  icon-192.png, icon-512.png, apple-touch-icon.png   app icons on cream
  logo.svg, logo-on-dark.svg, icon.svg
                     the owner's official vectors (Flex-Chicken.zip, unzipped
                     to brand-kit/), copied byte for byte under web-safe names
  card-face.webp     loyalty card finish: the owner's metallic texture
                     ("card texture.jpg") recoloured to Flex red, keeping its relief

Card red is the FLEX wordmark red from the live site's logo (#d92b2d), shaded
down toward the site's darker red (#b71918).
"""
import os
import shutil

import numpy as np
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
UPLOADS = os.path.join(ROOT, "site-data", "images", "2026", "07")
OUT = os.path.join(ROOT, "web", "public", "brand")

KIT_SVG = os.path.join(ROOT, "brand-kit", "SVG")
# Official vector -> published name. "Colored 2" is the flame in colour with a
# white wordmark, the designer's version for dark and red backgrounds.
KIT_FILES = {
    "FLEX CHICKEN  Version 1 Colored_1.svg": "logo.svg",
    "FLEX CHICKEN  Version 1 Colored 2_1.svg": "logo-on-dark.svg",
    "FLEX CHICKEN Icon Colored_1.svg": "icon.svg",
}

CARD_RATIO = 1.586  # ISO/IEC 7810 ID-1, same as a bank card
CARD_WIDTH = 1200
# Gradient map from the texture's luminance: deep shadow -> site red ->
# wordmark red -> warm highlight. The relief of the foil survives; the copper goes.
CARD_RAMP = ["#3d0709", "#8f1214", "#b71918", "#d92b2d", "#f2675c"]
CREAM = (251, 245, 236)


def hex_to_rgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)


def gradient_map(gray: np.ndarray, ramp) -> np.ndarray:
    stops = np.array([hex_to_rgb(h) for h in ramp])
    pos = np.clip(gray, 0, 1) * (len(stops) - 1)
    lo = np.floor(pos).astype(int).clip(0, len(stops) - 2)
    t = (pos - lo)[..., None]
    return stops[lo] * (1 - t) + stops[lo + 1] * t


def card_face() -> Image.Image:
    tex = Image.open(os.path.join(ROOT, "card texture.jpg")).convert("RGB")
    tex = tex.rotate(90, expand=True)  # portrait photo -> landscape card
    w, h = tex.size
    target_w = round(h * CARD_RATIO)
    left = (w - target_w) // 2
    tex = tex.crop((left, 0, left + target_w, h))
    gray = np.asarray(ImageOps.grayscale(tex), dtype=float) / 255
    # Stretch the foil's narrow tonal range so the ramp is used end to end.
    lo, hi = np.percentile(gray, 1), np.percentile(gray, 99)
    gray = np.clip((gray - lo) / (hi - lo), 0, 1)
    rgb = gradient_map(gray ** 0.95, CARD_RAMP)
    card = Image.fromarray(rgb.clip(0, 255).astype(np.uint8), "RGB")
    return card.resize((CARD_WIDTH, round(CARD_WIDTH / CARD_RATIO)), Image.LANCZOS)


def trimmed(path: str) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    return im.crop(im.getbbox())


def fit_height(im: Image.Image, height: int) -> Image.Image:
    return im.resize((round(im.width * height / im.height), height), Image.LANCZOS)


def app_icon(flame: Image.Image, size: int, padding: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), CREAM + (255,))
    mark = fit_height(flame, round(size * (1 - 2 * padding)))
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas.convert("RGB")


def copy_kit() -> None:
    for source, name in KIT_FILES.items():
        shutil.copyfile(os.path.join(KIT_SVG, source), os.path.join(OUT, name))


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    copy_kit()
    logo = trimmed(os.path.join(UPLOADS, "FLEX-CHICKEN-Version-1-Colored_1.png"))
    logo.save(os.path.join(OUT, "logo-full.png"), optimize=True)  # social share image

    flame = trimmed(os.path.join(UPLOADS, "FLEX-CHICKEN-Icon-Colored_1.png"))
    app_icon(flame, 192, 0.14).save(os.path.join(OUT, "icon-192.png"))
    app_icon(flame, 512, 0.14).save(os.path.join(OUT, "icon-512.png"))
    app_icon(flame, 180, 0.14).save(os.path.join(OUT, "apple-touch-icon.png"))

    card_face().save(os.path.join(OUT, "card-face.webp"), quality=86, method=6)
    print("brand assets written to", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
