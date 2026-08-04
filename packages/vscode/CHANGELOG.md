# Changelog

## 0.9.4

### Patch Changes

- Updated dependencies [8c11552]
  - @love-rox/kumihimo-core@0.11.1

## 0.9.3

### Patch Changes

- 497aa86: A diagram in a Markdown Preview Enhanced note, and `--quiet` to make it possible.

  MPE is not VS Code's Markdown preview: it reads none of the extension's contributions, so a
  ` ```kumihimo ` block stays a code block there and says nothing about why. It offers one door
  to everybody — a code chunk that runs a command — and now that door works.

  ````markdown
  ```kumihimo {cmd="kumihimo" args=["-", "--stdout", "--quiet"] stdin=true output="html"}

  ```
  ````

  `--quiet` is not decoration. MPE **concatenates standard error into the output**, so a clean
  run's `✓ 問題は見つかりませんでした` would land in the page beside the drawing. Read out of
  MPE's own bundle rather than guessed, along with how the block reaches the command:
  `stdin=true` writes it to standard input, `$input_file` in `args` is replaced with a
  temporary path, and neither appends the path as the last argument.

  `stdin=true` is the one documented, because MPE runs the command in the document's own
  directory — so a `use` of a file beside the note resolves the way it reads, where a temporary
  file would not.

  A smoke test drives the command exactly as MPE drives it, including concatenating both
  streams, and asserts the output is an SVG and nothing else. One of its five checks asserts
  that _without_ `--quiet` the report does come along, so the flag cannot quietly stop being
  needed without somebody noticing.

  - @love-rox/kumihimo-core@0.11.0

## 0.9.2

### Patch Changes

- Updated dependencies [c5a582b]
  - @love-rox/kumihimo-core@0.10.1

## 0.9.1

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

- Updated dependencies [60d697b]
- Updated dependencies [49c614d]
- Updated dependencies [3c87357]
  - @love-rox/kumihimo-core@0.10.0

## 0.9.0

### Minor Changes

- 0116891: Draw kumihimo blocks in VS Code's Markdown preview.

  A ` ```kumihimo ` fence in a `.md` file stayed a code block. It works in Obsidian and on the
  web and it never worked here — not a regression, an absence, and the kind that only shows up
  when somebody writes the note.

  It runs in the preview's webview rather than in the extension host, because that is the only
  place it can. VS Code renders Markdown through markdown-it, and markdown-it answers in one
  turn; `compile` cannot, because the layout engine returns a promise. So the fence is left
  alone at render time and turned into a drawing once the preview has it in the DOM.

  That means a second bundle, and the whole compiler in it — 1.5 MB for a preview. It is the
  same trade the Obsidian plugin makes for the same reason: the alternative is a second
  renderer that agrees with the first until it does not.

  - ` ```khm ` opens one too, the same as everywhere else.
  - The schedules come folded up underneath; faults are listed beside the drawing.
  - The theme follows the preview's own light or dark, and high contrast gets `mono` — a
    request to stop relying on colour, answered by the theme that tells signals apart by line
    style. A `diagram { theme: … }` in the block still wins.
  - The SVG is parsed and imported rather than assigned as HTML, so what lands in the webview
    is an SVG and only an SVG.

## 0.8.4

### Patch Changes

- Updated dependencies [9ffc0e6]
- Updated dependencies [f2fb391]
  - @love-rox/kumihimo-core@0.9.4

## 0.8.3

### Patch Changes

- Updated dependencies [c51f79b]
  - @love-rox/kumihimo-core@0.9.3

## 0.8.2

### Patch Changes

- Updated dependencies [72cf6d8]
- Updated dependencies [72cf6d8]
  - @love-rox/kumihimo-core@0.9.2

## 0.8.1

### Patch Changes

- Updated dependencies [d3efacb]
  - @love-rox/kumihimo-core@0.9.1

## 0.8.0

### Minor Changes

- 4e3e0fe: A trace log, and a preview that cannot wedge itself shut.

  A freeze on save was reported that could not be reproduced here — compilation is 0.3 ms for
  diagnostics and about 10 ms for a whole render, and repeating it a hundred times leaks
  neither memory nor handles. The honest answer to "what should I look at" was four places to
  hunt by hand, which is not an answer.

  `kumihimo.trace`, and **kumihimo: Show the trace log** to turn it on and open it. Each
  redraw writes what it cost, split into compiling, building the markup, and handing that
  markup to the editor — the last of which is the editor's cost rather than ours, and the one
  worth knowing about when a save feels slow.

  The other half of the report was that it eventually stops redrawing altogether. A render
  holds a flag that stops a second one starting beside it, and that flag is cleared in a
  `finally` — so it can only stick if the work never settles at all. Now it cannot stick: a
  render is abandoned after fifteen seconds, the log says so, and the next keystroke draws.

  Nothing here is expected to take fifteen seconds. If the log ever shows that line, it is
  the evidence the report needed.

### Patch Changes

- Updated dependencies [4e3e0fe]
  - @love-rox/kumihimo-core@0.9.0

## 0.7.1

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

- Updated dependencies [e37020b]
  - @love-rox/kumihimo-core@0.8.1

## 0.7.0

### Minor Changes

- 8297a61: Four ways to get a drawing out of the editor.

  **Print the diagram and schedules** lays the drawing and every non-empty schedule out for
  A4 landscape and opens it in the default browser, where Save as PDF lives in the print
  dialog. Each schedule starts its own sheet: the person holding the cable list is not the
  person holding the equipment list, and they should be able to hold one each. Rows do not
  split across a page break, the header repeats, and the drawing's height is bounded in `mm`
  rather than `vh` — a printer has no viewport, and a tall drawing would otherwise have run
  off the bottom of the sheet.

  **Export the diagram as SVG**, and **as PNG** at twice its own size, on white rather than
  transparent: a drawing dropped into a dark document with a transparent background loses
  every black line in it. Only the drawing — the schedules are text, and text belongs
  somewhere it stays selectable.

  **Export the schedules as Markdown**, which is what a schedule gets pasted into more often
  than anything else. Every column the registry carries rather than the handful the sidebar
  shows, minus the ones empty in every row; an id that only repeats the name it follows is
  dropped, because `SDI sdi` is a stutter while `SONY FX3 cam1` is not.

  The preview now runs with scripts enabled, under a nonce. What kept somebody else's
  drawing from running there was never that flag — it is that the SVG sits in an `<img>`,
  which a browser refuses to run script in whatever else the page may do. The smoke test used
  to assert the page had no script at all; it now asserts the thing that actually mattered,
  and asserts it more precisely: the drawing is never inlined as `<svg>`, every script tag
  carries the CSP's nonce, and switching tabs still costs no script.

  Producing the PDF here was considered and rejected: a PDF library plus a CJK font to embed
  is about 15 MB measured, onto an extension whose only dependency today is the compiler, and
  the fonts that would do the job are not ones anybody may redistribute.

## 0.6.1

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

## 0.6.0

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

## 0.5.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [2151e49]
- Updated dependencies [2151e49]
- Updated dependencies [2151e49]
  - @love-rox/kumihimo-core@0.6.0

## 0.4.4

- The completions know `over`, which says what a signal is riding on — `ndi over wifi`,
  `dante over lan`. The signal types offered after it are the same list as anywhere else,
  read from the compiler.
- Diagnostics follow: a channel written on a cabled run is now reported, where before it
  was read by nothing and said nothing.

### Patch Changes

- Updated dependencies [45a0ff3]
  - @love-rox/kumihimo-core@0.5.0

## 0.4.3

### Patch Changes

- Updated dependencies [53e7d43]
  - @love-rox/kumihimo-core@0.4.1

## 0.4.2

- **Format Document.** `⇧⌥F`, or format on save. Indents by nesting, normalises spacing,
  and lines the columns up down a run of ports or connections. Before this, `.khm` was a
  language the editor offered to format and then could not, which sends people to the
  Marketplace to look for a formatter that is not there. Alignment can be turned off with
  `kumihimo.format.align`.
- The completions know `adapter`, and the two new device kinds `transmitter` and
  `receiver` — read from the compiler, so there was nothing to update here.

  Note that the 0.4.1 `.vsix` attached to its GitHub release predates the formatter: it
  was built when the preview fix landed, and the formatter arrived afterwards without a
  version of its own. This is the first build that has both.

### Patch Changes

- Updated dependencies [e86ae97]
- Updated dependencies [e86ae97]
- Updated dependencies [e86ae97]
- Updated dependencies [b008f57]
- Updated dependencies [e86ae97]
  - @love-rox/kumihimo-core@0.4.0

## 0.4.1

- The preview no longer rebuilds itself on every keystroke. Assigning a webview's `html`
  reloads it — the document torn down, the markup parsed again, a base64 data URI of the
  whole drawing decoded again — and that was happening four times a second while typing,
  at around 130 kB for a job-sized diagram. It now waits for typing to settle
  (`kumihimo.preview.delay`, 600 ms), skips the write entirely when the drawing has not
  changed, and does not draw into a tab nobody is looking at.
- `retainContextWhenHidden` is gone. The editor's own documentation warns it is
  memory-expensive, and it bought nothing here.
- Renders no longer overlap, so a slow one can no longer finish last and leave stale
  wiring on screen.

## 0.4.0

- Follows VS Code's display language. The extension's own words already did; the compiler's
  sentences did not, and a panel labelled in one language listing faults in another is worse
  than either language alone. English and Japanese are carried; anything else gets English.
- The schedule tables name their parts in the same language as the diagnostics above them.

### Patch Changes

- Updated dependencies [11156bf]
- Updated dependencies [c0aad3d]
- Updated dependencies [bc376de]
  - @love-rox/kumihimo-core@0.3.0

## 0.3.0

- The preview switches between the diagram and the three schedules — cables, equipment and
  adapters — from the same functions the CLI exports and the site shows. Tabs are radio
  inputs and sibling selectors, so the panel keeps running with scripts disabled.
- Localised properly. Strings were bilingual-in-one-line before, which reads as noise in
  either language; the manifest now uses `package.nls` keys and the runtime uses
  `vscode.l10n`, with English as the source and Japanese alongside.

## 0.2.0

- Completions, read from the compiler rather than from a list kept beside it. Signal types
  after `:` and `|`, device kinds after `as`, jacket colours inside `[color=`, themes and
  directions in a `diagram` block, port keywords inside a body, declarations at the top
  level. A type added to the language is offered with nothing to update here.
- Signal types show their connectors, which is how `trs` and `trs35` are told apart.

## 0.1.0

First release. Built against kumihimo 0.2.0.

- Diagnostics while you type, from the compiler itself. Not only syntax: every connection
  is judged on whether it can physically work, and each verdict carries its reason and a
  link to the rule.
- Live preview beside the source (`⌘K V` / `Ctrl+K V`), redrawn as you type and following
  the editor's colour theme unless the source names one.
- Syntax highlighting, bracket matching and comment handling for `.khm`.
