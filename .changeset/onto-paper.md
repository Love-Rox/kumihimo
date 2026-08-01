---
'kumihimo-vscode': minor
---

Four ways to get a drawing out of the editor.

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
