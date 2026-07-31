---
'@love-rox/kumihimo-core': minor
---

Adds `wireless-ndi`, and reports a channel written on a cable.

The language could describe a radio path carrying audio, video or DMX, and a cabled NDI
run — but not the arrangement people actually build, which is NDI over Wi-Fi. Written as
`wifi` it compiles, and the drawing then says only "Wi-Fi", which does not tell a reader
whether the link carries the programme feed or somebody's laptop.

```khm
device cam "PTZ" as camera { out NDI : wireless-ndi }
device ap  "AP"  as router { io WIFI : wireless-ndi  out LAN : ndi }

cam.NDI -> ap.WIFI : wireless-ndi [ch=36]
ap.LAN  -> pc.NDI  : ndi 10m "N-01"
```

Found beside it: `[ch=…]` and `[freq=…]` on a **cabled** run were read by nothing and said
nothing, so a line copied from the wireless half of a drawing looked fine and meant
nothing. The mirror rule — a length on a radio path — has been reported since the
beginning. Now both are.
