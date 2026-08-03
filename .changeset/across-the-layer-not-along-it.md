---
'@love-rox/kumihimo-core': patch
---

`order: fixed` orders a top-to-bottom drawing too.

It shipped an hour ago doing nothing in a `TB` diagram. Declaration order was handed to the
layout as a `y` coordinate — which is the axis a layer is stacked along in a left-to-right
drawing, and the axis the _flow_ runs along in a top-to-bottom one. Set there, it is a
position the layering recomputes and throws away.

Across the flow now: `y` for `LR`, `x` for `TB`.

The tests that shipped with it did not catch this, because a three-camera example comes out
in declaration order either way. The regression test is the diagram that found it — two
nesting levels, five sibling groups, twenty-one links. Nothing smaller reproduced it, and
that is stated where it sits.
