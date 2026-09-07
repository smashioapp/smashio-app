"""Regenerate every shipped icon from brand/smashio-mark.svg.  python brand/build_all.py"""
import os, io, numpy as np
from PIL import Image
import mkassets as M

R = M.ROOT
UI, WEB = R + "/ui/assets", R + "/website/assets"
LIME, INK, WHITE = M.LIME, M.INK, (255, 255, 255)

# Adaptive-icon maths: the launcher masks a 108dp layer down to its centre 72dp, so only
# 66.7% of the artwork is ever visible. To land the mark at the same 76% of the *visible*
# tile that iOS gets, it has to be 0.76 x 0.667 of the full layer.
ADAPTIVE = 0.76 * 72 / 108

print("app")
M.compose(1024, 0.76,     INK,   LIME, UI + "/icon.png")           # iOS + store tile, opaque
M.compose(1024, 0.88,     LIME,  None, UI + "/splash-icon.png")    # on the #0A0A0B splash
M.compose(512,  ADAPTIVE, INK,   None, UI + "/android-icon-foreground.png")
M.compose(432,  ADAPTIVE, WHITE, None, UI + "/android-icon-monochrome.png")
M.compose(96,   0.88,     WHITE, None, UI + "/notification-icon.png")  # system tints this
M.compose(48,   0.76,     INK,   LIME, UI + "/favicon.png")
M.compose(1024, 0.96,     LIME,  None, UI + "/smashio-logo.png")   # bare mark, in-app lockups

# Adaptive background is a flat field -- the mark lives in the foreground layer only.
p = UI + "/android-icon-background.png"
Image.new("RGB", (512, 512), LIME).save(p, optimize=True)
print(f"  ui/assets/android-icon-background.png        512x512  {os.path.getsize(p)/1024:7.1f} KB")

print("website")
M.compose(180, 0.76, INK, LIME, WEB + "/apple-touch-icon.png")
# Browser tabs get the mark framed larger: nothing sits beside a favicon, and at 16px every
# pixel of petal separation is worth more than the tile margin is.
M.compose(32, 0.84, INK, LIME, WEB + "/favicon-32.png")
M.compose(16, 0.84, INK, LIME, WEB + "/favicon-16.png")

# The site is static HTML, so the mark ships as the traced vector itself rather than a raster
# of it -- sharp at every size, and 869 KB lighter than the PNG it replaces. The viewBox is
# cropped to the ink so a CSS width is the mark's size, not a box it floats inside, and the
# lockup ratios then mean what they say at every call site.
x0, y0, x1, y1 = M.BB
svg = (io.open(M.MASTER, encoding="utf-8").read()
       .replace('viewBox="0 0 1024 1024"', f'viewBox="{x0:.2f} {y0:.2f} {x1-x0:.2f} {y1-y0:.2f}"')
       .replace('fill="#0A0A0B"', 'fill="#D6FF3F"'))
p = WEB + "/smashio-mark.svg"
io.open(p, "w", encoding="utf-8", newline="\n").write(svg)
print(f"  website/assets/smashio-mark.svg                       {os.path.getsize(p)/1024:7.1f} KB")
