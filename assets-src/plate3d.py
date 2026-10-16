"""The 3D side of a dish on the table's plate.

Each cut-out piece of food becomes a solid: its outline is its footprint, its
underside is flat and its top is a dome whose height follows the piece's
half-width (a wing is a rounded log, a drumstick thick at the meat and thin
at the bone, an onion ring a tube). Pieces are dropped one by one onto the
plate and come to rest on whatever is under them, tipping to lean on it.

From the settled pile come where each piece lies (make_plated.py draws each
piece's own photo there), how each point is lit by the scene's light (from
above at the back left, as TableStage lights the table), the shadows the
pieces throw on each other, and the shadow they throw on the plate, seen by
the camera that draws the table's plates (TableStage TILT).
"""
import math

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import medial_axis

SIZE = 720  # the picture, px; its width is the plate's width
SS = 2  # rendered this many times larger, then shrunk, for smooth edges
CENTRE_Y = 560  # px: the plate's centre (TableStage PLATED_CENTRE = 560 / 720)
TILT = 0.42  # TableStage TILT: the plate's height / width on screen
SIN, COS = TILT, math.sqrt(1 - TILT**2)
_light = np.array([-0.5, 0.45, 0.75])
LIGHT = _light / np.linalg.norm(_light)  # towards the light: left, back, up
SHADOW_RGB = np.array([40, 22, 10]) / 255
TILTS = np.linspace(-0.3, 0.3, 7)  # how far a piece may tip to lean on another


class Scene:
    """The plate seen from above: the height of the food's top surface, the
    underside of the piece that makes it (above the plate where it leans on
    another), its colour and which piece it is."""

    def __init__(self, plate_cm: float):
        self.n = SIZE * SS
        self.res = self.n / plate_cm  # grid cells per cm
        self.top = np.zeros((self.n, self.n), np.float32)
        self.under = np.zeros_like(self.top)
        self.rgb = np.zeros((self.n, self.n, 3), np.float32)
        self.ids = np.full((self.n, self.n), -1, np.int16)
        self.areas = []  # each piece's footprint, cells

    def cell(self, x_cm: float, y_cm: float) -> tuple:
        """Grid (row, col) of a point on the plate; y runs away from the camera."""
        return self.n / 2 - y_cm * self.res, self.n / 2 + x_cm * self.res


def bleed(rgb: np.ndarray, mask: np.ndarray, px: int) -> np.ndarray:
    """Replaces the cut-out's fringe with colour from just inside it, so the
    steep sides of a piece are not streaked with background."""
    inner = ndimage.binary_erosion(mask, iterations=px)
    weight = ndimage.gaussian_filter(inner.astype(np.float32), px)
    fill = ndimage.gaussian_filter(rgb * inner[..., None], (px, px, 0)) / np.maximum(weight, 1e-4)[..., None]
    edge = mask & ~inner & (weight > 1e-3)
    out = rgb.copy()
    out[edge] = fill[edge]
    return out


def solid(im: Image.Image, res: float, kind: dict) -> dict:
    """A cut-out (already sized and turned) as a solid: colour, footprint,
    and how high its top is above its flat underside, cm."""
    a = np.asarray(im, np.float32) / 255
    mask = ndimage.binary_opening(a[..., 3] > 0.5, iterations=1)
    rgb = bleed(a[..., :3], mask, max(2, round(res * 0.06)))
    skeleton, dist = medial_axis(mask, return_distance=True)
    # Each point's half-width is that of the nearest point on the piece's spine.
    _, (iy, ix) = ndimage.distance_transform_edt(~skeleton, return_indices=True)
    half = np.minimum(dist[iy, ix] / res, kind["ridge"])
    d = np.minimum(dist / res, half)
    profile = np.sqrt(np.clip(d * (2 * half - d), 0, None))  # a round cross-section
    profile = ndimage.gaussian_filter(profile, 1.2) * mask
    lum = rgb.mean(axis=2)
    bumps = ndimage.gaussian_filter(lum - ndimage.gaussian_filter(lum, res * 0.2), 1.5) * kind.get("bumps", 0.12)
    return {"rgb": rgb, "mask": mask, "top": (profile * kind["top"] + bumps * mask).astype(np.float32)}


def drop(scene: Scene, piece: dict, x_cm: float, y_cm: float) -> dict:
    """Lets a piece down at (x, y) until it rests on the plate or the food
    already there, tipped the way that lets it sit lowest. Returns where it
    came to rest: its corner on the grid, its middle in the piece, its height
    and lean (cm of rise per cm right and back), and the pieces it lies on."""
    h, w = piece["mask"].shape
    row, col = scene.cell(x_cm, y_cm)
    r0, c0 = round(row - h / 2), round(col - w / 2)
    pr0, pc0 = max(0, -r0), max(0, -c0)
    pr1, pc1 = min(h, scene.n - r0), min(w, scene.n - c0)
    if pr1 <= pr0 or pc1 <= pc0:
        raise ValueError(f"piece dropped off the plate at ({x_cm:.1f}, {y_cm:.1f}) cm")
    region = (slice(r0 + pr0, r0 + pr1), slice(c0 + pc0, c0 + pc1))
    part = (slice(pr0, pr1), slice(pc0, pc1))
    mask = piece["mask"][part]
    rows, cols = np.nonzero(mask)
    u = (cols - cols.mean()) / scene.res  # cm right of the piece's middle
    v = (rows.mean() - rows) / scene.res  # cm behind it
    need = scene.top[region][rows, cols]
    below = scene.ids[region][rows, cols]
    pick = slice(None, None, max(1, len(rows) // 6000))
    best = None
    for a in TILTS:
        for b in TILTS:
            lean = a * u + b * v
            # A few high points may sink in a little: food settles.
            z = np.percentile((need - lean)[pick], 97) + 0.04 * (abs(a) + abs(b))
            if best is None or z < best[0]:
                best = (z, a, b)
    z, a, b = best
    lean = z + a * u + b * v
    new_top = lean + piece["top"][part][rows, cols]
    shows = new_top > scene.top[region][rows, cols]
    rr, cc = rows[shows] + r0 + pr0, cols[shows] + c0 + pc0
    scene.top[rr, cc] = new_top[shows]
    scene.under[rr, cc] = np.maximum(0, lean)[shows]
    scene.rgb[rr, cc] = piece["rgb"][part][rows[shows], cols[shows]]
    scene.ids[rr, cc] = len(scene.areas)
    scene.areas.append(int(mask.sum()))
    touching = (need >= lean - 0.3) & (below >= 0)
    return {
        "id": len(scene.areas) - 1, "row": r0, "col": c0, "mid": (rows.mean() + pr0, cols.mean() + pc0), "front": rows.max() + pr0,
        "z": float(z), "lean": (float(a), float(b)), "on": set(np.unique(below[touching]).tolist()),
    }


def soft(a: np.ndarray, sigma: float) -> np.ndarray:
    """A wide blur, done on a smaller copy: the same to the eye, far quicker."""
    k = max(1, min(8, int(sigma // 4)))
    if k == 1:
        return ndimage.gaussian_filter(a, sigma)
    small = a.reshape(a.shape[0] // k, k, a.shape[1] // k, k).mean(axis=(1, 3))
    return ndimage.zoom(ndimage.gaussian_filter(small, sigma / k), k, order=1)[: a.shape[0], : a.shape[1]]


def cast_shadow(top: np.ndarray, res: float, extra: np.ndarray = None) -> np.ndarray:
    """1 where something stands between a point and the light, softened.
    Traced on a half-size grid: the shadow is soft, so detail is not lost."""
    half = top.reshape(top.shape[0] // 2, 2, top.shape[1] // 2, 2).max(axis=(1, 3))
    flat = math.hypot(LIGHT[0], LIGHT[1])
    dx, dy = LIGHT[0] / flat, -LIGHT[1] / flat  # cells per step towards the light
    rise = LIGHT[2] / flat / (res / 2)  # cm the light ray climbs per half-size cell
    hit = np.zeros(half.shape, bool)
    n = half.shape[0]
    for t in range(1, int(float(half.max()) / rise) + 2):
        sr, sc = round(dy * t), round(dx * t)
        ahead = half[max(0, sr):n - max(0, -sr), max(0, sc):n - max(0, -sc)]
        here = (slice(max(0, -sr), n - max(0, sr)), slice(max(0, -sc), n - max(0, sc)))
        hit[here] |= ahead > half[here] + t * rise + 0.05
    shade = np.repeat(np.repeat(hit.astype(np.float32), 2, axis=0), 2, axis=1)
    if extra is not None:
        shade = np.maximum(shade, extra)
    return soft(shade, res * 0.18)


def lighting(piece: dict) -> np.ndarray:
    """How much each point of a piece is lit by the scene's light, from how
    its dome faces it, x its photo colour (the photo is lit already: gently)."""
    gy, gx = np.gradient(ndimage.gaussian_filter(piece["top"], 2.0))
    res = 1.0  # heights and cells: only the direction matters, scaled below
    normal = np.stack([-gx * 8, gy * 8, np.full_like(gx, res)], axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    facing = np.clip(normal @ LIGHT, 0, None) / LIGHT[2]  # 1 = lit like a flat top
    return np.minimum(1 + 0.5 * (0.35 + 0.65 * facing - 1), 1.06).astype(np.float32)


def ground_shadow(scene: Scene, shadow: np.ndarray) -> np.ndarray:
    """The plate's darkening: cast shadows plus a soft pool round the food."""
    food = (scene.ids >= 0).astype(np.float32)
    contact = soft(food, scene.res * 0.45)
    return np.clip(1 - (1 - 0.5 * shadow) * (1 - 0.45 * contact), 0, 1)


def plate_layer(scene: Scene, ground: np.ndarray) -> np.ndarray:
    """The plate's darkening as the camera sees it, per pixel of the picture."""
    n = scene.n
    py = np.arange(n)[:, None]
    row = np.floor(n / 2 - 0.5 - (CENTRE_Y * SS - py) / SIN).astype(np.int64)
    row = np.broadcast_to(row, (n, n))
    inside = (row >= 0) & (row < n)
    return np.where(inside, ground[np.clip(row, 0, n - 1), np.arange(n)[None, :]], 0).astype(np.float32)


def screen_y(scene: Scene, row: float, z: float) -> float:
    """Where a point on the grid at height z (cm) is drawn, picture px."""
    y_cm = (scene.n / 2 - row - 0.5) / scene.res
    return CENTRE_Y * SS - y_cm * SIN * scene.res - z * COS * scene.res
