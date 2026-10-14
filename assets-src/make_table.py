"""Build the turning table's top from the owner's table photo (table.jpg).

Outputs to web/public/scene/:
  table-top.webp   the whole round top seen from straight above, so the stage
                   can turn it: white travertine, gold birds, the green marble
                   centre and the brass rim, with transparent corners
  table-edge.webp  a seamless strip of the brass band for the table's front edge

table.jpg is a photo from above at an angle, cut off on the right: about 140
degrees of the table, with its centre outside the frame. So the top is put
back together from the real pixels:
  1. The brass rim is an ellipse in the photo (fitted to the rim's pixels);
     an affine map turns it into a circle.
  2. The travertine ring, its seams and the rim come from one 90-degree slice
     with no birds in it, mirrored four times round, so it has no seam.
  3. The marble centre is a separate, raised disc (its own ellipse, measured
     by hand along its top edge). Its clean left part, clear of the flowers,
     is cut out and mirrored once, as stone slabs are bookmatched.
  4. The photo's two groups of gold birds are cut out and set at four even
     places round the ring.
  5. The photo's light falls from one side; it is evened out round the ring,
     or it would spin with the table.
The flower centrepiece is left out: it cannot be repeated round a turning top.
"""
import os

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "table.jpg")
OUT = os.path.join(HERE, "..", "web", "public", "scene")

SIZE = 1400  # output diameter in px; the stage draws the top up to ~1.2x a phone width
# Fitted in table.jpg (735 x 970): centre, full axes, angle (cv2.fitEllipse).
RIM = ((775.34, 536.50), (1019.22, 1556.40), 105.20)
MARBLE = ((712.19, 428.67), (552.68, 766.93), 106.34)
RIM_OUTER = 1.009  # x rim radius: the fit runs down the rim's middle
SLICE = (326, 56)  # degrees, in the flattened view: travertine with no birds in it
MARBLE_PATCH = (390, 270, 490, 530)  # photo box: marble clear of the flowers' stems and of its edge
MARBLE_CONTRAST = 1.18  # the patch is the pale side of the slab: give back its depth
MARBLE_OUT = 0.49  # marble radius on the output, x table radius (measured ratio)
BEVEL = 0.014  # the marble's dark edge
BEVEL_SHADE = 0.55
RING_SKIP = 0.035  # skip the marble's shadow on the travertine next to it
# Gold bird groups in the flattened view: (degrees, radii), and the turns
# that set copies of them round the ring. The far group's ring starts past the
# flowers, whose leaves are almost gold.
BIRD_GROUPS = [((280, 320), (0.72, 0.99), [0, 180]), ((52, 94), (0.56, 0.95), [-44, 136])]
LIGHT_SMOOTH_DEG = 25
EDGE_SIZE = (1200, 96)


def axes_of(ellipse):
    (cx, cy), (w, h), angle = ellipse
    t = np.deg2rad(angle)
    e1 = np.array([np.cos(t), np.sin(t)])  # the axis of length w
    e2 = np.array([-np.sin(t), np.cos(t)])  # the axis of length h
    return np.array([cx, cy]), w / 2, h / 2, e1, e2


def photo_point(u, v):
    """Flattened (u, v), in rim radii from the table centre, -> photo x, y."""
    c, a1, a2, e1, e2 = axes_of(RIM)
    return c[0] + u * a2 * e2[0] + v * a1 * e1[0], c[1] + u * a2 * e2[1] + v * a1 * e1[1]


def flatten_point(x, y):
    """Photo x, y -> flattened (u, v): the inverse of photo_point."""
    c, a1, a2, e1, e2 = axes_of(RIM)
    d = np.stack([np.asarray(x) - c[0], np.asarray(y) - c[1]], -1)
    return d @ e2 / a2, d @ e1 / a1


def marble_edge(phi):
    """Distance from the table centre to the marble's edge along angle phi (flattened)."""
    c, a1, a2, e1, e2 = axes_of(MARBLE)
    t = np.linspace(0, 2 * np.pi, 4000, endpoint=False)
    x = c[0] + np.cos(t) * a1 * e1[0] + np.sin(t) * a2 * e2[0]
    y = c[1] + np.cos(t) * a1 * e1[1] + np.sin(t) * a2 * e2[1]
    u, v = flatten_point(x, y)
    ang = np.mod(np.arctan2(v, u), 2 * np.pi)
    rad = np.hypot(u, v)
    order = np.argsort(ang)
    ang, rad = ang[order], rad[order]
    return np.interp(np.mod(phi, 2 * np.pi), ang, rad, period=2 * np.pi)


def folded(phi_deg, start, end):
    """Fold any angle into the slice, mirroring every other copy so edges meet."""
    width = (end - start) % 360
    k = np.floor(phi_deg / width)
    local = phi_deg - k * width
    local = np.where(k % 2 == 1, width - local, local)
    return start + local


def sample(photo, u, v):
    x, y = photo_point(u, v)
    return cv2.remap(photo, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def even_light(img, rho, phi_deg, inside):
    """Divide out the photo's one-sided light, angle by angle round the ring."""
    lum = img.mean(axis=2)
    bins = np.mod(np.round(phi_deg), 360).astype(int)
    sums = np.bincount(bins[inside], lum[inside], minlength=360)
    counts = np.bincount(bins[inside], minlength=360)
    mean = np.where(counts > 0, sums / np.maximum(counts, 1), np.nan)
    known = ~np.isnan(mean)
    mean = np.interp(np.arange(360), np.arange(360)[known], mean[known], period=360)
    k = np.exp(-0.5 * (np.arange(-60, 61) / LIGHT_SMOOTH_DEG) ** 2)
    smooth = np.convolve(np.concatenate([mean[-60:], mean, mean[:60]]), k / k.sum(), "same")[60:-60]
    gain = smooth.mean() / smooth[bins]
    return np.clip(img * np.where(inside, gain, 1.0)[..., None], 0, 255)


def birds_layer(photo, rho, phi):
    """The photo's gold birds, cut out and set round the ring. Returns (rgb, alpha)."""
    rgb = np.zeros((SIZE, SIZE, 3), np.float32)
    alpha = np.zeros((SIZE, SIZE), np.float32)
    phi_deg = np.degrees(phi)
    for (start, end), (near, far), shifts in BIRD_GROUPS:
        in_ring = (rho > near) & (rho < far)
        for shift in shifts:
            src_deg = phi_deg - shift
            local = np.mod(src_deg - start, 360)
            here = in_ring & (local < (end - start) % 360)
            src_phi = np.radians(src_deg)
            px = sample(photo, rho * np.cos(src_phi), rho * np.sin(src_phi)).astype(np.float32)
            hsv = cv2.cvtColor(px.astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
            gold = (hsv[..., 0] >= 9) & (hsv[..., 0] <= 24) & (hsv[..., 1] > 70) & (hsv[..., 2] > 70)
            mask = cv2.GaussianBlur((gold & here).astype(np.float32), (0, 0), 0.9)
            rgb = np.where(mask[..., None] > alpha[..., None], px, rgb)
            alpha = np.maximum(alpha, mask)
    return rgb, np.clip(alpha * 1.4, 0, 1)


def marble_slab(photo):
    """The clean marble, bookmatched (mirrored once), sized to the centre disc."""
    left, top, right, bottom = MARBLE_PATCH
    half = photo[top:bottom, left:right].astype(np.float32)
    slab = np.concatenate([half, half[:, ::-1]], axis=1)
    side = min(slab.shape[:2])
    y0 = (slab.shape[0] - side) // 2
    x0 = (slab.shape[1] - side) // 2
    disc = round(SIZE * MARBLE_OUT)
    square = cv2.resize(slab[y0 : y0 + side, x0 : x0 + side], (disc, disc), interpolation=cv2.INTER_CUBIC)
    square = (square - square.mean()) * MARBLE_CONTRAST + square.mean()
    out = np.zeros((SIZE, SIZE, 3), np.float32)
    at = (SIZE - disc) // 2
    out[at : at + disc, at : at + disc] = square
    return out


def table_top(photo):
    g = (np.arange(SIZE) + 0.5) / SIZE * 2 - 1
    u, v = np.meshgrid(g, g)
    rho = np.hypot(u, v)
    phi = np.arctan2(v, u)
    phi_deg = np.mod(np.degrees(phi), 360)

    # Travertine ring and rim: from the bird-free slice, stretched to start
    # just past the marble's edge along each source angle.
    ring_deg = folded(phi_deg, *SLICE)
    ring_phi = np.radians(ring_deg)
    inner_out = MARBLE_OUT + BEVEL
    inner_src = marble_edge(ring_phi) + RING_SKIP
    t = np.clip((rho - inner_out) / (1 - inner_out), 0, 1)
    ring_rho = inner_src + t * (RIM_OUTER - inner_src)
    ring = sample(photo, ring_rho * np.cos(ring_phi), ring_rho * np.sin(ring_phi)).astype(np.float32)

    marble = marble_slab(photo)

    is_marble = rho < MARBLE_OUT
    is_ring = rho >= inner_out
    ring = even_light(ring, rho, phi_deg, is_ring & (rho < 0.97))
    img = np.where(is_marble[..., None], marble, ring)
    # The marble's bevel: a dark band, darkest at its outer side.
    bevel = (rho >= MARBLE_OUT) & (rho < inner_out)
    img = np.where(bevel[..., None], ring * BEVEL_SHADE, img)

    bird_rgb, bird_a = birds_layer(photo, rho, phi)
    img = img * (1 - bird_a[..., None]) + bird_rgb * bird_a[..., None]

    alpha = np.clip((1 - rho) * SIZE / 2 + 0.5, 0, 1) * 255
    rgba = np.clip(np.dstack([img[..., ::-1], alpha]), 0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def table_edge(photo):
    """The brass band: the rim's own colour, lit from above, seamless along x."""
    hsv = cv2.cvtColor(photo, cv2.COLOR_BGR2HSV)
    brass = (hsv[..., 0] >= 10) & (hsv[..., 0] <= 28) & (hsv[..., 1] > 110) & (hsv[..., 2] > 60) & (hsv[..., 2] < 210)
    colour = np.median(photo[brass], axis=0)[::-1].astype(np.float32)
    w, h = EDGE_SIZE
    y = np.linspace(0, 1, h)[:, None]
    # The stage darkens the edge's ends itself (.table-edge), so start bright: a lit lip, then falling off.
    shade = 1.45 - 0.5 * y + 0.3 * np.exp(-((y - 0.08) / 0.05) ** 2)
    rng = np.random.default_rng(7)
    brush = rng.normal(0, 1, (1, w))
    brush = np.real(np.fft.ifft(np.fft.fft(brush) * (np.abs(np.fft.fftfreq(w)) < 0.05)))  # periodic, so it tiles
    brush = 1 + 0.05 * brush / np.abs(brush).max()
    strip = colour[None, None, :] * (shade * brush)[..., None]
    return Image.fromarray(np.clip(strip, 0, 255).astype(np.uint8), "RGB")


def build_table():
    photo = cv2.imread(SRC)
    top = table_top(photo)
    top.save(os.path.join(OUT, "table-top.webp"), quality=90, method=6)
    edge = table_edge(photo)
    edge.save(os.path.join(OUT, "table-edge.webp"), quality=90, method=6)
    rgb = np.asarray(top.convert("RGB"), dtype=float)[np.asarray(top)[..., 3] > 250]
    return "#{:02x}{:02x}{:02x}".format(*[int(c) for c in rgb.mean(0)])


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print("table colour", build_table())
