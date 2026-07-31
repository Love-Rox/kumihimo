---
'@love-rox/kumihimo-core': minor
'@love-rox/kumihimo-cli': minor
'@love-rox/kumihimo-rehype': minor
'@love-rox/kumihimo-react': minor
'@love-rox/kumihimo-vue': minor
'@love-rox/kumihimo-astro': minor
'@love-rox/kumihimo-editor': minor
---

A port can now declare more than one signal type, written `xlr | trs`, for a connector that
takes more than one kind of plug — a combo jack receiving either an XLR or a 1/4" plug. The
first type is what the port is drawn and reported as; the signal named on a connection says
which one that cable is using, and that is the one judged.

Adds `usbpd` for power over USB-C. It is its own type in the power category for the same
reason `poe` is one, and wires freely with `usb` the way `poe` does with `lan`.

`PortDecl.signal` is now `PortDecl.signals`, and `Port` gained `accepts`.
