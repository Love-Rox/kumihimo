# Changelog

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
