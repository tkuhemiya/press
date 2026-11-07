# Where the padding goes

A struct is not just its fields laid end to end. Each field starts at a multiple of its own size,
so the compiler inserts padding, and the order of the fields decides how much.

```memory-layout id=order title="struct Order, 24 bytes"
order: "Order"
order.paid : bool
order.pad : padding {size=7}
order.id : u64
order.total : u32
order.tail : padding {size=4}

steps:
  order.paid   "A bool takes one byte."
  order.pad    "But id is a u64, so it must start at byte 8: seven bytes are wasted."
  order.tail   "The struct rounds up to a multiple of 8, wasting four more."
```

Moving [the bool](#order.order.paid) to the end packs the same fields into 16 bytes:

```memory-layout id=packed title="struct Order, reordered: 16 bytes"
order: "Order"
order.id : u64 {role=happy}
order.total : u32
order.paid : bool
order.pad : padding {size=3}
```

## A linked list

Pointers are fields that hold an address. Each node points at the next one on the heap, and the
last holds null.

```memory-layout id=list title="A list of two nodes"
group "Stack" {
  head: "head"
}
group "Heap" {
  a: "Node"
  b: "Node"
}
head.ptr : "Node*"
a.value : i64
a.next : "Node*"
b.value : i64
b.next : "Node*" {note=null}

head.ptr -> a
a.next -> b

steps:
  head.ptr -> a   "The stack holds only an address."
  a.next -> b     "Each node finds the next through its own pointer."
  b.next          "The last pointer is null: the end of the list."
```
