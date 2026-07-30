---
'@love-rox/kumihimo-core': minor
'@love-rox/kumihimo-cli': minor
'@love-rox/kumihimo-rehype': minor
'@love-rox/kumihimo-react': minor
'@love-rox/kumihimo-vue': minor
'@love-rox/kumihimo-astro': minor
'@love-rox/kumihimo-editor': minor
---

First release.

kumihimo writes AV signal flow diagrams (系統図) as text. Unlike a flowchart tool, the unit
of connection is a **port** and the **signal type** on a cable is something the tool
understands, so it can tell you when the drawing is wrong.

- A language with devices, ports, groups, equipment libraries (`model` / `use`), cable
  colours, adapters (`via`) and wireless links carrying frequencies instead of lengths.
- Validation that catches the faults where the cable plugs in perfectly and nothing works:
  HDBaseT into an Ethernet switch, analogue RCA into a S/PDIF input, SDI into a genlock
  reference. Every verdict carries its reason.
- SVG rendering with four themes, including a monochrome one that distinguishes signals by
  line style for drawings that get photocopied.
- Cable, equipment and adapter schedules derived from the same model.
- A CLI, a rehype plugin, React / Vue / Astro adapters, an embeddable live editor, and
  export to editable draw.io files with ports preserved.
