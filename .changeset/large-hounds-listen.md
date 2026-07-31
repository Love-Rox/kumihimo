---
'@love-rox/kumihimo-core': minor
'@love-rox/kumihimo-cli': minor
'@love-rox/kumihimo-rehype': minor
'@love-rox/kumihimo-react': minor
'@love-rox/kumihimo-vue': minor
'@love-rox/kumihimo-astro': minor
'@love-rox/kumihimo-editor': minor
---

Jack types now carry their barrel size. `trs` was one type listing two connectors, 1/4" and
3.5mm, which could never answer the question a drawing is for — whether the plug goes in.
There are now `trs`, `trs35`, `trrs` and `trrs35`, under one rule: a bare name is 1/4", a
`35` suffix is 3.5mm.

Same signal at a different barrel asks for the 3.5mm-to-6.3mm adapter and names it, so `via`
puts it on the parts list. Same barrel at a different pole count is reported as lossy: the
plug seats, and a four-pole plug in a three-pole jack passes audio while dropping the
microphone.

The split also removes a claim that was never true. `xlr` and `trs` are interchangeable
because an XLR-to-1/4" cable is a stock item; that used to apply to 3.5mm as well, because
one type stood for both sizes. It no longer does.

`trs` now means 1/4" only. A diagram using it for a 3.5mm jack should say `trs35`.
