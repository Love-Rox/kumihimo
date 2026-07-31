---
'@love-rox/kumihimo-core': minor
---

Adds `adapter` — a passive part with named ends: a splitter, a Y-lead, a breakout.

A converter is a powered box. It needs racking **and** a cable on each side, so it is a
`device`. A conversion lead **is** the cable, and needs only itself. Until now the only way
to model a part with more than two ends was to declare it as a device, which put a headset
splitter on the equipment list — where nobody will ever rack it — and invented a cable run
on each side of a thing that is one line item.

```khm
adapter split "TRRS splitter" {
  io  HS  : trrs35
  out HP  : trs35
  in  MIC : trs35
}
```

A run touching an adapter is a plug going into a socket, so it produces no cable row. The
exception is written rather than guessed: a run given a **length or a cable number** is a
cable. Either alone is enough, because a length is often unknown when the drawing is made
and a number is often assigned before anyone measures.

Drawn as a pill without the header band the equipment boxes carry, so a reader does not go
looking for the splitter in the rack.

`via` is unchanged, and is still the right thing for a two-ended part inside one run.

`Device` gained `passive: boolean`. Anything constructing a `Device` by hand has to set it.
