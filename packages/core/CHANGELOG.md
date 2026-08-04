# @love-rox/kumihimo-core

## 0.11.0

## 0.10.1

### Patch Changes

- c5a582b: `order: fixed` orders a top-to-bottom drawing too.

  It shipped an hour ago doing nothing in a `TB` diagram. Declaration order was handed to the
  layout as a `y` coordinate — which is the axis a layer is stacked along in a left-to-right
  drawing, and the axis the _flow_ runs along in a top-to-bottom one. Set there, it is a
  position the layering recomputes and throws away.

  Across the flow now: `y` for `LR`, `x` for `TB`.

  The tests that shipped with it did not catch this, because a three-camera example comes out
  in declaration order either way. The regression test is the diagram that found it — two
  nesting levels, five sibling groups, twenty-one links. Nothing smaller reproduced it, and
  that is stated where it sits.

## 0.10.0

### Minor Changes

- 3c87357: `diagram { order: fixed }` places devices in the order they were written.

  Crossing minimisation reorders a layer freely: three cameras written a, b, c come out b, c, a
  if that saves a crossing. Right when the order is incidental — and it usually is. Wrong when
  the order _is_ the drawing. A rack list is read top to bottom, and one reshuffled to save two
  crossings is describing a different rack.

  ```khm
  diagram { order: fixed }
  ```

  Off by default, because untangling the cables is what somebody wants most of the time and
  only the author knows when it is not.

  **Whole-diagram, not per-group**, and that is not a shortcut. The layout engine's
  placement-aware processor may not run at one level of the hierarchy without running at every
  level: a graph with one group asking to keep its order and one ordinary group beside it is
  refused outright. Spelling it `group rack [order=fixed]` would read as local and would not
  be, so it is written where it acts. That was tried first and thrown away.

  Anything other than `fixed` is reported rather than ignored, and `order` is kept off the
  loose options bag once understood — one answer rather than two, the same as `direction`.

### Patch Changes

- 60d697b: A drawing stops shrinking before it stops being readable, and the command line takes a pipe.

  **Scaling had no floor.** A page fits a wide diagram into its column with `max-width: 100%`,
  which scales without limit: a 924px drawing in a 560px note came out at 61%, taking the port
  names from 10px to 6px. The box around it already scrolled — it just never got the chance,
  because the drawing shrank to fit instead.

  `legibleScale()` says how far a drawing may be scaled and still be read. The renderer chose
  the type size, so the renderer is what knows: the smallest label is three under the base
  size, and eight pixels is where a name stops being a name. Both the VS Code Markdown preview
  and the Obsidian plugin now stop there and let the box scroll from there on.

  Measured in a browser at a 560px column: 61% → **80%**, smallest text 6.1px → **8px**, the
  box scrolls, the page does not.

  **`-` and `--stdout`.** `kumihimo - --stdout` reads a diagram from standard input and writes
  the SVG to standard output, with the report on standard error so a redirect gives an SVG and
  nothing else. Imports resolve against the working directory. This is what a tool that renders
  a fenced block by running a command needs, and it is what a pipeline wants anyway.

  **The VS Code README now says which preview.** The Markdown support is a contribution the
  built-in preview reads; _Markdown Preview Enhanced_ is a separate renderer and ignores it, so
  a block stays a block there and says nothing about why. That cost an afternoon to find and
  was not written down anywhere.

- 49c614d: A link between nesting levels is drawn where its ends are.

  A camera inside `収録機材類 > カメラ` running to a switcher inside `収録機材類` came out with
  no line between them. The line was there — a whole group's origin away from both boxes, which
  on the page is indistinguishable from a line that was never drawn.

  An edge was parked on a group only when both devices were in **the same immediate group**,
  and on the root otherwise. ELK lays an edge out in the coordinate system of the lowest node
  holding both of its ends, whatever it is told to put it on, so the points came back relative
  to `収録機材類` and were used as absolute. The offset measured exactly that group's origin.

  The container is now the lowest group holding both ends, walking each device's chain of
  enclosing groups and taking the deepest they share. Twenty-one links in the report that found
  this now all start and end on the ports they name.

  Only nesting was affected: a link inside one group, or between top-level devices, was already
  right. It arrived with nested groups and had nothing testing it.

## 0.9.4

### Patch Changes

- 9ffc0e6: A vertical drawing names its ports.

  `direction: TB` produced a dot for every port and a name beside none of them. The renderer
  had a branch for the two horizontal faces and nothing for the other two, so a top-to-bottom
  diagram came out with twelve labels where a left-to-right one had sixteen — the box knew
  which port was which and the drawing would not say.

  The name goes directly beneath the dot on the top edge and directly above it on the bottom,
  sharing the dot's x: there is nothing beside a port on a horizontal edge but the next port,
  so the trick that works on the sides does not transfer. Clear of the header band the top edge
  runs along, and clear of the cable, which arrives vertically.

  **The columns are measured now.** The horizontal branch has always sized a box around its
  port labels; the vertical one never did, because it was not drawing any — so `CH15` and
  `CH16` would have landed on top of each other the moment the names appeared. Measured per
  edge rather than once for both, because `MAIN_L` and `MAIN_R` on the bottom should not widen
  all sixteen input columns to fit a name none of them carries. A sixteen-in mixer with those
  two outputs comes out 587px rather than 781.

  A left-to-right drawing is unchanged, byte for byte.

- f2fb391: `-d/--direction` now turns the drawing.

  It was in `--help`, it validated nothing, and it did nothing at all. The value arrived as
  `{ options: { direction } }` — a property no build option ever declared, so it type-checked,
  was spread into the compile call, and fell on the floor. The drawing came out the way it
  would have anyway, and nothing said why.

  `BuildOptions` now carries `direction`, and it follows the rule the theme already follows: a
  `diagram { direction: … }` in the source wins, because the drawing knows how it is meant to
  read and the caller only knows a default.

  ```sh
  kumihimo show.khm -d TB      # a source that says nothing now lays out top to bottom
  ```

  An unrecognised value stops rather than being ignored. `-d RL` used to be dropped silently,
  which is the worst of the three outcomes available: the drawing comes out the other way round
  and there is nothing to read about it.

  The CLI tests never caught this because none of them looked at the shape of what came out.
  Two now do, comparing the same diagram laid out both ways rather than asserting a fixed size
  — a four-input switcher is a tall box, so "wider than high" is a fact about the node and not
  about the direction.

## 0.9.3

### Patch Changes

- c51f79b: The small shells, and a cable column that stopped answering.

  Six signal types listed one shell where the gear has several. They are connectors rather
  than types on purpose: a lead with a micro end and a full-size end converts nothing, so
  typing them would report a mismatch on a camera plugged into a switcher — a connection that
  works, and the one thing this validator must never do.

  | Type   | Shells                                                     |
  | ------ | ---------------------------------------------------------- |
  | `hdmi` | `HDMI` / `HDMI Mini` / `HDMI Micro`                        |
  | `dp`   | `DisplayPort` / `DisplayPort Mini`                         |
  | `usb`  | `USB-A` / `USB-B` / `USB-C` / `USB Micro-B` / `USB Mini-B` |
  | `sdi`  | `BNC` / `DIN 1.0/2.3`                                      |
  | `midi` | `DIN-5` / `TRS 3.5mm`                                      |
  | `xlr`  | `XLR` / `Mini XLR` (TA3) / `Mini XLR-4` (TA4)              |

  What it buys is the cable schedule. `HDMI Micro → HDMI` is a lead you either packed or did
  not, and so is a TA4 lavalier.

  **`mateOf` now stays inside its own pair.** It used to answer "the other entry in the list",
  which was the same answer while `xlr` had one pair and the wrong one the moment it had three:
  a mini plug asked for a full-size socket, and nobody sells that lead. A gendered type lists
  its connectors in pairs, male first in each.

  **A value that needs quotes now says so.** `[connector=HDMI Micro]` stopped at the space, read
  `Micro` as the next attribute name, and complained that `=` was missing — about a token
  nobody meant to write. Most of the names above have a space in them, so this went from an
  exotic slip to the ordinary one.

  ```
  error[parse-error]  空白を含む値は引用符で囲みます: `connector="HDMI …"`
  ```

  **The connector column left the page and stayed in the export.** It lists the shells a
  _signal_ comes in, so every XLR row carried the same six names while the row already said
  XLR — the `SDI sdi` stutter one level up, and it got worse the moment there were shells to
  list. The ends this run actually terminates in have their own columns and are the useful
  fact. A spreadsheet still gets the full list.

## 0.9.2

### Patch Changes

- 72cf6d8: A radio has no socket, so nothing arriving at one is overbooked.

  Five laptops on an access point was reported as `port-overbooked`, five times. So were two
  radio mics into one receiver. That rule is a fact about **sockets** — two cables do not go
  into one — and it was being applied to the air, where it does not hold.

  The carrier decides, as it does everywhere else. `ndi over wifi` reaching one port from
  five machines is an access point doing its job; `ndi over lan` reaching one port twice is
  still two cables into one socket, and is still reported.

- 72cf6d8: A socket for the carrier is the right socket.

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

## 0.9.1

### Patch Changes

- d3efacb: Parsing an unreadable statement with a brace in it no longer hangs.

  `rack R1 42U { }` — or `x { 40U: sw }`, or anything else the parser cannot make sense of
  that has a `{` in it — never returned. Recovery stops in front of a `}` because a closing
  brace belongs to the block it closes, which is right inside one and wrong at the top level,
  where there is no block and nobody to consume it. The position never moved, and the loop
  went round for ever.

  Parsing is documented never to throw. **Hanging is worse than throwing**: a caller cannot
  catch it. In the VS Code extension it took the diagnostics and the preview with it, because
  both go through here — which is what "it freezes on save, and after a while it stops
  redrawing at all" looks like from the outside. Half-written source with an open brace in it
  is exactly what an editor sees between keystrokes.

  Found while removing a line in the spec that said groups nest one level deep, by checking
  whether the things still listed as out of scope really were.

## 0.9.0

### Minor Changes

- 4e3e0fe: A group can hold another group.

  A venue holds a stage and a rack; the stage holds the cameras. Both levels are real to
  whoever walks the site, and only the innermost one names the place a box is actually
  standing in.

  ```khm
  group venue "Hall 3" {
    group stage "Stage" { device cam "FX3" as camera { out SDI : sdi } }
    group rack  "Rack"  { device sw "ATEM" as switcher { in 1 : sdi } }
  }
  ```

  The syntax already parsed — nothing reported this as an error. What it did was flatten it:
  `Group` had no way to say what it sat inside, so every group came out as a sibling of every
  other, and an outer group whose devices were all in child groups came out holding nothing
  at all. With nothing to size itself from, it was drawn with no width.

  `Group.parent` now says, and the layout builds a tree rather than a row.

## 0.8.1

### Patch Changes

- e37020b: `as cable` no longer gets told to use `via`, and the formatter edits only what changed.

  An adapter written `as cable` was still being reported as a lead that ought to be a `via`.
  It is one — that is what the author wrote. The two are different ways of saying it: `via`
  names a part on somebody else's run, `as cable` gives the part a row and a number of its
  own, which is the one you want when the thing has a part number. The schedules were already
  correct; only the message was wrong, and being an error it failed `--strict`.

  The formatter replaced the whole document whenever anything changed. That is a line of code
  and a bad idea: the editor invalidates everything and re-tokenises it, folds collapse, and
  the change event coming back out sets this extension's own diagnostics and preview
  redrawing again — on save, when several things are already competing for the moment.

  Now it sends one edit spanning the changed lines. Aligning a block in a 300-line file went
  from 4,411 characters to 33.

  The smoke test caught the change as a regression, which is what it is for: it had been
  reading the edit's text as the finished document, which was only ever true because the
  formatter replaced everything. It now applies the edit the way the editor would, and checks
  the property the whole-document version got for free — that what the editor ends up holding
  is what the formatter meant to write.

## 0.8.0

### Minor Changes

- 6fc570b: One place that knows what the schedules are called.

  Four surfaces show these — the CLI, the VS Code pane, the live editor and the site — and
  each carried its own column list and its own set of headings. Adding the wireless sheet
  meant editing all four, in four different i18n mechanisms. A heading that disagrees between
  two of them is a heading somebody will read as naming two different things.

  `SCHEDULES` says what exists, what columns the rows carry and what each is called, in every
  language the library speaks. `SCHEDULE_KINDS` lists them. `formatCell` is the one that was
  written three times and disagreed: an array of connectors came out `XLR-M / XLR-F` in one
  place and `XLR-M,XLR-F` in another, off the same row.

  **How it looks stays with each surface.** A terminal export wants the port ids and a
  sidebar does not, and forcing one answer on both would have been worse than the duplication
  it removed. The registry hands out the vocabulary, not the layout.

  Writing a test that the columns cover what the rows actually carry immediately found three
  that did not: `signal` and `carrier` — the machine names behind the drawn ones, which every
  other name/id pair on these sheets already had — and `implicit`, the flag saying a device
  was never declared, which is a gap in the drawing rather than a thing to order. All three
  now reach the sheet.

  The VS Code extension drops 21 translated strings, which are now the library's to say.

- 2b9c557: A port can say which connector is on the box, and the cable ends follow.

  ```khm
  device dk "Desk" as mixer   { out CH[1..16] : xlr [connector=XLR-M] }
  device sp "SP"   as speaker { in  IN        : xlr [connector=XLR-F] }
  ```

  Gender is a property of the socket, not of the cable. A plug mates with the opposite
  gender, so a male output takes a female cable end — which means the cable schedule can be
  worked out rather than written. Stated once per socket, every cable reaching that socket
  agrees with it; stated per run, two runs can come to disagree about the same socket.

  The cable schedule gains a **source end** and a **far end**, filled where the ports said
  what they have. `connectors` stays as it was: what the _type_ is terminated with, which
  cannot say which end is which.

  `xlr` is now marked `gendered`, and it is the only builtin that is. That was a real
  ambiguity: its list read `XLR-M / XLR-F` in the same column where `usb` reads
  `USB-A / USB-B / USB-C`, and the two meant different things — a pair against a choice.
  Saying which is which makes it readable and makes the mate derivable. For a type that is
  not a pair, the cable end is the same name rather than an opposite.

  A connector the signal type does not list is reported. So is any port attribute other than
  `connector`: a run's `[…]` list is kept on the model as free-form extra data, so an unknown
  key there survives for whoever wants it, but a port's is not, and a typo would otherwise go
  nowhere quietly.

  A turnaround is now writable as the thing it is — a barrel with two ends the same gender,
  which is exactly why it exists.

### Patch Changes

- 2b9c557: A bidirectional port is drawn on the side it is actually used on.

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

## 0.7.0

### Minor Changes

- 63d760c: Radio paths get their own schedule, and leave the cable one.

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

## 0.6.0

### Minor Changes

- 2151e49: An adapter's ends decide what it is, and `as cable` puts a moulded lead where it is packed
  from.

  The rule that decided the schedules turns out to decide everything:

  > **A run touching an adapter is captive unless it carries a length or a cable number.**

  Not the number of ends. A USB-HDMI dongle has two and is a junction — the USB tail is
  moulded on, the HDMI side is a socket, and the cable reaching it is one somebody has to
  bring. A previous release warned that two ends meant a cable; that was too coarse and is
  replaced by asking whether any end is a socket at all.

  ```khm
  adapter dg "USB-HDMI adapter" {
    in  USB  : usb
    out HDMI : hdmi
  }
  pc.USB  -> dg.USB   : usb              # moulded on — no cable row
  dg.HDMI -> mon.HDMI : hdmi 2m "V-01"   # a socket — one cable to bring
  ```

  `adapter … as cable 5m "C-01"` puts a moulded lead on the **cable schedule**, one row for
  the whole object rather than one per plug, with the far ends listed together. It leaves the
  parts list, rather than appearing on both.

  `?m` says a cable exists and has not been measured. Leaving the length off already worked,
  and the blank it produced meant both "not measured" and "nobody thought about it" — only
  one of which is a job still to do. Any unit the language knows: `?m`, `?ft`.

- 2151e49: A conversion lead is one cable, not a node with cables either side.

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

### Patch Changes

- 2151e49: Nineteen snippets, and the keywords that were never coloured.

  `adapter` and `over` were not coloured — the grammar's keyword list predates both — and
  neither were `via`, `from` and `as`. All are now.

  Nineteen snippets cover every declaration the language has, so the shape of one can be
  inserted rather than remembered. Where a word comes from a fixed list — device kinds,
  signal types, themes, units — the snippet offers that list rather than a blank to guess at.

  The snippets are checked against the compiler rather than against themselves: every word
  offered in a choice list has to be one the compiler accepts, and every skeleton has to
  parse once its placeholders are filled. A snippet that inserts something the compiler
  rejects teaches the wrong thing, which is worse than offering nothing.

  Nothing in core.

## 0.5.0

### Minor Changes

- 45a0ff3: Adds `over`, which says what a signal is riding on.

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

## 0.4.1

### Patch Changes

- 53e7d43: The formatter now gives a multi-line block's braces their own lines.

  Found by running the published 0.4.0, not in a test: a block opened mid-line and closed on
  another came out half-tidied, because the formatter never split a line.

  ```khm
  adapter hd "HDMI-DVI cable" { in IN: hdmi
    out OUT : dvi }
  ```

  The reflow is the smallest one that fixes it. Content is only ever moved across a `{` or
  `}` that already spans lines; statements are never joined or split, and a block written
  entirely on one line is left exactly as it was — splitting every block would be a different
  formatter, and a worse one for a file full of one-port devices.

  An unmatched brace, which is what a half-typed file has, is left alone rather than guessed
  at. A trailing comment stays with the last piece of the line it was written on.

## 0.4.0

### Minor Changes

- e86ae97: Adds `adapter` — a passive part with named ends: a splitter, a Y-lead, a breakout.

  A converter is a powered box. It needs racking **and** a cable on each side, so it is a
  `device`. A conversion lead **is** the cable, and needs only itself. Until now the only way
  to model a part with more than two ends was to declare it as a device, which put a headset
  splitter on the equipment list — where nobody will ever rack it — and invented a cable run
  on each side of a thing that is one line item.

  ```khm
  adapter split "TRRS splitter" {
    io  HS  : trrs35
    out HP  : trs35
    in  MIC : trs35
  }
  ```

  A run touching an adapter is a plug going into a socket, so it produces no cable row. The
  exception is written rather than guessed: a run given a **length or a cable number** is a
  cable. Either alone is enough, because a length is often unknown when the drawing is made
  and a number is often assigned before anyone measures.

  Drawn as a pill without the header band the equipment boxes carry, so a reader does not go
  looking for the splitter in the rack.

  `via` is unchanged, and is still the right thing for a two-ended part inside one run.

  `Device` gained `passive: boolean`. Anything constructing a `Device` by hand has to set it.

- b008f57: Adds `transmitter` and `receiver` device kinds.

  The language has wireless signal types as first-class citizens, and reports a radio path
  wired straight into a cabled input with "put the transmitter or receiver in as a device".
  There was then no kind to declare it as, so following that advice produced
  `unknown-device-kind`. A diagnostic that names a thing the vocabulary cannot express is a
  gap, not a style choice.

  Named separately rather than folded into `interface` because which end a box is decides
  where the signal is going, and an equipment schedule reading "interface ×4" does not tell
  anyone what to pack.

- e86ae97: Adds a formatter: `formatSource` in core, `kumihimo fmt` on the command line, and Format
  Document in VS Code.

  Line-oriented rather than a print of the syntax tree. Statements here are separated by line
  breaks, so lines are the unit the author already thinks in — and a tree printer would have
  to reinvent comment attachment, which is where most formatters lose text.

  It indents by nesting, normalises spacing, and lines the columns up down a run of similar
  lines. That last one is the point: a rack list is read by scanning a column, and columns
  drift the moment anybody edits a name.

  ```khm
  device sw "ATEM Mini Extreme" as switcher {
    in  1..8             : sdi
    in  AUDIO_L, AUDIO_R : trs
    out PGM              : sdi  # main
    out STREAM           : lan
  }
  ```

  A run ends at a blank line, a lone comment, or a change of shape. Each block's columns are
  its own, so widening a name in one device does not reflow another. `--no-align` gives one
  space between everything, which diffs more cleanly and reads worse.

  Formatting never changes what a file says. The tests assert that by compiling before and
  after and comparing the models, not the text — and it settles after one pass.

  `kumihimo fmt --check` fails when a file is not already laid out, for CI.

### Patch Changes

- e86ae97: Documents the two things `via` was being asked to mean, which were being counted
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

- e86ae97: The key below a drawing now says what it is, and fits inside the canvas.

  It lists the signal types in use and had no caption, so a reader counts the entries and
  takes them for the cables. In the sample drawing that is five entries under seven drawn
  runs, sitting beneath a diagram someone plans a job from.

  The canvas width also came from the layout alone, ignoring the key — so a narrow drawing
  with several signal types ran its key off the right-hand edge, where it is not merely ugly
  but cropped.

## 0.3.0

### Minor Changes

- 11156bf: Jack types now carry their barrel size. `trs` was one type listing two connectors, 1/4" and
  3.5mm, which could never answer the question a drawing is for — whether the plug goes in.
  There are now `trs`, `trs35`, `trrs` and `trrs35`, under one rule: a bare name is 1/4", a
  `35` suffix is 3.5mm.

  Same signal at a different barrel asks for the 3.5mm-to-6.3mm adapter and names it, so `via`
  puts it on the parts list. Same barrel at a different pole count is reported as lossy: the
  plug seats, and a four-pole plug in a three-pole jack passes audio while dropping the
  microphone.

  The split also removes a claim that was never true. `xlr` and `trs` are interchangeable
  because an XLR-to-1/4" cable is a stock item; that used to apply to 3.5mm as well, because
  one type stood for both sizes. It no longer does.

  `trs` now means 1/4" only. A diagram using it for a 3.5mm jack should say `trs35`.

- c0aad3d: A port can now declare more than one signal type, written `xlr | trs`, for a connector that
  takes more than one kind of plug — a combo jack receiving either an XLR or a 1/4" plug. The
  first type is what the port is drawn and reported as; the signal named on a connection says
  which one that cable is using, and that is the one judged.

  Adds `usbpd` for power over USB-C. It is its own type in the power category for the same
  reason `poe` is one, and wires freely with `usb` the way `poe` does with `lan`.

  `PortDecl.signal` is now `PortDecl.signals`, and `Port` gained `accepts`.

- bc376de: Diagnostics are written in English by default, and every entry point takes a `locale`.

  The compiler used to answer only in Japanese. The specification is in English and the
  packages are published with English READMEs; a library that replies in a language its caller
  never asked for has decided who its users are.

  `compile`, `parse`, `buildModel`, `loadDocument`, `renderDiagram` and `checkCompatibility`
  all accept `{ locale: 'en' | 'ja' }`, and `cableSchedule` / `adapterSchedule` take one as
  their second argument. It picks the diagnostics, the legend's signal names, the part names on
  the adapter schedule, and the reason attached to a compatibility verdict. A locale the
  catalogue does not carry falls back to English rather than to a blank.

  A diagnostic now also carries the `key` and `params` it was rendered from, so an editor
  holding one compile can re-render it in another language without recompiling:

  ```ts
  formatMessage(diagnostic.key, diagnostic.params, "ja");
  ```

  `KumihimoEditor` takes a `locale` that drives both its own labels and the compiler's, so a
  page cannot end up with tabs in one language and faults in another.

  A reason written by an author in their own `compat` declaration is passed through as
  written. Translating what someone else typed is not this library's business.

  **Breaking in effect, not in type:** anything asserting on a diagnostic's wording now sees
  English. Pass `locale: 'ja'` to keep what you had.

  The command line is the exception. It reads `LC_ALL`, `LC_MESSAGES` and then `LANG`, and
  takes `--lang` to override them — it shipped speaking Japanese, and an upgrade that silently
  changed the language of an existing user's output would be a regression dressed as a feature.

## 0.2.0

### Minor Changes

- 6c083f6: Add `gap`, which leaves space above the port declaration that follows it, so a strip of
  connectors reads as the blocks it actually is — four HDMI inputs, then a space, then four
  SDI. One `gap` is half a port pitch; `gap <n>` is n of those. It is presentation only: the
  same diagram with every `gap` removed describes the same system.

## 0.1.1

### Patch Changes

- 16cd85f: Point each package README at kumihimo.love-rox.cc, where the guide and the editor are. npm
  shows a package's own README, so the site was reachable from the repository but not from any
  of the seven pages people actually land on.

## 0.1.0

### Minor Changes

- c771544: First release.

  kumihimo writes AV signal flow diagrams (系統図) as text. Unlike a flowchart tool, the unit
  of connection is a **port** and the **signal type** on a cable is something the tool
  understands, so it can tell you when the drawing is wrong.

  - A language with devices, ports, groups, equipment libraries (`model` / `use`), cable
    colours, adapters (`via`) and wireless links carrying frequencies instead of lengths.
  - Validation that catches the faults where the cable plugs in perfectly and nothing works:
    HDBaseT into an Ethernet switch, analogue RCA into a S/PDIF input, SDI into a genlock
    reference. Every verdict carries its reason.
  - SVG rendering with four themes, including a monochrome one that distinguishes signals by
    line style for drawings that get photocopied.
  - Cable, equipment and adapter schedules derived from the same model.
  - A CLI, a rehype plugin, React / Vue / Astro adapters, an embeddable live editor, and
    export to editable draw.io files with ports preserved.
