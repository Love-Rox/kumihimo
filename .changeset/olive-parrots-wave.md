---
'@love-rox/kumihimo-core': minor
---

Adds `transmitter` and `receiver` device kinds.

The language has wireless signal types as first-class citizens, and reports a radio path
wired straight into a cabled input with "put the transmitter or receiver in as a device".
There was then no kind to declare it as, so following that advice produced
`unknown-device-kind`. A diagnostic that names a thing the vocabulary cannot express is a
gap, not a style choice.

Named separately rather than folded into `interface` because which end a box is decides
where the signal is going, and an equipment schedule reading "interface ×4" does not tell
anyone what to pack.
