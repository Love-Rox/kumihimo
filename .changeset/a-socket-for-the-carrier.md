---
'@love-rox/kumihimo-core': patch
---

A socket for the carrier is the right socket.

```khm
device pc "PC" as computer { out WIFI : ndi }
device ap "AP" as router   { io  WIFI : wifi }

pc.WIFI -> ap.WIFI : ndi over wifi
```

That was reported as `Wi-Fi は無線区間なので NDI に直結できない。送受信機を機器として配置すること`
— asking for the access point it is plugged into. The check did not know about `over`: it
compared the payload against the carrier, found air meeting copper, and named a fault that
was not there.

`over` says those two travel together, so a socket for either is one this run can plug
into. **Both ends, though.** A Wi-Fi socket wired to an RJ45 socket does not become sound
by saying what rides on it, and that check still catches it — which a first attempt at this
broke, and an existing test caught within the minute.
