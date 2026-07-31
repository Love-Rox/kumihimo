---
'@love-rox/kumihimo-core': minor
---

Adds `over`, which says what a signal is riding on.

A port is a piece of physics: an RJ45 socket, a radio. What travels through it is chosen
per run — NDI today, Dante tomorrow. Without a way to say that, the language needed one
signal type per combination, and a wireless camera wanted a `wireless-ndi` that would have
been followed by a wireless-dante and the rest.

```khm
cam.WIFI -> ap.WIFI   : ndi   over wifi [ch=36]
ap.LAN   -> pc.LAN    : ndi   over lan 10m "N-01"
ap.LAN   -> dsk.DANTE : dante over lan 15m "N-02"
```

**The carrier decides the physics** — the connector, whether there is a cable to coil or a
channel to pick, and whether the two ends can meet. **The payload is what the drawing is
about**, and is what the key names. So the same NDI appears as `ch 36` with no connector
through the air, and as `10m` on RJ45 down the cable.

Without `over` a signal is its own carrier, and everything behaves exactly as before.

Found beside it: `[ch=…]` and `[freq=…]` on a **cabled** run were read by nothing and said
nothing, so a line copied from the wireless half of a drawing looked fine and meant
nothing. The mirror rule — a length on a radio path — has been reported since the
beginning. Now both are.
