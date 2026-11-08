# Diffs

A diagram can show a change. Mark each line that changed with `+` if it exists after the change, or `-` if it existed before. Unmarked lines are the same on both sides. On screen, a structural diff is two aligned panels from one layout: Before and After, each a real diagram. Types that edit in place, and print, keep one overlay: added things green, removed things red and dashed, changed things amber with the old value in a note. Overlay labels also start with `+`, `−` or `~`, so a diff still reads in black and white and in the terminal. Every diagram type takes the same marks.

## Order lifecycle, with a fraud check

The fraud check adds a review step between submit and payment. The old payment edge is removed, and a retry now starts again from the cart.

```state-machine id=order-diff title="Order lifecycle: a fraud check before payment"
start -> draft
draft -> submitted : submit
- submitted -> paid : payment ok {role=happy}
+ submitted -> review : needs review
+ review -> paid : approved {role=happy}
+ review -> failed : rejected {role=error}
submitted -> failed : card declined {role=error}
- failed -> submitted : retry
+ failed -> draft : edit cart
failed -> cancelled : give up {role=muted}
paid -> shipped : ship {role=happy}
shipped -> end
cancelled -> end
```

## Checkout, after the cache change

Sessions move from the legacy store to a cache, and the order API is renamed. The write goes to a new database, and the refund path is removed with the legacy store.

```sequence id=checkout-diff title="Checkout, after the cache change"
user: user "Shopper"
web: client "Storefront"
- api: service "Orders API"
+ api: service "Checkout API"
+ db: database "Orders DB"
group "Legacy store" {
  - legacy: database "Old orders table"
}
group "Cache tier" {
  + cache: queue "Cache"
}

phase "Browse" {
  user -> web : browse
  web --> user : catalogue
}
user -> web : open checkout
web -> api : place order {role=focus}
+ api -> cache : check stock
- api -> legacy : write order
+ api -> db : write order
phase confirm "Confirm" {
  + api --> web : order placed {role=happy}
  + web --> user : confirmation
}
phase "Refund path" {
  - api -> legacy : refund
  - legacy --> api : refunded
}
api --> web : error page {role=error}
```

## Checkout architecture, with a queue

Payments move onto a queue and a worker, and the old billing service goes. Adyen was never wired in, so it is dropped from the diagram.

```architecture id=checkout title="Checkout, moving payments to a queue"
user: user "Shopper"
web: client "Storefront"
stripe: external "Stripe"
- stripe2: external "Adyen"

group "VPC" {
  api: service "Orders API"
  db: database "Postgres"
  - legacy: service "Old billing"
  + events: queue "order-events"
  + worker: service "Payment worker"
}

user -> web
web -> api : HTTPS
- api -> stripe : charge
+ api -> events : order.created
+ events -> worker : consume
+ worker -> stripe : charge {role=focus}
api -> db : SQL
- api -> legacy : bill
```

## Inside the online shop, with a cache

The orders API is rewritten and renamed, reads go through a new cache, and orders now go out on a queue instead of a direct write to the warehouse system.

```c4 id=parts-diff title="Inside the online shop, after the rewrite"
customer: person "Customer"
group "Online shop" {
  web: container "Web app" {tech="Next.js"}
  - api: container "Orders API" {tech="Go"}
  + api: container "Orders service" {tech="Rust"}
  db: container "Orders DB" {tech=Postgres}
  + cache: container "Read cache" {tech=Redis}
  + queue: container "Order events" {tech=Kafka}
}
psp: system "Payment processor" {external=yes}
- wms: system "Warehouse system" {external=yes}

customer -> web : Uses
web -> api : JSON/HTTPS
api -> db : Reads and writes
+ api -> cache : Reads
+ api -> queue : Publishes orders
api -> psp : Charges cards
- api -> wms : Sends orders

steps:
  api -> cache      "Hot reads now stop at the cache."
  api -> queue      "Orders are published once, and fulfilment subscribes."
  api -> wms        "The direct call to the warehouse goes away."
```

The [new cache](#parts-diff.cache) takes the read traffic, and the [warehouse call](#parts-diff.api->wms) is gone.

## Checkout data, with a fraud check

A fraud check now sits between validation and the charge, and the card result is logged.

```data-flow id=flow-diff title="Checkout data, with a fraud check"
customer: external "Customer"
psp: external "Payment processor"
group "Our systems" {
  validate: process "Validate cart"
  + fraud: process "Score fraud risk"
  charge: process "Charge card"
  orders: store "Orders"
  + audit: store "Payment log"
}

customer -> validate : Cart
- validate -> charge : Payable order
+ validate -> fraud : Payable order
+ fraud -> charge : Approved order
charge -> psp : Charge request
psp --> charge : Result
charge -> orders : Paid order
+ charge -> audit : Result
```

## Production, across three zones

The replica moves to its own zone, a third zone gets a second replica, and the data volume is replaced by managed storage.

```deployment id=prod-diff title="Checkout in production, three zones" direction=down
cdn: cdn "CDN"
lb: lb "Load balancer"

group "us-east-1" {
  group "Zone a" {
    group "Cluster" {
      n1: node "Node a1"
      api: workload "orders-api" {note="3 replicas"}
      api -> n1 : runs on {role=muted}
    }
    pg: workload "Postgres primary"
    - vol: volume "Data volume"
  }
  group "Zone b" {
    pg_r: workload "Postgres replica"
  }
  group "Zone c" {
    + pg_r2: workload "Postgres replica 2"
  }
}

cdn -> lb : HTTPS
lb -> api : HTTPS
api -> pg : SQL
pg --> pg_r : replicates
+ pg --> pg_r2 : replicates
- pg -> vol : writes {role=muted}
```

## Word of mouth, with ads

The ads change adds a paid-acquisition loop, removes the price effect, and flips the polarity of the saturation link. The saturation loop turns reinforcing as a result.

```causal-loop id=growth title="Word of mouth, with ads"
customers: "Customers"
referrals: "Referrals"
- saturation: "Market saturation"
+ saturation: "Saturated market"
- price: "Price"
+ ads: "Paid ads"

customers -> referrals : +
referrals -> customers : +
customers -> saturation : +
- saturation -> referrals : -
+ saturation -> referrals : +
- price -> customers : - {delay=yes}
- customers -> price : +
+ ads -> customers : +
+ customers -> ads : +

loop wom "Word of mouth": customers -> referrals -> customers
+ loop "Ads reinvest": customers -> ads -> customers
- loop "Price": customers -> price -> customers
loop "Saturation": customers -> saturation -> referrals -> customers
```

## Outage, with a rollback and a recovery

The rollback moves to v2.2 and gains an explicit recovery event. The escalation to the database team is removed, and two of the old events are replaced.

```timeline id=incident title="Outage, 14 March (diff)"
14:02 deploy: "v2.3 rolls out" {until=14:20}
14:05 alerts: "Error rate hits 8%" {role=error}
- 14:10 rollback: "Roll back"
- 14:12 freeze: "Deploys frozen" {until=14:30}
+ 14:16 rollback: "Roll back to v2.2"
14:21 review: "Review the change"
+ 14:24 recovered: "Errors back to baseline" {role=happy}
- 14:33 page: "Page the database team"

group "Impact window" {
  alerts
  + rollback
  + recovered
}

deploy -> alerts : caused
+ alerts -> rollback : prompted
- alerts -> page : escalates
```

## Two servers, with a canary

The canary moves onto Server B, and the old queue lane is retired.

```timeline id=lanes title="Two servers"
lane "Server A" {
  14:02 deploy_a: "Deploy to A" {until=14:20}
  14:09 errors_a: "Errors on A"
}
lane "Server B" {
  + 14:04 canary: "Canary on B"
  + 14:12 wait_b: "Waiting on B" {until=14:18}
}
lane "Old queue" {
  - 14:06 drain: "Drain the old queue"
  - 14:14 retire: "Retire the queue"
}
+ deploy_a -> canary : same build
```

## Should this be cached? (revised)

A freshness question comes before the cost question. Fixing the query is no longer the advice for expensive reads.

```decision-tree id=cache title="Should this be cached? (revised)"
reads: "Read far more than written?"
stale: "Can readers see stale data?"
cost: "Slow or costly to compute?"
+ freshness: "Needs strict freshness?"
cache: "Cache it" {role=happy}
skip: "Don't cache"
- fix: "Fix the query first"

reads -> stale : yes
reads -> skip : no
- stale -> cost : yes
+ stale -> freshness : yes
+ freshness -> skip : yes {role=error}
+ freshness -> cost : no
stale -> skip : no
cost -> cache : yes
- cost --> fix : no
```

## Orders schema change

The change adds vouchers, retires coupons, renames a line item and changes three fields. Everything else is unchanged.

```er id=orders title="Orders, after the schema change"
users: "User"
orders: "Order"
- items: "Line item"
+ items: "Order line"

group "Core" {
  users
  orders
  items
}

group "Promotions" {
  + vouchers: "Voucher"
}

group "Legacy" {
  - coupons: "Coupon"
}

users.id : uuid {key=yes}
users.email : text {unique=yes}
orders.id : uuid {key=yes}
orders.user_id : uuid
- orders.placed_at : timestamp
+ orders.placed_at : timestamptz
- orders.coupon_id : uuid
+ orders.coupon_id : uuid {null=yes}
- orders.legacy_ref : text
+ orders.currency : text
+ orders.voucher_id : uuid {null=yes}
items.order_id : uuid
items.qty : int
- items.sku : text
+ items.price : "numeric(10,2)"
- coupons.id : uuid {key=yes}
- coupons.code : text {unique=yes}
+ vouchers.id : uuid {key=yes}
+ vouchers.code : text {unique=yes}

orders.user_id -> users.id : placed by {card=N:1}
items.order_id -> orders.id : belongs to {card=1..N:1}
- orders.coupon_id -> coupons.id {card=N:0..1}
+ orders.voucher_id -> vouchers.id : used {card=N:0..1}
```

## Session store, revised

Lines marked `+` were added in this revision, lines marked `-` were removed, and unmarked lines are unchanged.

```tradeoffs id=sessions-diff title="Where to keep sessions, revised"
redis: "Redis"
postgres: "Postgres" {role=focus}
- cookie: "Signed cookie"
+ jwt: "Signed token"

latency: "Read latency"
ops: "Running cost"
group "Security" {
  + audit: "Audit trail"
}
group "Retired" {
  - revoke: "Revoke at once"
}

- redis.latency : "<1 ms" {role=happy}
+ redis.latency : "<2 ms" {role=happy}
- redis.ops : "another service" {role=error}
+ redis.ops : "managed service" {note="billed per GB"}
postgres.latency : "~2 ms" {note="p99 on a warm cache"}
postgres.ops : "already running" {role=happy}
- redis.revoke : yes {role=happy}
- postgres.revoke : yes {role=happy}
- cookie.latency : none {role=happy}
- cookie.ops : none {role=happy}
- cookie.revoke : "not before expiry" {role=error}
+ jwt.latency : none {role=happy}
+ jwt.ops : none {role=happy}
+ jwt.audit : no {role=error}
+ redis.audit : yes {role=happy}
+ postgres.audit : "via triggers" {role=happy}
```
