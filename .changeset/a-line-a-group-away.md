---
'@love-rox/kumihimo-core': patch
---

A link between nesting levels is drawn where its ends are.

A camera inside `収録機材類 > カメラ` running to a switcher inside `収録機材類` came out with
no line between them. The line was there — a whole group's origin away from both boxes, which
on the page is indistinguishable from a line that was never drawn.

An edge was parked on a group only when both devices were in **the same immediate group**,
and on the root otherwise. ELK lays an edge out in the coordinate system of the lowest node
holding both of its ends, whatever it is told to put it on, so the points came back relative
to `収録機材類` and were used as absolute. The offset measured exactly that group's origin.

The container is now the lowest group holding both ends, walking each device's chain of
enclosing groups and taking the deepest they share. Twenty-one links in the report that found
this now all start and end on the ports they name.

Only nesting was affected: a link inside one group, or between top-level devices, was already
right. It arrived with nested groups and had nothing testing it.
