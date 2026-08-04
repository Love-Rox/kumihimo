---
'@love-rox/kumihimo-core': patch
---

`order: fixed` reaches the top level, and stops losing to a wide box.

Every group's contents came out in the order they were written; the groups themselves did
not. Two things were wrong and each hid behind the other.

**The top level was never handed the order.** The positions that carry it were set on each
group's children and on nothing else, so a file whose groups read 演者, ネットワーク,
モニター, 収録機材類 drew them in an order of its own.

**The order was handed over as a distance, not a rank.** One node gap apart — forty-one
pixels — which is nothing beside two groups several hundred pixels wide, so the hints
overlapped and the layout used its own judgement. It is a rank now, spaced wider than any box
can span. Nothing is drawn at those coordinates; the layout replaces them.

**Groups and devices are put back in the order they were typed.** They are held in separate
lists, so building a node's children by concatenating the two put every group before every
device whatever the source said — invisible until `order: fixed` promised otherwise.

Removing either fix fails the new test, which compares only boxes in the same layer: two at
different depths of the flow have no order to disagree about, and comparing them was how the
first version of this check reported a fault that was not there.
