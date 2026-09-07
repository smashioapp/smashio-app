"""Render every brand asset from the one traced master path.

Master: ui/assets/logo-v2/traced-faithful-mark-only.svg -- a single evenodd path in a
1024 viewBox. Everything below is that path, rasterised at 8x and box-filtered down, so
the only thing that ever changes between assets is size, colour and how much of the
canvas the mark is asked to fill.
"""
import re, os, numpy as np, cv2
from PIL import Image

ROOT = r"C:/smashio/smashio-app"
MASTER = ROOT + "/brand/smashio-mark.svg"
LIME = (0xD6, 0xFF, 0x3F)
INK  = (0x0A, 0x0A, 0x0B)
SS   = 8                      # supersample factor

def subpaths(d, steps=18):
    """Flatten the M/L/C/Z path data into polylines, one per subpath."""
    toks = re.findall(r'[MLCZ]|-?\d+\.?\d*', d)
    out, cur, p, i = [], [], np.zeros(2), 0
    while i < len(toks):
        t = toks[i]
        if t == 'M':
            if cur: out.append(cur)
            p = np.array([float(toks[i+1]), float(toks[i+2])]); cur = [p.copy()]; i += 3
        elif t == 'L':
            p = np.array([float(toks[i+1]), float(toks[i+2])]); cur.append(p.copy()); i += 3
        elif t == 'C':
            c1 = np.array([float(toks[i+1]), float(toks[i+2])])
            c2 = np.array([float(toks[i+3]), float(toks[i+4])])
            e  = np.array([float(toks[i+5]), float(toks[i+6])])
            for s in np.linspace(0, 1, steps)[1:]:
                cur.append((1-s)**3*p + 3*(1-s)**2*s*c1 + 3*(1-s)*s*s*c2 + s**3*e)
            p = e; i += 7
        else:
            i += 1
    if cur: out.append(cur)
    return [np.array(s) for s in out]

_d = re.search(r'<path[^>]*\sd="([^"]+)"', open(MASTER).read()).group(1)
POLYS = subpaths(_d)

# Tight bbox of the whole mark, in master units.
_all = np.vstack(POLYS)
BB = (_all[:, 0].min(), _all[:, 1].min(), _all[:, 0].max(), _all[:, 1].max())
BW, BH = BB[2] - BB[0], BB[3] - BB[1]
print(f"master bbox {BW:.1f} x {BH:.1f} at ({BB[0]:.1f},{BB[1]:.1f})")

def alpha(size, frac):
    """Anti-aliased 0..1 coverage of the mark, centred, longest side = frac*size."""
    S = size * SS
    k = (frac * S) / max(BW, BH)
    off = np.array([S/2 - (BB[0] + BW/2) * k, S/2 - (BB[1] + BH/2) * k])
    m = np.zeros((S, S), np.uint8)
    for poly in POLYS:                      # evenodd == XOR of the subpath fills
        one = np.zeros((S, S), np.uint8)
        cv2.fillPoly(one, [np.round(poly * k + off).astype(np.int32)], 1)
        m ^= one
    return np.asarray(Image.fromarray(m * 255).resize((size, size), Image.BOX), np.float32) / 255.0

def compose(size, frac, fg, bg=None, out=None):
    """Mark in `fg` over `bg` (opaque RGB) or transparent (RGBA) when bg is None."""
    a = alpha(size, frac)[..., None]
    fga = np.array(fg, np.float32)
    if bg is None:
        rgba = np.concatenate([np.broadcast_to(fga, (size, size, 3)), a * 255], 2)
        im = Image.fromarray(rgba.round().astype(np.uint8), "RGBA")
    else:
        rgb = np.array(bg, np.float32) * (1 - a) + fga * a
        im = Image.fromarray(rgb.round().astype(np.uint8), "RGB")
    if out:
        im.save(out, optimize=True)
        print(f"  {os.path.relpath(out, ROOT):44s} {size}x{size}  {os.path.getsize(out)/1024:7.1f} KB")
    return im
