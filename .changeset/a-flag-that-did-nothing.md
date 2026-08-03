---
'@love-rox/kumihimo-core': patch
'@love-rox/kumihimo-cli': patch
---

`-d/--direction` now turns the drawing.

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
