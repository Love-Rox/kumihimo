---
'@love-rox/kumihimo-core': minor
---

A group can hold another group.

A venue holds a stage and a rack; the stage holds the cameras. Both levels are real to
whoever walks the site, and only the innermost one names the place a box is actually
standing in.

```khm
group venue "Hall 3" {
  group stage "Stage" { device cam "FX3" as camera { out SDI : sdi } }
  group rack  "Rack"  { device sw "ATEM" as switcher { in 1 : sdi } }
}
```

The syntax already parsed — nothing reported this as an error. What it did was flatten it:
`Group` had no way to say what it sat inside, so every group came out as a sibling of every
other, and an outer group whose devices were all in child groups came out holding nothing
at all. With nothing to size itself from, it was drawn with no width.

`Group.parent` now says, and the layout builds a tree rather than a row.
