# The orders schema

Four tables hold every order the shop has taken. The interesting parts are not the tables
but the references between them: which ones are required, which are optional, and which
side is "many".

```er id=shop title="Orders"
users: "User"
orders: "Order"
items: "Line item"
coupons: "Coupon"

users.id : uuid {key=yes}
users.email : text {unique=yes}
users.created_at : timestamp

orders.id : uuid {key=yes}
orders.user_id : uuid
orders.coupon_id : uuid {null=yes, role=focus}
orders.placed_at : timestamp

items.id : uuid {key=yes}
items.order_id : uuid
items.sku : text
items.qty : int

coupons.id : uuid {key=yes}
coupons.code : text {unique=yes}
coupons.percent_off : int

orders.user_id -> users.id : placed by {card=N:1}
orders.coupon_id -> coupons.id : uses {card=N:0..1, role=focus}
items.order_id -> orders.id : belongs to {card=1..N:1}

steps:
  orders.user_id -> users.id         "Every order is placed by exactly one user; a user can have any number of orders."
  items.order_id -> orders.id        "An order always has at least one line item."
  orders.coupon_id -> coupons.id     "The coupon is optional, which is why its column allows null."
```

The one reference worth a second look is [the coupon](#shop.orders.coupon_id): an order may
have none, so the column is nullable and the crow's foot at [coupons](#shop.coupons) starts
with a ring for "zero".

Before there are any columns, the same model can be sketched with entity-level edges:

```er id=sketch title="Teams, sketched" direction=down
users: "User"
teams: "Team"
projects: "Project"

users -> teams : member of {card=N:N}
teams -> projects : owns {card=1:1..N}
```
