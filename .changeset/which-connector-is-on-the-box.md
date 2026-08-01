---
'@love-rox/kumihimo-core': minor
---

A port can say which connector is on the box, and the cable ends follow.

```khm
device dk "Desk" as mixer   { out CH[1..16] : xlr [connector=XLR-M] }
device sp "SP"   as speaker { in  IN        : xlr [connector=XLR-F] }
```

Gender is a property of the socket, not of the cable. A plug mates with the opposite
gender, so a male output takes a female cable end — which means the cable schedule can be
worked out rather than written. Stated once per socket, every cable reaching that socket
agrees with it; stated per run, two runs can come to disagree about the same socket.

The cable schedule gains a **source end** and a **far end**, filled where the ports said
what they have. `connectors` stays as it was: what the _type_ is terminated with, which
cannot say which end is which.

`xlr` is now marked `gendered`, and it is the only builtin that is. That was a real
ambiguity: its list read `XLR-M / XLR-F` in the same column where `usb` reads
`USB-A / USB-B / USB-C`, and the two meant different things — a pair against a choice.
Saying which is which makes it readable and makes the mate derivable. For a type that is
not a pair, the cable end is the same name rather than an opposite.

A connector the signal type does not list is reported. So is any port attribute other than
`connector`: a run's `[…]` list is kept on the model as free-form extra data, so an unknown
key there survives for whoever wants it, but a port's is not, and a typo would otherwise go
nowhere quietly.

A turnaround is now writable as the thing it is — a barrel with two ends the same gender,
which is exactly why it exists.
