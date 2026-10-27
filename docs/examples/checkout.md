# How checkout works

An order moves through a small number of states, and most bugs in checkout come from
forgetting one of the transitions between them. This page walks through the lifecycle
first, then the messages that drive it.

## The order lifecycle

```state-machine id=order title="Order lifecycle"
start -> draft
draft -> submitted : submit
submitted -> paid : payment ok {role=happy}
submitted -> failed : card declined {role=error}
failed -> submitted : retry
failed -> cancelled : give up {role=muted}
paid -> shipped : ship {role=happy}
shipped -> end
cancelled -> end

steps:
  draft                  "Every order starts as a draft while the cart is open."
  draft -> submitted     "Pressing **Pay** submits the order and freezes the cart."
  submitted -> failed    "The bank declines the card."
  failed -> submitted    "The customer retries with another card; the same order is reused."
  submitted -> paid      "This time the payment clears."
  paid -> shipped        "Fulfilment picks it up and ships it."
```

The important detail is that a declined card does not create a new order. It moves the
order to [the failed state](#order.failed), and a retry goes back to
[submitted](#order.submitted) with the same id. Only an explicit give-up reaches
[cancelled](#order.cancelled).

## What happens when the customer pays

```sequence id=pay title="Paying for an order"
browser: user "Browser"
api: service "Orders API"
payments: external "Payment provider"
db: database "Orders DB"
queue: queue "Events"

browser -> api : POST /orders/42/pay
api -> db : mark submitted
api -> payments : charge card
payments --> api : approved {role=happy}
api -> db : mark paid
api --> queue : order.paid
api --> browser : 200 OK

steps:
  browser -> api       "The browser asks the API to pay for order 42."
  api -> db : mark submitted "The order is marked submitted **before** charging, so a crash cannot double-charge."
  api -> payments      "The API charges the card through the provider."
  payments -> api      "The provider approves the charge."
  api -> db : mark paid "Only now does the order become paid."
  api -> queue         "Fulfilment hears about it through an event, not a direct call."
```

The [payment provider](#pay.payments) is the only external system in the flow, which is
why its call sits between two writes to the [orders database](#pay.db).
