# What checkout and billing publish

A class here is how another module talks to this one, not a list of every type
in the package. **Order** is checkout's surface; **Payment** is billing's.
Neighbours call `submit()` and `capture()`. They do not import helpers.

Who may import whom is the [import grid](module-deps.md). Groups here use the
same module names as that grid.

```class id=shop title="What checkout and billing publish"
user: "User"
user.email : String
user.place_order : Order {op=yes}

order: "Order" {role=focus}
order.id : Uuid
order.status : Status
order.total : Money {op=yes}
order.submit : void {op=yes}

item: "LineItem"
item.sku : String
item.qty : Int
item.price : Money

payment: interface "Payment" {role=focus}
payment.capture : void {op=yes}

card: "CardPayment"
card.last4 : String
card.capture : void {op=yes}

user -> order : places
order -> item {rel=contains}
order -> payment : pays with
card -> payment {rel=implements}

group "checkout" {
  user
  order
  item
}
group "billing" {
  payment
  card
}

steps:
  order.submit           "submit() is what a neighbour of checkout calls."
  payment.capture        "capture() is what a neighbour of billing calls."
  order -> item          "Line items live inside an order; they are not a second surface."
```

[submit](#shop.order.submit) is the command. The diamond on **contains** is
ownership. The hollow triangle on **implements** is the payment protocol
billing publishes.
