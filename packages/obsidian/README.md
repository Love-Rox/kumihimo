# kumihimo for Obsidian

Write AV signal flow diagrams (系統図) as text in a code block, and read them as drawings.

````markdown
```kumihimo
device cam "SONY FX3"  as camera   { out SDI : sdi }
device sw  "ATEM Mini" as switcher { in 1..4 : sdi  out PGM : sdi }
device rec "HyperDeck" as recorder { in SDI : sdi }

cam.SDI -> sw.1    : sdi 30m "V-01" [color=blue]
sw.PGM  -> rec.SDI : sdi 2m  "V-10"
```
````

Both `kumihimo` and `khm` open a block.

## What you get

**The drawing**, laid out for you. Ports sit on the face the signal flows through, groups
are drawn as frames, and a run carries its number, its length and its jacket colour.

**The schedules**, folded up underneath — the cable list, the wireless list, the equipment
list and the parts list. These are the documents a job actually travels with, and they come
from the same compiler as the picture, so the drawing and the packing list cannot disagree.

**What is wrong with it**, where anything is. The connections are judged on whether they can
physically work, not only on whether the syntax parses:

```
warning [signal-mismatch]  ext.CAT → netsw.1
  HDBaseT uses Cat cable and RJ45 but is not Ethernet. It does not go into a switch
```

That cable seats perfectly and carries nothing. So do `dmx`↔`xlr`, `rca`↔`spdif` and
`genlock`↔`sdi`. A note with a wrong drawing in it is worse than a note with none.

## Settings

**Theme** — `light`, `dark`, `mono` or `blueprint`. A `diagram { theme: … }` inside the
block wins, because a drawing that names its own look is saying something about that
drawing rather than about your vault.

**Show the schedules** — off if you only want the picture.

## The language

The full specification, with every signal type and every rule:
[Love-Rox/kumihimo](https://github.com/Love-Rox/kumihimo#readme).

The same compiler runs in a command-line tool, a VS Code extension and on the web, so a
diagram written in a note opens anywhere else unchanged.

## Installing by hand

Copy `main.js`, `manifest.json` and `styles.css` from a
[release](https://github.com/Love-Rox/obsidian-kumihimo/releases) into
`YourVault/.obsidian/plugins/kumihimo/`, then enable it under Community plugins.

## Licence

MIT. See [LICENSE](LICENSE).
