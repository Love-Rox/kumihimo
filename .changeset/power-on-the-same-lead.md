---
'@love-rox/kumihimo-core': minor
---

`[poe]` — a Cat run that carries power as well as data.

Drawn as two links, PoE put **two rows on the cable schedule where one lead exists**, with a
`duplicate-connection` warning on top. Written as `poe over lan` it came out clean but named
the run PoE, and the network disappeared from the drawing and the legend.

Neither says what is true: one Cat lead, carrying both.

```khm
sw.LAN1 <-> cam.LAN : lan 30m "N-01" [poe]
```

One run, one row. The drawing shows `PoE` beside the number and the length; the schedule
gains a 給電 column, and a show with no PoE in it never grows one. It answers what gets asked
on site — which ports have to be PoE, and which boxes need no power supply.

A run that is not Cat is reported: nothing puts power down a coax. A carrier decides it, as
everywhere else, so `ndi over lan [poe]` is fine.

**An attribute with no value is now a flag** — `[poe]` means `[poe=true]`. There is nothing
to put on the other side of an `=` that reads better than saying it once.

The `poe` signal type is untouched for now, so nothing already written stops working. Having
both a type and a flag for one thing is a seam, and it is named here rather than left for
somebody to find.
