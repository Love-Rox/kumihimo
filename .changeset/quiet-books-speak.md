---
'@love-rox/kumihimo-core': minor
'@love-rox/kumihimo-cli': minor
'@love-rox/kumihimo-rehype': minor
'@love-rox/kumihimo-react': minor
'@love-rox/kumihimo-vue': minor
'@love-rox/kumihimo-astro': minor
'@love-rox/kumihimo-editor': minor
---

Diagnostics are written in English by default, and every entry point takes a `locale`.

The compiler used to answer only in Japanese. The specification is in English and the
packages are published with English READMEs; a library that replies in a language its caller
never asked for has decided who its users are.

`compile`, `parse`, `buildModel`, `loadDocument`, `renderDiagram` and `checkCompatibility`
all accept `{ locale: 'en' | 'ja' }`, and `cableSchedule` / `adapterSchedule` take one as
their second argument. It picks the diagnostics, the legend's signal names, the part names on
the adapter schedule, and the reason attached to a compatibility verdict. A locale the
catalogue does not carry falls back to English rather than to a blank.

A diagnostic now also carries the `key` and `params` it was rendered from, so an editor
holding one compile can re-render it in another language without recompiling:

```ts
formatMessage(diagnostic.key, diagnostic.params, 'ja');
```

`KumihimoEditor` takes a `locale` that drives both its own labels and the compiler's, so a
page cannot end up with tabs in one language and faults in another.

A reason written by an author in their own `compat` declaration is passed through as
written. Translating what someone else typed is not this library's business.

**Breaking in effect, not in type:** anything asserting on a diagnostic's wording now sees
English. Pass `locale: 'ja'` to keep what you had.

The command line is the exception. It reads `LC_ALL`, `LC_MESSAGES` and then `LANG`, and
takes `--lang` to override them — it shipped speaking Japanese, and an upgrade that silently
changed the language of an existing user's output would be a regression dressed as a feature.
