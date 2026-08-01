---
'@love-rox/kumihimo-core': patch
---

The small shells, and a cable column that stopped answering.

Six signal types listed one shell where the gear has several. They are connectors rather
than types on purpose: a lead with a micro end and a full-size end converts nothing, so
typing them would report a mismatch on a camera plugged into a switcher — a connection that
works, and the one thing this validator must never do.

| Type   | Shells                                                     |
| ------ | ---------------------------------------------------------- |
| `hdmi` | `HDMI` / `HDMI Mini` / `HDMI Micro`                        |
| `dp`   | `DisplayPort` / `DisplayPort Mini`                         |
| `usb`  | `USB-A` / `USB-B` / `USB-C` / `USB Micro-B` / `USB Mini-B` |
| `sdi`  | `BNC` / `DIN 1.0/2.3`                                      |
| `midi` | `DIN-5` / `TRS 3.5mm`                                      |
| `xlr`  | `XLR` / `Mini XLR` (TA3) / `Mini XLR-4` (TA4)              |

What it buys is the cable schedule. `HDMI Micro → HDMI` is a lead you either packed or did
not, and so is a TA4 lavalier.

**`mateOf` now stays inside its own pair.** It used to answer "the other entry in the list",
which was the same answer while `xlr` had one pair and the wrong one the moment it had three:
a mini plug asked for a full-size socket, and nobody sells that lead. A gendered type lists
its connectors in pairs, male first in each.

**A value that needs quotes now says so.** `[connector=HDMI Micro]` stopped at the space, read
`Micro` as the next attribute name, and complained that `=` was missing — about a token
nobody meant to write. Most of the names above have a space in them, so this went from an
exotic slip to the ordinary one.

```
error[parse-error]  空白を含む値は引用符で囲みます: `connector="HDMI …"`
```

**The connector column left the page and stayed in the export.** It lists the shells a
_signal_ comes in, so every XLR row carried the same six names while the row already said
XLR — the `SDI sdi` stutter one level up, and it got worse the moment there were shells to
list. The ends this run actually terminates in have their own columns and are the useful
fact. A spreadsheet still gets the full list.
