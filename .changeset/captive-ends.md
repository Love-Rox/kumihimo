---
'@love-rox/kumihimo-core': minor
---

An adapter's ends decide what it is, and `as cable` puts a moulded lead where it is packed
from.

The rule that decided the schedules turns out to decide everything:

> **A run touching an adapter is captive unless it carries a length or a cable number.**

Not the number of ends. A USB-HDMI dongle has two and is a junction — the USB tail is
moulded on, the HDMI side is a socket, and the cable reaching it is one somebody has to
bring. A previous release warned that two ends meant a cable; that was too coarse and is
replaced by asking whether any end is a socket at all.

```khm
adapter dg "USB-HDMI adapter" {
  in  USB  : usb
  out HDMI : hdmi
}
pc.USB  -> dg.USB   : usb              # moulded on — no cable row
dg.HDMI -> mon.HDMI : hdmi 2m "V-01"   # a socket — one cable to bring
```

`adapter … as cable 5m "C-01"` puts a moulded lead on the **cable schedule**, one row for
the whole object rather than one per plug, with the far ends listed together. It leaves the
parts list, rather than appearing on both.

`?m` says a cable exists and has not been measured. Leaving the length off already worked,
and the blank it produced meant both "not measured" and "nobody thought about it" — only
one of which is a job still to do. Any unit the language knows: `?m`, `?ft`.
