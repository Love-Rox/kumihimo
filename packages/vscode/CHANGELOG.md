# Changelog

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
