---
'@love-rox/kumihimo-core': patch
---

A bidirectional port is drawn on the side it is actually used on.

`io` says a port _can_ go either way, not that it does. Which one it is in a given drawing
is written down already — in the runs that touch it. A port that only ever receives is an
input here, whatever it is capable of, and drawing it on the outgoing face sent every run
that reached it around the box.

```khm
device ap "Access point" as router { io WIFI : ndi  out LAN : ndi }
cam.WIFI -> ap.WIFI : ndi over wifi [ch=36]   # nothing leaves by WIFI
```

Only a genuinely two-way port — an L2 switch, a `<->` — is ambiguous, and that keeps the
old default of the outgoing face. So does a port with nothing connected: there is nothing
to read.

This is the rule the rest of the language already follows. Whether an adapter's end is
captive is read off the run, not the declaration; what decides a run's physics is the
carrier named on it. The one place still deciding from the shape of a declaration was this.

No source has to change. `io` still means what it meant.
