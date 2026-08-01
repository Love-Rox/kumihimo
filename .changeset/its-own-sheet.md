---
'@love-rox/kumihimo-core': minor
'@love-rox/kumihimo-cli': minor
'@love-rox/kumihimo-editor': minor
'kumihimo-vscode': minor
---

Radio paths get their own schedule, and leave the cable one.

They were on the cable schedule, on the reasoning that they are part of the system and
somebody has to check the frequency. That is true, and it is an argument for listing them
— not for listing them _there_. The cable schedule is what somebody packs a van from, and
a row with no length, no connector and nothing to coil reads as a cable that was never
measured.

```
kumihimo export show.khm cable    --stdout   # what to pull
kumihimo export show.khm wireless --stdout   # what to co-ordinate
```

The two sheets are read by different people looking for different things: enough cable to
reach, against two paths on one channel. `wirelessSchedule(diagram, locale)` returns the
second, and the live editor and the VS Code pane both show it beside the others.

The wireless schedule has an **over** column, filled when `over` named a carrier that is
not the signal itself. NDI over Wi-Fi is an NDI row riding on Wi-Fi: the name belongs to
the payload and the frequency to the carrier, which is why they are separate columns.

**Breaking:** `CableRow` loses `medium` and `frequency`, and the `LinkMedium` type is gone
with them. Every row is now a cable, so a field that could only say so was a discriminator
that no longer discriminated — the kind of thing that goes on looking meaningful in a
caller long after it stopped being. The `cable` TSV export loses the same two columns.
