---
'kumihimo-vscode': minor
---

Two ways to get a drawing out of the editor.

_kumihimo: Print the diagram and schedules_ lays the drawing and every non-empty schedule
out for A4 landscape and opens it in the default browser, where **Save as PDF** lives in
the print dialog. Each schedule starts its own sheet: the person holding the cable list is
not the person holding the equipment list, and they should be able to hold one each. Rows
do not split across a page break, and the header repeats on every sheet.

_kumihimo: Export the diagram as SVG_ writes the drawing on its own.

**There is no PNG, deliberately.** The preview runs with scripts disabled — the drawing is
compiled from a file that arrived with somebody else's repository, and putting it in an
`<img>` rather than an inline `<svg>` removes the whole class of script-in-an-image rather
than filtering it. A PNG needs a canvas, a canvas needs a scripted webview, and that would
be giving the guarantee back for something the print page already does as vector.

Nor is the PDF produced here. That would mean a PDF library and a CJK font to embed —
measured, about 15 MB added to an extension whose only dependency today is the compiler,
and the fonts that would do the job are not ones anybody may redistribute. The browser has
both already, and it knows what paper you are using.
