import os, numpy as np
from PIL import Image, ImageDraw, ImageFont
import mkassets as M

R = M.ROOT
FONTS = R + "/ui/node_modules/@expo-google-fonts"
BRI = FONTS + "/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf"
MAN = FONTS + "/manrope/500Medium/Manrope_500Medium.ttf"
W, H, SS = 1200, 630, 3
w, h = W * SS, H * SS

def f(path, px): return ImageFont.truetype(path, px * SS)

# Ground: the same near-black the app uses, lifted by two very low-saturation washes so the
# card doesn't read as a flat rectangle in a feed.
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
base = np.zeros((h, w, 3), np.float32) + np.array(M.INK, np.float32)
def wash(cx, cy, rad, rgb, amt):
    d = np.hypot(xx - cx * w, yy - cy * h) / (rad * w)
    return np.clip(1 - d, 0, 1)[..., None] ** 2 * amt * np.array(rgb, np.float32)
base += wash(0.80, 0.22, 0.62, (214, 255, 63), 0.14)
base += wash(0.06, 0.95, 0.55, (53, 214, 166), 0.07)
im = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
d = ImageDraw.Draw(im)

# Lockup, at the spec ratios: mark 0.88em against the cap, gap 0.34em, tracking -0.02em.
EM = 54
mark = M.compose(round(0.88 * EM * SS), 0.96, M.LIME, None)
LX, LY = 88 * SS, 74 * SS
im.paste(mark, (LX, LY), mark)
d.text((LX + round((0.88 + 0.34) * EM * SS), LY + round(0.44 * EM * SS)),
       "Smashio", font=f(BRI, EM), fill="#F5F5F7", anchor="lm")

d.text((88 * SS, 248 * SS), "Find a court.",      font=f(BRI, 76), fill="#F5F5F7", anchor="ls")
d.text((88 * SS, 340 * SS), "Find your match.",   font=f(BRI, 76), fill="#D6FF3F", anchor="ls")
d.text((90 * SS, 432 * SS), "Local badminton games near you, sorted by skill.",
       font=f(MAN, 24), fill="#9A9AA3", anchor="ls")
d.text((90 * SS, 472 * SS), "Launching Sydney, spring 2026.",
       font=f(MAN, 24), fill="#9A9AA3", anchor="ls")

out = R + "/website/assets/og-image.png"
im.resize((W, H), Image.LANCZOS).save(out, optimize=True)
print(f"  website/assets/og-image.png  {W}x{H}  {os.path.getsize(out)/1024:.1f} KB")
