# Turns the plate-of-wings video into the scroll backdrop the customer pages
# scrub through: transparent WebP frames in public/backdrop/.
#
#   python scripts/build-backdrop.py ../gemini_generated_video_a7b84057.mp4
#
# The grey table is keyed out so only the plate, the chicken and the hands
# remain over the site's own cream. The camera never moves, so:
#   - the plate is one fixed circle (measured on the empty last frame);
#   - hands and chicken have colour; the grey table and the hands' shadows
#     have almost none (chroma 0-3 against 8-30 for skin), so colour is the key.
# A soft shadow is baked back under everything so the plate does not float.
# Needs opencv-python and numpy.
import json
import sys
from pathlib import Path

import cv2
import numpy as np

PLATE_X, PLATE_Y, PLATE_R = 359.4, 655.8, 274.5  # source pixels, inside the grey rim edge
CHROMA_MIN = 6  # Lab chroma; the table and shadows sit at 0-3
MIN_BLOB = 400  # source pixels; smaller specks are noise
EVERY = 2  # keep every 2nd frame: 120 frames for 10 s is smooth under scroll
OUT_WIDTH = 540
QUALITY = 72
SHADOW = {"offset": (14, 22), "blur": 31, "opacity": 0.2, "bgr": (21, 28, 45)}  # roast-800

OUT = Path(__file__).resolve().parent.parent / "public" / "backdrop"


def plate_alpha(h, w):
    yy, xx = np.mgrid[0:h, 0:w]
    rr = np.hypot(xx - PLATE_X, yy - PLATE_Y)
    return np.clip((PLATE_R - rr) / 1.5 + 0.5, 0, 1).astype(np.float32)


def subject_alpha(frame):
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB).astype(np.float32)
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    mask = (chroma > CHROMA_MIN).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    keep = np.isin(labels, [k for k in range(1, count) if stats[k, cv2.CC_STAT_AREA] >= MIN_BLOB])
    # Fill holes (nails, highlights) by drawing each blob's outline solid.
    contours, _ = cv2.findContours(keep.astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros(mask.shape, np.uint8)
    cv2.drawContours(filled, contours, -1, 255, -1)
    filled = cv2.erode(filled, np.ones((3, 3), np.uint8))  # trim the grey fringe
    return cv2.GaussianBlur(filled.astype(np.float32) / 255, (5, 5), 1.2)


def with_shadow(frame, alpha):
    dx, dy = SHADOW["offset"]
    moved = cv2.warpAffine(alpha, np.float32([[1, 0, dx], [0, 1, dy]]), alpha.shape[::-1])
    k = SHADOW["blur"]
    shadow = cv2.GaussianBlur(moved, (k, k), 0) * SHADOW["opacity"]
    out_alpha = alpha + (1 - alpha) * shadow
    a = alpha[..., None]
    rgb = frame * a + np.float32(SHADOW["bgr"]) * (1 - a)
    rgba = np.dstack([rgb, out_alpha * 255])
    return np.clip(rgba, 0, 255).astype(np.uint8)


def main(video):
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        sys.exit(f"Cannot open {video}")
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("plate-*.webp"):
        old.unlink()

    plate = None
    index = written = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if index % EVERY == 0:
            h, w = frame.shape[:2]
            if plate is None:
                plate = plate_alpha(h, w)
            alpha = np.maximum(plate, subject_alpha(frame))
            rgba = with_shadow(frame.astype(np.float32), alpha)
            size = (OUT_WIDTH, round(h * OUT_WIDTH / w))
            rgba = cv2.resize(rgba, size, interpolation=cv2.INTER_AREA)
            cv2.imwrite(str(OUT / f"plate-{written:03d}.webp"), rgba, [cv2.IMWRITE_WEBP_QUALITY, QUALITY])
            written += 1
        index += 1

    manifest = {"count": written, "width": size[0], "height": size[1], "pattern": "/backdrop/plate-{i}.webp"}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    total = sum(p.stat().st_size for p in OUT.glob("plate-*.webp"))
    print(f"backdrop: {written} frames, {size[0]}x{size[1]}, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python scripts/build-backdrop.py <video.mp4>")
    main(Path(sys.argv[1]))
