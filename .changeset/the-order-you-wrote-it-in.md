---
'@love-rox/kumihimo-core': minor
---

`diagram { order: fixed }` places devices in the order they were written.

Crossing minimisation reorders a layer freely: three cameras written a, b, c come out b, c, a
if that saves a crossing. Right when the order is incidental — and it usually is. Wrong when
the order _is_ the drawing. A rack list is read top to bottom, and one reshuffled to save two
crossings is describing a different rack.

```khm
diagram { order: fixed }
```

Off by default, because untangling the cables is what somebody wants most of the time and
only the author knows when it is not.

**Whole-diagram, not per-group**, and that is not a shortcut. The layout engine's
placement-aware processor may not run at one level of the hierarchy without running at every
level: a graph with one group asking to keep its order and one ordinary group beside it is
refused outright. Spelling it `group rack [order=fixed]` would read as local and would not
be, so it is written where it acts. That was tried first and thrown away.

Anything other than `fixed` is reported rather than ignored, and `order` is kept off the
loose options bag once understood — one answer rather than two, the same as `direction`.
