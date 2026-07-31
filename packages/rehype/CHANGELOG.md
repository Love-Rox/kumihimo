# @love-rox/kumihimo-rehype

## 0.1.1

### Patch Changes

- 16cd85f: Point each package README at kumihimo.love-rox.cc, where the guide and the editor are. npm
  shows a package's own README, so the site was reachable from the repository but not from any
  of the seven pages people actually land on.
- Updated dependencies [16cd85f]
  - @love-rox/kumihimo-core@0.1.1

## 0.1.0

### Minor Changes

- c771544: First release.

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

### Patch Changes

- Updated dependencies [c771544]
  - @love-rox/kumihimo-core@0.1.0
