---
'@love-rox/kumihimo-core': patch
---

Documents the two things `via` was being asked to mean, which were being counted
differently by accident.

`via "HDMI-DVI cable"` on a 2 m run counts one object twice: the cable row _is_ the
HDMI-DVI cable, and the parts row is that same cable. Someone packing from both schedules
brings two. The other reading — an ordinary cable with a small adapter on the end — really
is two objects, and two rows are right.

Nothing in the source distinguished them, so the distinction is now in the source:

- `via` is **an adapter used with an ordinary cable**. Two objects, two rows.
- A **converting lead** is one object. Declare it with `adapter`, and it is counted once.

No behaviour changed; the spec and its examples did, and both cases are now locked in by
tests so the difference stays deliberate.
