---
'@love-rox/kumihimo-core': patch
---

Parsing an unreadable statement with a brace in it no longer hangs.

`rack R1 42U { }` — or `x { 40U: sw }`, or anything else the parser cannot make sense of
that has a `{` in it — never returned. Recovery stops in front of a `}` because a closing
brace belongs to the block it closes, which is right inside one and wrong at the top level,
where there is no block and nobody to consume it. The position never moved, and the loop
went round for ever.

Parsing is documented never to throw. **Hanging is worse than throwing**: a caller cannot
catch it. In the VS Code extension it took the diagnostics and the preview with it, because
both go through here — which is what "it freezes on save, and after a while it stops
redrawing at all" looks like from the outside. Half-written source with an open brace in it
is exactly what an editor sees between keystrokes.

Found while removing a line in the spec that said groups nest one level deep, by checking
whether the things still listed as out of scope really were.
