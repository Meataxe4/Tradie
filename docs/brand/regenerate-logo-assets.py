#!/usr/bin/env python3
"""
Regenerate the logo assets from the vector masters in the v2.1 guide PDF.

The mark is Phil's artwork, not a redraw: pdftocairo lifts the real paths out of
the guide, and this script recolours and recomposes them into the colourways the
guide specifies. Run it if the guide is reissued; otherwise the committed output
is what the app uses.

    pip-free. Needs poppler-utils (pdftocairo).
    python3 docs/brand/regenerate-logo-assets.py

Writes web/public/brand/*.svg and web/src/brand.tsx.

Where the paths come from, by page of the guide:
  page 7  the mark on its own  -> hand (Ink) + house (Spritz)
  page 1  the cover wordmark   -> "sorted", "y", and the mark's placement

Page 7's hand is the same artwork as the cover's but ~9x lighter (12.5 KB vs
110 KB of flattened outline), so it is used everywhere and positioned into the
wordmark by matching its bounding box to the cover's. Hand and house move as one
rigid group, so the house keeps exactly the position it was drawn in.
"""
import re, os, json

INK, SPRITZ, PLASTER, CHALK = "#16130F", "#F2581E", "#F6F1E9", "#FFFDF9"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "web", "public", "brand")
os.makedirs(OUT, exist_ok=True)

def paths(f):
    return re.findall(r'<path[^>]*fill="rgb\(([^)]*)\)"[^>]*\bd="([^"]*)"', open(f).read())

def bbox(d):
    n = [float(x) for x in re.findall(r'-?\d+\.?\d*(?:e-?\d+)?', d)]
    return min(n[0::2]), min(n[1::2]), max(n[0::2]), max(n[1::2])

def tidy(d, nd=2):
    """Round coordinates. 2dp on a 230-unit shape is 0.004% - invisible, ~30% smaller."""
    d = re.sub(r'-?\d+\.?\d*', lambda m: f"{float(m.group()):.{nd}f}".rstrip('0').rstrip('.'), d)
    return re.sub(r'\s+', ' ', d).strip()

p7, p1 = paths('brandsrc/p7.svg'), paths('brandsrc/p1.svg')
hand, house = tidy(p7[2][1]), tidy(p7[1][1])
word, yy = tidy(p1[3][1]), tidy(p1[6][1])

bh7, bh1 = bbox(p7[2][1]), bbox(p1[5][1])
bw, by = bbox(p1[3][1]), bbox(p1[6][1])

# page-7 mark -> cover wordmark space (hand+house stay one rigid group, so the
# house keeps exactly the position it was drawn in)
s = (bh1[2]-bh1[0]) / (bh7[2]-bh7[0])
tx, ty = bh1[0]-bh7[0]*s, bh1[1]-bh7[1]*s

# wordmark bounds: "sorted" + mark + "y"
WX0, WY0 = min(bw[0], bh1[0], by[0]), min(bw[1], bh1[1], by[1])
WX1, WY1 = max(bw[2], bh1[2], by[2]), max(bw[3], bh1[3], by[3])
WW, WH = WX1-WX0, WY1-WY0

# mark bounds (page 7, hand + house)
bho = bbox(p7[1][1])
MX0, MY0 = min(bh7[0], bho[0]), min(bh7[1], bho[1])
MX1, MY1 = max(bh7[2], bho[2]), max(bh7[3], bho[3])
MW, MH = MX1-MX0, MY1-MY0

def r(v): return f"{v:.2f}".rstrip('0').rstrip('.')

def wordmark(line, housec, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {r(WW)} {r(WH)}" '
            f'role="img" aria-label="Sorted By"><title>{title}</title>'
            f'<g transform="translate({r(-WX0)},{r(-WY0)})">'
            f'<path fill="{line}" d="{word}"/><path fill="{line}" d="{yy}"/>'
            f'<g transform="translate({r(tx)},{r(ty)}) scale({s:.6f})">'
            f'<path fill="{line}" d="{hand}"/><path fill="{housec}" d="{house}"/>'
            f'</g></g></svg>')

def mark(line, housec, title, bg=None):
    inner = (f'<g transform="translate({r(-MX0)},{r(-MY0)})">'
             f'<path fill="{line}" d="{hand}"/><path fill="{housec}" d="{house}"/></g>')
    if bg:  # app icon: squircle, mark inset and centred
        side = 512.0
        pad = side * 0.17
        sc = min((side-2*pad)/MW, (side-2*pad)/MH)
        ox, oy = (side-MW*sc)/2, (side-MH*sc)/2
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" '
                f'role="img" aria-label="Sorted By"><title>{title}</title>'
                f'<rect width="512" height="512" rx="114" fill="{bg}"/>'
                f'<g transform="translate({r(ox)},{r(oy)}) scale({sc:.6f})">{inner}</g></svg>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {r(MW)} {r(MH)}" '
            f'role="img" aria-label="Sorted By"><title>{title}</title>{inner}</svg>')

files = {
    # colourways straight from the guide
    "wordmark.svg":          wordmark(INK, SPRITZ, "Sorted By"),                  # on Plaster / Chalk
    "wordmark-plaster.svg":  wordmark(PLASTER, SPRITZ, "Sorted By"),              # on Ink / Charcoal
    "wordmark-ink.svg":      wordmark(INK, INK, "Sorted By"),                     # on Spritz / Brass
    "wordmark-gum.svg":      wordmark(PLASTER, PLASTER, "Sorted By"),             # on Gum
    "mark.svg":              mark(INK, SPRITZ, "Sorted By"),
    "mark-plaster.svg":      mark(PLASTER, SPRITZ, "Sorted By"),
    "favicon.svg":           mark(INK, SPRITZ, "Sorted By"),
    "app-icon.svg":          mark(INK, CHALK, "Sorted By", bg=SPRITZ),            # Ink hand, Chalk house, Spritz
}
for name, body in files.items():
    open(os.path.join(OUT, name), "w").write(body + "\n")
    print(f"{name:<22} {len(body):>7,} bytes")

json.dump({"hand": hand, "house": house, "word": word, "y": yy,
           "s": s, "tx": tx, "ty": ty,
           "WX0": WX0, "WY0": WY0, "WW": WW, "WH": WH,
           "MX0": MX0, "MY0": MY0, "MW": MW, "MH": MH},
          open("brand_geom.json", "w"))
print(f"\nwordmark viewBox 0 0 {r(WW)} {r(WH)}   aspect {WW/WH:.3f}")
print(f"mark     viewBox 0 0 {r(MW)} {r(MH)}   aspect {MW/MH:.3f}")
