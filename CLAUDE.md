# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

pnpm workspaces monorepo publishing seven scoped npm packages. kumihimo is a text language
for **AV signal flow diagrams (系統図)** — the drawings that say which cable goes from which
connector to which other connector in a video or audio system.

```
packages/core     @love-rox/kumihimo-core     parser, model, validator, layout, SVG, schedules, exporters
packages/cli      @love-rox/kumihimo-cli      build / check / export / watch  (bin: kumihimo, khm)
packages/rehype   @love-rox/kumihimo-rehype   renders code fences in Markdown pipelines
packages/react    @love-rox/kumihimo-react    <Kumihimo> + useKumihimo
packages/vue      @love-rox/kumihimo-vue      <Kumihimo> + useKumihimo
packages/astro    @love-rox/kumihimo-astro    integration + Kumihimo.astro
packages/editor   @love-rox/kumihimo-editor   embeddable live editor
examples/playground                           private Vite harness for the editor
```

Everything depends on `core` via `workspace:*`. New integrations should call `compile()` and
contribute only the host-specific glue — do not re-implement parsing, validation or drawing.

## Common commands

```bash
pnpm install
pnpm build         # tsc across all packages
pnpm test          # vitest run across all packages
pnpm typecheck     # tsc --noEmit
pnpm lint          # oxlint
pnpm format        # oxfmt
pnpm format:check  # CI runs this — a frequent surprise blocker for new files
pnpm check:tsdoc   # typedoc validation (notDocumented + treatWarningsAsErrors)

pnpm --filter @love-rox/kumihimo-core test
pnpm --filter @love-rox/kumihimo-core test -- tests/parser.test.ts
pnpm --filter kumihimo-playground dev    # the editor, standalone, on :5173
```

CI (`.github/workflows/ci.yml`) runs: `lint` → `format:check` → `build` → `check:tsdoc` →
`typecheck` → `test`.

**The playground resolves `@love-rox/kumihimo-editor` to `dist/`, not `src/`.** Editing the
editor and reloading the browser shows nothing until you rebuild that package. This wastes
time every single occasion it is forgotten.

## Architecture

Text → AST → resolved model → layout → SVG, with schedules and exporters hanging off the
model:

- `lexer.ts` / `parser.ts` / `ast.ts` — recursive descent, recovery per statement.
- `loader.ts` — resolves `use` imports. Takes a resolver; owns no I/O.
- `build.ts` / `model.ts` — expands port ranges, invents implicit devices, resolves signal
  types, runs every check.
- `signals.ts` / `compatibility.ts` — what a signal is and what may connect to what.
- `layout.ts` — device and port geometry computed here; ELK does edge routing only.
- `render.ts` / `theme.ts` — SVG.
- `schedule.ts` — cable, equipment and adapter lists.
- `export/drawio.ts` — draw.io XML.

### Invariants (don't break these)

- **Nothing throws.** Every stage collects diagnostics and returns a best-effort result. A
  broken source must still produce a diagram, because that is what makes a live editor
  usable and what lets an author see the fault.
- **`core` touches no filesystem and no DOM.** `use` resolution is injected. The same code
  runs in a browser, a Markdown pipeline and a CLI.
- **Port order carries meaning.** `IN 1` sits above `IN 2` in every render. Port positions
  are computed in `layout.ts` and handed to ELK as `FIXED_POS`; ELK's `FIXED_ORDER` numbers
  ports counter-clockwise from the north-west corner, which would put `IN 1` at the bottom.
- **A link's `: signal` describes the cable, not the ends.** Compatibility is judged
  against the two ports' declared types, and the link's type only fills in for an end that
  declares nothing. Reverse this and the link speaks for both ends, every check compares a
  type against itself, and **no mismatch can ever be detected** — while all the unit tests
  still pass. This was a real bug; see `build.ts`.
- **Every value reaching an SVG attribute is validated or escaped.** `.khm` is untrusted
  input wherever diagrams are built from someone else's source. Colours go through
  `resolveCableColor`; text goes through `escape`. See `SECURITY.md`.
- **Internal imports carry the `.js` extension.** `moduleResolution: "Bundler"` plus the
  `tsc` build both require it.
- **Every export has TSDoc.** `check:tsdoc` enforces `notDocumented`.

### ELK specifics that have already cost time

- **Edges must be attached to the lowest node containing both ends.** Parking every edge on
  the root silently returns _group-relative_ coordinates for links that stay inside one
  group, while cross-group links come back absolute. The mixed result looks plausible and
  is wrong.
- **Spacing options do not inherit into a child graph.** Group nodes need their own
  `elk.spacing.*`, or devices inside a rack end up 22px apart with nowhere to put a cable
  label.

### draw.io specifics

Ports are emitted as **child cells** of their device, and edges attach to the ports. This is
the whole point: flatten them and the export looks identical until someone moves a box.
Port geometry is a _fraction_ of the parent, so it needs far more precision than a pixel
coordinate — rounding it to one decimal collapses a 16-channel mixer into overlapping pairs.

## Domain notes

The faults worth catching are the ones where the cable plugs in perfectly and nothing works:
HDBaseT into an Ethernet switch, analogue RCA into a S/PDIF input, SDI into a genlock
reference. `CONNECTOR_CONFUSIONS` exists as a separate table from `INTERCHANGEABLE_GROUPS`
for exactly this reason, and it is checked _before_ `PASSIVE_ADAPTERS` so a shared connector
is never mistaken for something a cable can bridge.

Passive adapters (a cable) and converters (a powered box) are different things. `via`
declares the former and puts it on the parts list; the latter belongs in the diagram as a
`device … as converter`, and `via` deliberately cannot silence that case.

Wireless is a property of a signal, not a category: wireless video is still video and keeps
its family's colour. What changes is that there is no length, no connector, and no adapter —
and that air does not meet copper without a transmitter.

When editing the signal, compatibility or adapter tables, **record why in a comment**. Facts
like "HDBaseT uses RJ45 but is not Ethernet" are expensive for the next reader to rediscover.

## Release flow (changesets + OIDC)

All seven packages are **fixed-versioned together**. Any changeset bumps all seven.

`.github/workflows/release.yml` opens a Release PR on push to `main`, and publishes via npm
OIDC trusted publishing when no changesets are pending. It uses a GitHub App installation
token so the Release PR triggers required checks.

**Bootstrap caveat:** npm Trusted Publisher cannot be pre-registered for a package that does
not exist yet, so the first publish of each package must be a local `pnpm publish` (not
`npm publish` — that does not rewrite `workspace:*` and ships broken dependencies).

## Tooling

- Lint and format are [Oxc](https://oxc.rs) (`oxlint` + `oxfmt`), not ESLint/Prettier.
- Vitest. `happy-dom` for the packages that render DOM. **`globals: true` is not set**, so
  Testing Library's automatic cleanup is not registered — call `afterEach(cleanup)` in any
  test file that renders more than once.
- `pnpm@10.33.0`, Node 24 in CI. `lib` is ES2023 (`toSorted`).
