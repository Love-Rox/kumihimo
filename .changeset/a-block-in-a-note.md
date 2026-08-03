---
'kumihimo-vscode': minor
---

Draw kumihimo blocks in VS Code's Markdown preview.

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
