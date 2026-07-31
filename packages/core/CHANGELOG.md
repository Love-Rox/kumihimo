# @love-rox/kumihimo-core

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
