---
'@love-rox/kumihimo-core': minor
---

A conversion lead is one cable, not a node with cables either side.

`adapter` makes a **node** — a place the drawing stops at and several runs meet. That is
right for a splitter, which is a real junction, and wrong for a two-ended lead, which is a
single unbroken run. Modelling one as a node invents a stop in the middle of a cable and
draws one object as three. Two ends are now reported, pointing at `via`.

`via` was also counting the same object twice. On a run whose ends disagree, the part it
names **is** the cable, and the cable schedule already accounts for it. On a run whose ends
agree it is a separate thing to bring, and two rows are right. Nothing new has to be
written to tell them apart — the compatibility check already names the lead a pairing
needs, so it knows.

|                                       | cable schedule              | parts list  |
| ------------------------------------- | --------------------------- | ----------- |
| `hdmi` → `dvi` `via "HDMI-DVI cable"` | the run, naming the lead    | —           |
| `sdi` → `sdi` `via "BNC-RCA adapter"` | the run, naming the adapter | the adapter |

And a junction's row lists **what it plugs into** rather than the runs it takes part in.
Three runs against one part read as three cables, which is the thing this schedule exists
to stop saying.

The specs said to use `adapter` for a two-ended lead. That was wrong, and is corrected.
