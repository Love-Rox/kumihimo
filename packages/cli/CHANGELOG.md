# @love-rox/kumihimo-cli

## 0.10.1

### Patch Changes

- Updated dependencies [c5a582b]
  - @love-rox/kumihimo-core@0.10.1

## 0.10.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [60d697b]
- Updated dependencies [49c614d]
- Updated dependencies [3c87357]
  - @love-rox/kumihimo-core@0.10.0

## 0.9.4

### Patch Changes

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

- Updated dependencies [9ffc0e6]
- Updated dependencies [f2fb391]
  - @love-rox/kumihimo-core@0.9.4

## 0.9.3

### Patch Changes

- Updated dependencies [c51f79b]
  - @love-rox/kumihimo-core@0.9.3

## 0.9.2

### Patch Changes

- Updated dependencies [72cf6d8]
- Updated dependencies [72cf6d8]
  - @love-rox/kumihimo-core@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies [d3efacb]
  - @love-rox/kumihimo-core@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [4e3e0fe]
  - @love-rox/kumihimo-core@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [e37020b]
  - @love-rox/kumihimo-core@0.8.1

## 0.8.0

### Patch Changes

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

- Updated dependencies [2b9c557]
- Updated dependencies [6fc570b]
- Updated dependencies [2b9c557]
  - @love-rox/kumihimo-core@0.8.0

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

### Patch Changes

- Updated dependencies [63d760c]
  - @love-rox/kumihimo-core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [2151e49]
- Updated dependencies [2151e49]
- Updated dependencies [2151e49]
  - @love-rox/kumihimo-core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [45a0ff3]
  - @love-rox/kumihimo-core@0.5.0

## 0.4.1

### Patch Changes

- Updated dependencies [53e7d43]
  - @love-rox/kumihimo-core@0.4.1

## 0.4.0

### Minor Changes

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

- Updated dependencies [e86ae97]
- Updated dependencies [e86ae97]
- Updated dependencies [e86ae97]
- Updated dependencies [b008f57]
- Updated dependencies [e86ae97]
  - @love-rox/kumihimo-core@0.4.0

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

### Patch Changes

- Updated dependencies [11156bf]
- Updated dependencies [c0aad3d]
- Updated dependencies [bc376de]
  - @love-rox/kumihimo-core@0.3.0

## 0.2.0

### Minor Changes

- 6c083f6: Add `gap`, which leaves space above the port declaration that follows it, so a strip of
  connectors reads as the blocks it actually is — four HDMI inputs, then a space, then four
  SDI. One `gap` is half a port pitch; `gap <n>` is n of those. It is presentation only: the
  same diagram with every `gap` removed describes the same system.

### Patch Changes

- Updated dependencies [6c083f6]
  - @love-rox/kumihimo-core@0.2.0

## 0.1.1

### Patch Changes

- 16cd85f: Point each package README at kumihimo.love-rox.cc, where the guide and the editor are. npm
  shows a package's own README, so the site was reachable from the repository but not from any
  of the seven pages people actually land on.
- Updated dependencies [16cd85f]
  - @love-rox/kumihimo-core@0.1.1

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

### Patch Changes

- Updated dependencies [c771544]
  - @love-rox/kumihimo-core@0.1.0
