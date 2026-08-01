---
'@love-rox/kumihimo-core': minor
'@love-rox/kumihimo-cli': patch
'@love-rox/kumihimo-editor': patch
'kumihimo-vscode': patch
---

One place that knows what the schedules are called.

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
