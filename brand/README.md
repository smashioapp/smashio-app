# Brand mark

`smashio-mark.svg` is the master: one `evenodd` path in a 1024 viewBox, a twelve-petal radial
rosette. Every shipped icon is rendered from it, so it is the only file to edit if the mark
itself ever changes.

Replaced the old canted shuttlecock on **2026-09-07**. It was traced from
`source/chatgpt-p4.png` — a genuine contour trace of that raster, not a re-composition of its
parts, which is why the petal lengths and spacing are irregular rather than evenly radial.
Cleanup before tracing touched 0.318% of pixels (16 pinhole tears) and preserved all 13
components and the internal quill slits.

## Regenerating

```bash
python brand/build_all.py    # every icon slot, app + website
python brand/build_og.py     # website/assets/og-image.png
```

`build_og.py` reads the Bricolage Grotesque and Manrope `.ttf`s out of
`ui/node_modules/@expo-google-fonts`, so run `npm install` in `ui/` first.

## Framing

| slot | mark fills | why |
| --- | --- | --- |
| iOS / store tile, apple-touch, `favicon.png` | 76% | the approved framing |
| Android foreground + monochrome | 50.7% | `0.76 × 72/108` — the launcher only ever shows the centre 72dp of a 108dp layer |
| splash, `notification-icon.png` | 88% | no tile around them |
| `favicon-16/32` | 84% | a browser tab has no neighbouring icons, so petal separation is worth more than tile margin |
| `smashio-logo.png` | 96% | bare mark, sized by its call site |

## Lockup

Wordmark is title case **Smashio**, never all-caps. Against the cap height: mark `0.88em`,
gap `0.34em`, clear space `0.44em`, tracking `-0.02em`; stacked, mark `1.5em` and gap `0.26em`.
Minimum size is 16px — below that the counters in *a*, *s* and *o* fill in, so drop the mark and
set the wordmark alone. The website sets it in Bricolage Grotesque 800; the app's display face is
Space Grotesk 700 (`docs/v2-design-plan.md` §3.2), so the two lockups do not share a typeface.

## Known limit

Twelve petals separated by lime channels means the channels close below ~32px, and the mark
reads as a spiky disc rather than a rosette. That is fine everywhere it currently lands (16px
favicons excepted, where it is deliberate) but a five-petal simplified glyph is the fix if a
notification-sized slot ever needs to stay legible.

`explorations/` keeps the rejected directions — the S-monogram tiles and the Gemini rosettes —
and `source/` the raster the shipped mark was traced from.
