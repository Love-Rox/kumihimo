---
'@love-rox/kumihimo-core': patch
---

A vertical drawing names its ports.

`direction: TB` produced a dot for every port and a name beside none of them. The renderer
had a branch for the two horizontal faces and nothing for the other two, so a top-to-bottom
diagram came out with twelve labels where a left-to-right one had sixteen — the box knew
which port was which and the drawing would not say.

The name goes directly beneath the dot on the top edge and directly above it on the bottom,
sharing the dot's x: there is nothing beside a port on a horizontal edge but the next port,
so the trick that works on the sides does not transfer. Clear of the header band the top edge
runs along, and clear of the cable, which arrives vertically.

**The columns are measured now.** The horizontal branch has always sized a box around its
port labels; the vertical one never did, because it was not drawing any — so `CH15` and
`CH16` would have landed on top of each other the moment the names appeared. Measured per
edge rather than once for both, because `MAIN_L` and `MAIN_R` on the bottom should not widen
all sixteen input columns to fit a name none of them carries. A sixteen-in mixer with those
two outputs comes out 587px rather than 781.

A left-to-right drawing is unchanged, byte for byte.
