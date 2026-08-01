---
'@love-rox/kumihimo-core': patch
---

A radio has no socket, so nothing arriving at one is overbooked.

Five laptops on an access point was reported as `port-overbooked`, five times. So were two
radio mics into one receiver. That rule is a fact about **sockets** — two cables do not go
into one — and it was being applied to the air, where it does not hold.

The carrier decides, as it does everywhere else. `ndi over wifi` reaching one port from
five machines is an access point doing its job; `ndi over lan` reaching one port twice is
still two cables into one socket, and is still reported.
