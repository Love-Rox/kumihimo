# kumihimo DSL specification (v0.1)

**English** | [日本語](SPEC.ja.md)

A language for writing **AV signal flow diagrams (系統図)** — video, audio, control and
power — as text.

---

## 1. What this is built on

Mermaid's flowchart joins nodes with edges. An AV signal flow diagram joins **ports**, and
that difference decides everything else.

|                        | Mermaid flowchart | kumihimo                                       |
| ---------------------- | ----------------- | ---------------------------------------------- |
| Unit of connection     | node → node       | **port → port**                                |
| Meaning of a line      | arbitrary         | **signal type** (SDI / XLR / Dante …)          |
| Validation             | none              | type mismatches, direction, over-booked inputs |
| Position within a node | meaningless       | **meaningful** — `IN 1` is not `IN 2`          |

These three points are why kumihimo exists, and why its data model must not be modelled on
Mermaid's.

---

## 2. File format

- Extension: `.khm`
- Encoding: UTF-8
- Line endings: LF or CRLF
- Whitespace and indentation are insignificant
- Statements are separated by a **newline** or `;`

### Comments

```khm
# to end of line
```

---

## 3. Overall shape

```khm
diagram "Studio A" {
  direction: LR
}

signal madi : audio { color: "#f59e0b" }

device cam1 "SONY FX3" as camera {
  out SDI : sdi
}

group stage "Stage" {
  device mic1 "SM58" as microphone { out OUT : xlr }
}

cam1.SDI -> sw.1 : sdi 10m "V-01"
```

Seven kinds of statement may appear at the top level: `diagram`, `signal`, `compat`,
`device`, `model`, `group`, `use`, and connections. Order is free and **forward references
are allowed** — a connection may name a device declared further down the file.

---

## 4. `diagram` — document settings

```khm
diagram "Studio A" {
  direction: LR      # LR (left to right, default) | TB (top to bottom)
  theme: light       # light (default) | dark | mono | blueprint
  spacing: 60        # gap between nodes, px
}
```

Title and block are both optional. At most one per file.

### Colour themes

| Name        | For                                           |
| ----------- | --------------------------------------------- |
| `light`     | Default. Screen and colour print              |
| `dark`      | Dark screens                                  |
| `mono`      | **Black and white print and photocopies**     |
| `blueprint` | Blueprint colouring, as facility drawings use |

`mono` uses no colour at all. **Signals are distinguished by line style instead**, and a
jacket colour given with `[color=…]` is ignored — pretending a colour survived a photocopy
helps nobody.

A theme can also be passed on the command line with `-t/--theme`, but a `diagram { theme: … }`
in the source wins: the drawing knows how it is meant to look, the caller only knows a
default.

---

## 5. `device` — a piece of equipment

```text
device <id> "<label>" as <kind> {
  <port declarations>*
  <metadata>*
}
```

- `<id>` — how connections refer to it. Not drawn by default.
- `"<label>"` — the name drawn on the diagram. Defaults to `<id>`.
- `as <kind>` — picks the shape. Defaults to `generic`.

### Device kinds

`camera` `switcher` `mixer` `recorder` `player` `display` `projector` `speaker`
`microphone` `amplifier` `computer` `converter` `transmitter` `receiver` `matrix`
`patchbay` `router` `interface` `generic`

### Port declarations

```text
in   <port spec> : <signal>          # input
out  <port spec> : <signal>          # output
io   <port spec> : <signal>          # bidirectional (Dante, Ethernet …)
```

A port spec takes four forms.

| Form           | Example     | Expands to         |
| -------------- | ----------- | ------------------ |
| Single         | `SDI`       | `SDI`              |
| List           | `L, R`      | `L`, `R`           |
| Numeric range  | `1..4`      | `1`, `2`, `3`, `4` |
| Prefixed range | `CH[1..16]` | `CH1` … `CH16`     |

```khm
device sw "ATEM Mini Pro" as switcher {
  in  1..4     : hdmi
  out PGM      : hdmi
  out STREAM   : lan
}

device mixer "Yamaha DM3" as mixer {
  in  CH[1..16] : xlr
  out L, R      : xlr
  io  DANTE     : dante
}
```

**Declaration order is preserved and drawn.** `IN 1` sits above `IN 2` in every render.

### One connector, more than one thing

Some connectors take more than one kind of plug. A combo jack receives an XLR or a 1/4"
plug; write both, separated by `|`.

```khm
device desk "Yamaha DM3" as mixer {
  in CH[1..8] : xlr | trs   # combo jacks
  in CH[9..16] : xlr
}

mic.OUT -> desk.CH1 : xlr   # ok
di.OUT  -> desk.CH2 : trs   # ok
```

- The **first** type is what the port is drawn and reported as. A connector has to be one
  colour on the drawing and one row in the schedule, and the order written decides.
- The signal named on the connection says **which of them this cable is using**, so that is
  the one judged. Where the connection names none, the first applies.
- Every name is checked, so a typo in the second position is reported rather than silently
  leaving the port with only the half that was spelled correctly.

This is about a connector accepting two things, not about two things being equivalent.
`xlr` and `trs` are already interchangeable (§9); writing `xlr | trs` says something else —
that this particular hole physically takes either plug.

### Jack sizes

Jack types carry their barrel size, because size is what decides whether the plug goes in.
The rule is uniform: **a bare name is 1/4", a `35` suffix is 3.5mm.**

| Type     | Connector  |
| -------- | ---------- |
| `trs`    | TRS 1/4"   |
| `trs35`  | TRS 3.5mm  |
| `trrs`   | TRRS 1/4"  |
| `trrs35` | TRRS 3.5mm |

TRRS is far more often met as 3.5mm, so `trrs` meaning the 1/4" one is the less expected
reading. A rule that holds everywhere is easier to carry than one with an exception in it.

Same signal, different barrel is an **adapter** (§9): the run needs a 3.5mm-to-6.3mm plug,
which `via` puts on the parts list. Same barrel, different pole count is **lossy**: the plug
seats and one conductor lands on the wrong contact, so a four-pole plug in a three-pole jack
passes audio and drops the microphone.

### `gap` — space between blocks of ports

A bare `gap` line leaves blank space above whatever is declared next, so a strip of
connectors reads as the blocks it actually is.

```khm
device sw "ATEM Mini Extreme" as switcher {
  in  1..4 : hdmi
  gap
  in  5..8 : sdi
  gap 2
  in  AUDIO_L, AUDIO_R : trs
  out PGM    : sdi
  gap
  out STREAM : lan
}
```

- One `gap` is one step — half the spacing between ports. `gap <n>` is n steps, and
  consecutive `gap` lines add up.
- The space goes **above** the declaration that follows, never below the one before, so it
  reads the way it is written.
- A declaration that expands into many ports gets the space **once**, before the first of
  them: `gap` above `in CH[1..16]` is one space before `CH1`, not sixteen down the strip.
- A `gap` with nothing after it is dropped. In a `model` it may well stop being last, once
  a `device … from` adds ports below it.
- `gap 0` and negative counts are rejected. They read as an intention the drawing cannot
  carry out.

This is presentation only. It changes no port, no connection and no schedule — the same
diagram with every `gap` removed describes the same system.

### Metadata

```khm
device rec "HyperDeck" as recorder {
  in  SDI : sdi
  @model  "HyperDeck Studio HD Mini"
  @serial "ABC12345"
  @note   "ProRes 422 only"
}
```

Any `@`-prefixed key. Not drawn, but carried into the equipment schedule and exports.

---

## 6. `group` — a frame around devices

```khm
group stage "Stage" {
  device cam1 "SONY FX3" as camera { out SDI : sdi }
  device mic1 "SM58" as microphone { out OUT : xlr }
}
```

Represents a location, a rack or a subsystem. Drawn as a frame. Nesting is **one level** in
v0.1.

---

## 7. Connections

```text
<device>.<port> <arrow> <device>.<port> : <signal> <modifier>*
```

### Arrows

| Syntax | Meaning                                |
| ------ | -------------------------------------- |
| `->`   | one way, in the direction signal flows |
| `<->`  | two way (Dante, Ethernet, control …)   |
| `--`   | no direction (power …)                 |

### Modifiers

Modifiers may appear in any order and any may be omitted.

| Syntax         | Meaning                    | Example                       |
| -------------- | -------------------------- | ----------------------------- |
| `<length>`     | cable length               | `10m` `30cm` `2.5m` `3ft`     |
| `"<label>"`    | cable number or name       | `"V-01"`                      |
| `via "<part>"` | adapter or converting lead | `via "HDMI-DVI cable"`        |
| `[k=v, …]`     | arbitrary attributes       | `[connector=BNC, color=blue]` |

Length is a **bare token of a number and a unit** — `mm`, `cm`, `m`, `in`, `ft`. `#` is
reserved for comments, so it never prefixes a length.

```khm
cam1.SDI    -> sw.1        : sdi   10m "V-01"
mic1.OUT    -> mixer.CH1   : xlr   5m  "A-01" [connector=XLR]
mixer.DANTE <-> netsw.1    : dante
pdu.1       -- rack1.AC    : ac
pc.HDMI     -> mon.DVI     : hdmi  via "HDMI-DVI cable"
```

### `over` — what is riding on what

A port is a piece of physics: an RJ45 socket, a radio. What travels through it is chosen
per run — NDI today, Dante tomorrow. `over` says both.

```khm
device cam "PTZ" as camera   { out WIFI : wifi }
device ap  "AP"  as router   { io WIFI : wifi  out LAN : lan }
device pc  "PC"  as computer { in LAN : lan }
device dsk "Desk" as mixer   { in DANTE : lan }

cam.WIFI -> ap.WIFI   : ndi   over wifi [ch=36]
ap.LAN   -> pc.LAN    : ndi   over lan 10m "N-01"
ap.LAN   -> dsk.DANTE : dante over lan 15m "N-02"
```

**The carrier decides the physics.** The connector, whether there is a cable to coil or a
channel to pick, and whether the two ends can meet at all. **The payload is what the
drawing is about**, and is what the key names.

The same NDI therefore appears twice, correctly each time:

| No.  | From | To   | Signal | Length | Connectors |
| ---- | ---- | ---- | ------ | ------ | ---------- |
| —    | PTZ  | AP   | NDI    | ch 36  | —          |
| N-01 | AP   | PC   | NDI    | 10m    | RJ45       |
| N-02 | AP   | Desk | Dante  | 15m    | RJ45       |

Without `over`, a signal is its own carrier and everything behaves as before — `: sdi 30m`
is unchanged, and always will be.

A length on a run through the air is reported, and so is a channel on a run down a cable.
They are the same mistake: a line copied from the other kind of run.

---

### Cable colour

`[color=…]` gives a cable its jacket colour. The line is drawn in that colour, **overriding
the signal type's default**.

```khm
cam1.SDI -> sw.1 : sdi 30m "V-01" [color=blue]
cam2.SDI -> sw.2 : sdi 30m "V-02" [color=red]
mic1.OUT -> mixer.CH1 : xlr [color="#0af"]
```

This is not decoration. It is **how a run gets identified on site** — "the blue one into 1",
"the red one into 2" — so the colour is carried into the cable schedule.

Colour names are accepted in English or Japanese.

| English  | 日本語 | English  | 日本語 |
| -------- | ------ | -------- | ------ |
| `red`    | 赤     | `purple` | 紫     |
| `blue`   | 青     | `black`  | 黒     |
| `green`  | 緑     | `white`  | 白     |
| `yellow` | 黄     | `gray`   | 灰     |
| `orange` | 橙     | `brown`  | 茶     |
| `pink`   | 桃     |          |        |

Hex such as `#0af` or `#00aaff` also works. Anything else is a diagnostic
(`invalid-value`) and never reaches the drawing.

The legend keeps showing the **signal type's** colour. An individual cable's colour is a
separate fact and the two are not mixed.

### `adapter` — a junction, not a lead

An `adapter` is a **node**: a place a drawing stops at and several runs meet. That is what
a splitter is, and it is why it needs one.

```khm
adapter split "TRRS splitter" {
  io  HS  : trrs35
  out HP  : trs35
  in  MIC : trs35
}

phone.HS -> split.HS  : trrs35
split.HP -> hp.IN     : trs35
mic.OUT  -> split.MIC : trs35
```

It lands on the parts list, not the equipment list — nobody racks a headset splitter — and
the runs touching it are plugs going into sockets rather than cables to bring, so they
produce no cable rows. Give one a length or a cable number and it becomes a cable:

```khm
split.HP -> hp.IN : trs35            # plugged straight in
split.HP -> hp.IN : trs35 5m "A-02"  # a 5 m cable, on the schedule
split.HP -> hp.IN : trs35 "A-02"     # a cable whose length nobody has measured yet
```

**A part with two ends is not a junction.** A converting lead is one unbroken cable, and
declaring it as an `adapter` puts a stop in the middle of it that is not there — one object
drawn as three. Two ends are reported, and belong on the run itself:

```khm
# Wrong: invents a node in the middle of one cable
adapter hd "HDMI-DVI cable" { in IN : hdmi  out OUT : dvi }
pc.HDMI -> hd.IN   : hdmi
hd.OUT  -> mon.DVI : dvi

# Right
pc.HDMI -> mon.DVI : hdmi 2m "V-02" via "HDMI-DVI cable"
```

---

### `via` — a part that sits in a run

```khm
pc.HDMI -> mon.DVI : hdmi 2m  "V-02" via "HDMI-DVI cable"
cam.SDI -> mon.SDI : sdi  30m "V-01" via "BNC-RCA adapter"
```

Those two look alike and are not. **The first names one object: the lead is the run.** The
second names two: an ordinary 30 m SDI cable, and an adapter on the end of it.

Nothing has to be written to tell them apart — the compatibility check already knows,
because it names the lead a pairing needs. Where the ends disagree, the part is the cable
and appears only on the cable schedule, in its adapter column. Where the ends agree, it is
a separate thing to bring and appears on the parts list as well.

|                                       | cable schedule              | parts list  |
| ------------------------------------- | --------------------------- | ----------- |
| `hdmi` → `dvi` `via "HDMI-DVI cable"` | the run, naming the lead    | —           |
| `sdi` → `sdi` `via "BNC-RCA adapter"` | the run, naming the adapter | the adapter |

`via` is not a way to silence a warning. It is **a declaration that puts a part on the
schedule**.

- **Pairings a cable can genuinely bridge** (HDMI↔DVI, DP→HDMI …) — declaring `via` clears
  the diagnostic. Leaving it undeclared is still reported, and the required part is named
  on the run.
- **Pairings no cable can bridge** (SDI→HDMI …) — `via` does **not** clear the diagnostic.
  These need a converter, which is a powered box, and therefore belongs in the diagram as a
  **device**.

### Parallel runs

When both ends name the same number of ports, they pair up in order.

```khm
mixer.(L, R) -> amp.(IN_L, IN_R) : trs
```

is equivalent to

```khm
mixer.L -> amp.IN_L : trs
mixer.R -> amp.IN_R : trs
```

---

## 8. Signal types

The `: <signal>` on a connection describes **the cable**. Compatibility (§9) is judged
against **the two ports' declared types**; the link's type only fills in for an end that
declares nothing.

```khm
device ext   as converter { out CAT : hdbaset }
device netsw as router    { io  1..8 : lan }

# Writing `: hdbaset` does not change the check: hdbaset (out) against lan (in) is flagged
ext.CAT -> netsw.1 : hdbaset
```

Reverse that priority and the link's type speaks for both ends, every check compares a type
against itself, and **no mismatch can ever be detected**. Only when neither end declares a
type does the link's type apply to both.

The builtin `generic` means "unspecified" and is compatible with everything, so a diagram
in progress is not a wall of warnings.

### Builtin signal types

#### Video

`sdi` `hdmi` `dp` `dvi` `vga` `composite` `component` `hdbaset` `ndi` `st2110` `fiber`

#### Audio

`xlr` `trs` `trs35` `trrs` `trrs35` `rca` `speakon` `aes` `dante` `madi` `adat` `spdif` `optical`

#### Control

`rs232` `rs422` `rs485` `dmx` `midi` `gpio` `ir`

#### Network

`lan` `usb`

#### Power

`ac` `dc` `poe` `usbpd`

#### Sync

`genlock` `wordclock` `timecode`

#### Wireless

`wifi` `bluetooth` `uhf` (radio mic) `iem` `wireless-video` `wireless-dmx` `ir`

Wireless is **not a category of its own**. The content keeps its family — `wireless-video`
is video, `uhf` is audio — and takes that family's colour. Only the drawing and the
validation change.

### Declaring your own

```khm
signal madi64 : audio {
  color: "#f59e0b"
  style: solid        # solid | dashed | dotted
  width: 2
  label: "MADI 64ch"
  wireless: false
}
```

`: <category>` is one of the existing categories; it defaults to `generic`. A declaration
sharing a builtin's name overrides it, which is how a house drawing convention is applied
without forking the package.

---

## 9. Compatibility

Every connection is judged on whether it can physically work. The verdict has three values
and **always carries a reason**.

| Verdict        | Meaning                                               | Treated as |
| -------------- | ----------------------------------------------------- | ---------- |
| `ok`           | a normal connection                                   | silent     |
| `lossy`        | works, but something is given up, or a part is needed | warning    |
| `incompatible` | will not work without active conversion               | reported   |

Resolution order, highest first:

1. **`compat` declarations** (author override)
2. **Identical signal types** → `ok`
3. **Connector confusions** → `incompatible`
4. **Passive adapters** → `ok` with `via`, `lossy` without
5. **Lossy pairs** → `lossy`
6. **Interchangeable groups** → `ok`
7. Nothing matched → `incompatible`

Step 3 comes before step 4 on purpose: a pairing that merely shares a connector must never
be mistaken for one a cable can bridge.

### Connector confusions

The pairings where **the plug fits and nothing works**. The cable seats perfectly, the
drawing looks fine, and no signal arrives. These are what kumihimo most wants to catch.

| Pairing                   | Shared connector | What actually happens                    |
| ------------------------- | ---------------- | ---------------------------------------- |
| `hdbaset` ↔ `lan`         | RJ45             | HDBaseT is not Ethernet                  |
| `dmx` ↔ `xlr`             | XLR              | lighting control, not audio              |
| `rca` ↔ `spdif`           | RCA              | analogue against digital                 |
| `adat` ↔ `spdif`          | TOSLINK          | different protocols                      |
| `composite` ↔ `component` | BNC / RCA        | one wire against three                   |
| `genlock` ↔ `sdi`         | BNC              | a reference input will not lock to video |
| `wordclock` ↔ `sdi`       | BNC              | a word clock input will not take video   |

### `compat` — overriding a rule

A site standard can be stated once, **with its reason**.

```khm
compat aes -> xlr : ok      "house standard: under 10m"
compat xlr -> rca : lossy   "always through a DI"
```

`compat` is configuration and documentation at once. The reason reaches the diagnostic and
the cable schedule, so _why_ a connection was allowed is never lost from the drawing.

Rules are symmetric by default. State otherwise when they are not.

```khm
compat dp -> hdmi : ok "dual-mode sources only" [symmetric=false]
```

---

## 10. Implicit devices and ports

Referring to a device or port that was never declared **creates it**, with a diagnostic.

```khm
cam1.SDI -> sw.1 : sdi    # sw was never declared
```

This exists for sketching. A finished drawing should declare everything; the strictness is
configurable per rule (§11).

An end with no port named at all gets a fresh numbered port — which is how `pdu -- rack1`
written twice models two outlets rather than one over-booked one.

---

## 11. Diagnostics

| Code                   | Meaning                                          | Default |
| ---------------------- | ------------------------------------------------ | ------- |
| `parse-error`          | syntax that could not be read                    | error   |
| `implicit-device`      | referred to an undeclared device                 | warning |
| `implicit-port`        | referred to an undeclared port                   | warning |
| `signal-mismatch`      | the two ends disagree about the signal           | warning |
| `adapter-required`     | an adapter is needed but not declared            | warning |
| `adapter-insufficient` | `via` was declared but no cable can bridge this  | error   |
| `direction-mismatch`   | output to output, or input to input              | error   |
| `duplicate-connection` | the same pair of ports wired twice               | warning |
| `port-overbooked`      | more than one source into one input              | error   |
| `unknown-signal`       | an unregistered signal type                      | error   |
| `unconnected-port`     | a declared port wired to nothing                 | off     |
| `duplicate-id`         | two devices share an id                          | error   |
| `invalid-port-spec`    | a range that cannot be expanded                  | error   |
| `unknown-device-kind`  | a kind kumihimo cannot draw                      | warning |
| `invalid-value`        | a well-formed declaration with an unusable value | error   |
| `unresolved-import`    | a `use` naming a file that cannot be found       | error   |
| `unknown-model`        | a device naming a model no library declares      | error   |
| `ignored-in-import`    | an imported file held devices or connections     | warning |

**Nothing throws.** Every stage collects diagnostics and returns a best-effort result, so a
faulty diagram still renders. A picture of a flawed system is exactly what an author needs
in order to see the flaw.

### Language

Diagnostics are written in **English** by default. Every entry point takes a `locale`:

```ts
compile(source, { locale: 'ja' });
parse(source, { locale: 'ja' });
buildModel(document, { locale: 'ja' });
loadDocument(source, { locale: 'ja' });
```

`en` and `ja` are carried; anything else falls back to English rather than to a blank. The
same option picks the language of the legend's signal names, the part names in the adapter
schedule, and the reason attached to a compatibility verdict.

A diagnostic also carries the `key` and `params` it was rendered from, so a caller holding
one compile can re-render it in another language without recompiling:

```ts
formatMessage(diagnostic.key, diagnostic.params, 'ja');
```

A reason written by an author in their own `compat` declaration is passed through as
written. Translating what someone else typed is not this library's business.

The command line is the exception to the English default: it reads `LC_ALL`, `LC_MESSAGES`
and then `LANG`, and takes `--lang` to override them. It shipped speaking Japanese, and an
upgrade that silently changed the language of an existing user's output would be a
regression dressed as a feature.

---

## Formatting

```sh
kumihimo fmt studio.khm            # lay it out in place
kumihimo fmt studio.khm --check    # fail if it is not already laid out
kumihimo fmt studio.khm --stdout   # write to stdout instead
```

In VS Code it is the editor's own Format Document, so format-on-save works.

The layout is: indent by nesting, one space between things, and **columns lined up down a
run of similar lines**. That last one is the point — a rack list is read by scanning a
column, and columns drift the moment anybody edits a name.

```khm
device sw "ATEM Mini Extreme" as switcher {
  in  1..8             : sdi
  in  AUDIO_L, AUDIO_R : trs
  out PGM              : sdi  # main
  out STREAM           : lan
}

cam1.SDI -> sw.1       : sdi 30m "V-01"
mic1.OUT -> sw.AUDIO_L : xlr 20m "A-01"
```

A run ends at a blank line, a comment on its own line, or a change of shape, because those
are exactly where a reader stops scanning. Each block's columns are its own, so widening a
name in one device does not reflow another.

Lines are not otherwise rearranged: statements are never joined or split. The one exception
is a block whose braces span lines, which gets them on their own lines — a block written
entirely on one line is left exactly as it was.

```khm
# spans lines, so the braces get their own
adapter hd "HDMI-DVI cable"{in IN:hdmi
out OUT:dvi}

# fits on one line, so it stays on one
device a as mixer { in X : xlr }
```

Comments stay on the line they were written on, and a `#` inside a string stays inside the
string. Formatting never changes what a file says; the tests assert that by comparing the
compiled model before and after, not the text.

`--no-align` gives one space between everything, which diffs more cleanly and reads worse.

---

## 12. Wireless

A radio path is not a cable. There is no length, no connector and nothing to order, so
kumihimo asks for none of those and takes a **frequency or channel** instead.

```khm
mic.RF   -> rx.RF1 : uhf [ch=38]
iemtx.RF -> iem.RF : iem [freq="470.125MHz"]
cam.RF   -> vrx.RF : wireless-video [freq="5.8GHz"]
mixer.WIFI <-> ap.WIFI : wifi [freq="5GHz"]
```

| Syntax     | Meaning        |
| ---------- | -------------- |
| `[freq=…]` | frequency      |
| `[ch=…]`   | channel number |

Frequency is the wireless equivalent of a cable length: the fact needed on site to make the
link work, and the one that causes a clash when two systems share it.

### Drawing

A radio path gets a **broadcast mark** and a long, airy dash. It stays dashed even when its
signal family draws solid — `wireless-video` is video, but over the air it must never read
as a cable.

### Validation

- **Wireless does not connect directly to wired.** A transmitter or receiver is required.
  That is a powered box, so `via` cannot fix it; place it as a **device**.
- **A cable length on a radio path is a diagnostic.** It catches a copy-and-paste.
- **`via` cannot sit on a radio path.** Radio takes no adapters.

```khm
# Wrong: straight into the desk with no receiver
mic.RF -> mixer.CH1 : uhf

# Right: the receiver is a device
device rx "Wireless receiver" as interface {
  in  RF  : uhf
  out CH1 : xlr
}
mic.RF -> rx.RF     : uhf [ch=38]
rx.CH1 -> mixer.CH1 : xlr 3m
```

Declare your own wireless signal with `wireless: true`.

```khm
signal my_radio : audio {
  wireless: true
  label: "House radio"
}
```

---

## 13. Equipment libraries

Rewriting a mixer's sixteen channels in every drawing is not workable. `model` defines a
piece of equipment, `use` imports it, and `device … from` instantiates it.

### `model` — defining equipment

```khm
# lib/yamaha.khm
model dm3 "Yamaha DM3" as mixer {
  in  CH[1..16] : xlr
  out L, R      : xlr
  io  DANTE     : dante
  @vendor "Yamaha"
}
```

A `model` is _equipment that exists in the world_, not a unit in this drawing. It does not
appear until a `device … from` names it.

### `use` — importing a library

```khm
use "./lib/yamaha.khm"
use "./lib/blackmagic.khm"
```

Paths resolve **relative to the file containing the `use`**. Each file is read at most once,
so a diamond costs nothing and a cycle terminates.

`use` imports **`model`, `signal` and `compat` only**. Devices and connections in the
library are not imported, and a diagnostic (`ignored-in-import`) says so — a library
describes equipment, not this drawing's wiring.

Reading files is not part of the core. The caller supplies a resolver, which is how the
same code runs in a browser, a Markdown pipeline and a CLI.

### `device … from` — instantiating

```khm
device mixer from dm3                    # as-is
device mixer2 from dm3 "Spare desk"      # override the label
device mixer3 from dm3 { in AUX : xlr }  # add a port
```

Anything stated on the device wins over the model. Ports are **added rather than replaced**,
so the one unit with an expansion card fitted stays easy to describe.

Declaring a `model` of the same name locally overrides an imported one without editing the
library.

---

## 14. A complete example

```khm
diagram "Broadcast studio" {
  direction: LR
}

group stage "Stage" {
  device cam1 "SONY FX3"   as camera     { out SDI : sdi }
  device cam2 "SONY FX30"  as camera     { out SDI : sdi }
  device mic1 "SM58"       as microphone { out OUT : xlr }
  device mic2 "SM58"       as microphone { out OUT : xlr }
}

group rack "Main rack" {
  device sw "ATEM Mini Extreme" as switcher {
    in  1..8             : sdi
    out PGM              : sdi
    in  AUDIO_L, AUDIO_R : trs
    out STREAM           : lan
    io  CTRL             : lan
  }

  device mixer "Yamaha DM3" as mixer {
    in  CH[1..16] : xlr
    out L, R      : xlr
    io  DANTE     : dante
    @model "DM3 Standard"
  }

  device rec "HyperDeck Studio HD Mini" as recorder { in SDI : sdi }
  device pc  "Streaming PC"             as computer { in LAN : lan }
}

# Video
cam1.SDI -> sw.1 : sdi 30m "V-01"
cam2.SDI -> sw.2 : sdi 30m "V-02"
sw.PGM   -> rec.SDI : sdi 2m "V-10"

# Audio
mic1.OUT -> mixer.CH1 : xlr 20m "A-01"
mic2.OUT -> mixer.CH2 : xlr 20m "A-02"
mixer.(L, R) -> sw.(AUDIO_L, AUDIO_R) : trs 3m

# Stream
sw.STREAM -> pc.LAN : lan 5m "N-01"
```

More, including a file of deliberate faults, in [`examples/`](../examples/).

---

## 15. Out of scope for v0.1

- Rack elevations (`rack R1 42U { 40U: sw 3U }`) and layout by rack unit
- Channel counts carried by one link (64-channel Dante and so on)
- Groups nested more than one level deep
- Automatic cable numbering
