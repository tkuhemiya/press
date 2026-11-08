# Split diffs (generated)

## Order lifecycle: a fraud check before payment

### Overlay

```state-machine id=order-diff-overlay title="Order lifecycle: a fraud check before payment"
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

### Before

```state-machine id=order-diff-before title="Order lifecycle: a fraud check before payment (before)"
start -> draft
draft -> submitted : submit
submitted -> paid : payment ok {role=happy}
submitted -> failed : card declined {role=error}
failed -> submitted : retry
failed -> cancelled : give up {role=muted}
paid -> shipped : ship {role=happy}
shipped -> end
cancelled -> end
```

### After

```state-machine id=order-diff-after title="Order lifecycle: a fraud check before payment (after)"
start -> draft
draft -> submitted : submit
submitted -> review : needs review
review -> paid : approved {role=happy}
review -> failed : rejected {role=error}
submitted -> failed : card declined {role=error}
failed -> draft : edit cart
failed -> cancelled : give up {role=muted}
paid -> shipped : ship {role=happy}
shipped -> end
cancelled -> end
```

## Checkout, after the cache change

### Overlay

```sequence id=checkout-diff-overlay title="Checkout, after the cache change"
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

### Before

```sequence id=checkout-diff-before title="Checkout, after the cache change (before)"
user: user "Shopper"
web: client "Storefront"
api: service "Orders API"
group "Legacy store" {
  legacy: database "Old orders table"
}

phase "Browse" {
  user -> web : browse
  web --> user : catalogue
}
user -> web : open checkout
web -> api : place order {role=focus}
api -> legacy : write order
phase "Refund path" {
  api -> legacy : refund
  legacy --> api : refunded
}
api --> web : error page {role=error}
```

### After

```sequence id=checkout-diff-after title="Checkout, after the cache change (after)"
user: user "Shopper"
web: client "Storefront"
api: service "Checkout API"
db: database "Orders DB"
group "Cache tier" {
  cache: queue "Cache"
}

phase "Browse" {
  user -> web : browse
  web --> user : catalogue
}
user -> web : open checkout
web -> api : place order {role=focus}
api -> cache : check stock
api -> db : write order
phase confirm "Confirm" {
  api --> web : order placed {role=happy}
  web --> user : confirmation
}
api --> web : error page {role=error}
```

## Checkout, moving payments to a queue

### Overlay

```architecture id=checkout-overlay title="Checkout, moving payments to a queue"
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

### Before

```architecture id=checkout-before title="Checkout, moving payments to a queue (before)"
user: user "Shopper"
web: client "Storefront"
stripe: external "Stripe"
stripe2: external "Adyen"

group "VPC" {
  api: service "Orders API"
  db: database "Postgres"
  legacy: service "Old billing"
}

user -> web
web -> api : HTTPS
api -> stripe : charge
api -> db : SQL
api -> legacy : bill
```

### After

```architecture id=checkout-after title="Checkout, moving payments to a queue (after)"
user: user "Shopper"
web: client "Storefront"
stripe: external "Stripe"

group "VPC" {
  api: service "Orders API"
  db: database "Postgres"
  events: queue "order-events"
  worker: service "Payment worker"
}

user -> web
web -> api : HTTPS
api -> events : order.created
events -> worker : consume
worker -> stripe : charge {role=focus}
api -> db : SQL
```

## Inside the online shop, after the rewrite

### Overlay

```c4 id=parts-diff-overlay title="Inside the online shop, after the rewrite"
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
```

### Before

```c4 id=parts-diff-before title="Inside the online shop, after the rewrite (before)"
customer: person "Customer"
group "Online shop" {
  web: container "Web app" {tech="Next.js"}
  api: container "Orders API" {tech="Go"}
  db: container "Orders DB" {tech=Postgres}
}
psp: system "Payment processor" {external=yes}
wms: system "Warehouse system" {external=yes}

customer -> web : Uses
web -> api : JSON/HTTPS
api -> db : Reads and writes
api -> psp : Charges cards
api -> wms : Sends orders
```

### After

```c4 id=parts-diff-after title="Inside the online shop, after the rewrite (after)"
customer: person "Customer"
group "Online shop" {
  web: container "Web app" {tech="Next.js"}
  api: container "Orders service" {tech="Rust"}
  db: container "Orders DB" {tech=Postgres}
  cache: container "Read cache" {tech=Redis}
  queue: container "Order events" {tech=Kafka}
}
psp: system "Payment processor" {external=yes}

customer -> web : Uses
web -> api : JSON/HTTPS
api -> db : Reads and writes
api -> cache : Reads
api -> queue : Publishes orders
api -> psp : Charges cards
```

## Checkout data, with a fraud check

### Overlay

```data-flow id=flow-diff-overlay title="Checkout data, with a fraud check"
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

### Before

```data-flow id=flow-diff-before title="Checkout data, with a fraud check (before)"
customer: external "Customer"
psp: external "Payment processor"
group "Our systems" {
  validate: process "Validate cart"
  charge: process "Charge card"
  orders: store "Orders"
}

customer -> validate : Cart
validate -> charge : Payable order
charge -> psp : Charge request
psp --> charge : Result
charge -> orders : Paid order
```

### After

```data-flow id=flow-diff-after title="Checkout data, with a fraud check (after)"
customer: external "Customer"
psp: external "Payment processor"
group "Our systems" {
  validate: process "Validate cart"
  fraud: process "Score fraud risk"
  charge: process "Charge card"
  orders: store "Orders"
  audit: store "Payment log"
}

customer -> validate : Cart
validate -> fraud : Payable order
fraud -> charge : Approved order
charge -> psp : Charge request
psp --> charge : Result
charge -> orders : Paid order
charge -> audit : Result
```

## Checkout in production, three zones

### Overlay

```deployment id=prod-diff-overlay title="Checkout in production, three zones" direction=down
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

### Before

```deployment id=prod-diff-before title="Checkout in production, three zones (before)" direction=down
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
    vol: volume "Data volume"
}
  group "Zone b" {
    pg_r: workload "Postgres replica"
}
}

cdn -> lb : HTTPS
lb -> api : HTTPS
api -> pg : SQL
pg --> pg_r : replicates
pg -> vol : writes {role=muted}
```

### After

```deployment id=prod-diff-after title="Checkout in production, three zones (after)" direction=down
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
}
  group "Zone b" {
    pg_r: workload "Postgres replica"
}
  group "Zone c" {
    pg_r2: workload "Postgres replica 2"
}
}

cdn -> lb : HTTPS
lb -> api : HTTPS
api -> pg : SQL
pg --> pg_r : replicates
pg --> pg_r2 : replicates
```

## Word of mouth, with ads

### Overlay

```causal-loop id=growth-overlay title="Word of mouth, with ads"
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

### Before

```causal-loop id=growth-before title="Word of mouth, with ads (before)"
customers: "Customers"
referrals: "Referrals"
saturation: "Market saturation"
price: "Price"

customers -> referrals : +
referrals -> customers : +
customers -> saturation : +
saturation -> referrals : -
price -> customers : - {delay=yes}
customers -> price : +

loop wom "Word of mouth": customers -> referrals -> customers
loop "Price": customers -> price -> customers
loop "Saturation": customers -> saturation -> referrals -> customers
```

### After

```causal-loop id=growth-after title="Word of mouth, with ads (after)"
customers: "Customers"
referrals: "Referrals"
saturation: "Saturated market"
ads: "Paid ads"

customers -> referrals : +
referrals -> customers : +
customers -> saturation : +
saturation -> referrals : +
ads -> customers : +
customers -> ads : +

loop wom "Word of mouth": customers -> referrals -> customers
loop "Ads reinvest": customers -> ads -> customers
loop "Saturation": customers -> saturation -> referrals -> customers
```

## Outage, 14 March (diff)

### Overlay

```timeline id=incident-overlay title="Outage, 14 March (diff)"
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

### Before

```timeline id=incident-before title="Outage, 14 March (diff) (before)"
14:02 deploy: "v2.3 rolls out" {until=14:20}
14:05 alerts: "Error rate hits 8%" {role=error}
14:10 rollback: "Roll back"
14:12 freeze: "Deploys frozen" {until=14:30}
14:21 review: "Review the change"
14:33 page: "Page the database team"

group "Impact window" {
  alerts
}

deploy -> alerts : caused
alerts -> page : escalates
```

### After

```timeline id=incident-after title="Outage, 14 March (diff) (after)"
14:02 deploy: "v2.3 rolls out" {until=14:20}
14:05 alerts: "Error rate hits 8%" {role=error}
14:16 rollback: "Roll back to v2.2"
14:21 review: "Review the change"
14:24 recovered: "Errors back to baseline" {role=happy}

group "Impact window" {
  alerts
  rollback
  recovered
}

deploy -> alerts : caused
alerts -> rollback : prompted
```

## Two servers

### Overlay

```timeline id=lanes-overlay title="Two servers"
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

### Before

```timeline id=lanes-before title="Two servers (before)"
lane "Server A" {
  14:02 deploy_a: "Deploy to A" {until=14:20}
  14:09 errors_a: "Errors on A"
}
lane "Old queue" {
  14:06 drain: "Drain the old queue"
  14:14 retire: "Retire the queue"
}
```

### After

```timeline id=lanes-after title="Two servers (after)"
lane "Server A" {
  14:02 deploy_a: "Deploy to A" {until=14:20}
  14:09 errors_a: "Errors on A"
}
lane "Server B" {
  14:04 canary: "Canary on B"
  14:12 wait_b: "Waiting on B" {until=14:18}
}
deploy_a -> canary : same build
```

## Should this be cached? (revised)

### Overlay

```decision-tree id=cache-overlay title="Should this be cached? (revised)"
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

### Before

```decision-tree id=cache-before title="Should this be cached? (revised) (before)"
reads: "Read far more than written?"
stale: "Can readers see stale data?"
cost: "Slow or costly to compute?"
cache: "Cache it" {role=happy}
skip: "Don't cache"
fix: "Fix the query first"

reads -> stale : yes
reads -> skip : no
stale -> cost : yes
stale -> skip : no
cost -> cache : yes
cost --> fix : no
```

### After

```decision-tree id=cache-after title="Should this be cached? (revised) (after)"
reads: "Read far more than written?"
stale: "Can readers see stale data?"
cost: "Slow or costly to compute?"
freshness: "Needs strict freshness?"
cache: "Cache it" {role=happy}
skip: "Don't cache"

reads -> stale : yes
reads -> skip : no
stale -> freshness : yes
freshness -> skip : yes {role=error}
freshness -> cost : no
stale -> skip : no
cost -> cache : yes
```

## Orders, after the schema change

### Overlay

```er id=orders-overlay title="Orders, after the schema change"
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

### Before

```er id=orders-before title="Orders, after the schema change (before)"
users: "User"
orders: "Order"
items: "Line item"

group "Core" {
  users
  orders
  items
}

group "Legacy" {
  coupons: "Coupon"
}

users.id : uuid {key=yes}
users.email : text {unique=yes}
orders.id : uuid {key=yes}
orders.user_id : uuid
orders.placed_at : timestamp
orders.coupon_id : uuid
orders.legacy_ref : text
items.order_id : uuid
items.qty : int
items.sku : text
coupons.id : uuid {key=yes}
coupons.code : text {unique=yes}

orders.user_id -> users.id : placed by {card=N:1}
items.order_id -> orders.id : belongs to {card=1..N:1}
orders.coupon_id -> coupons.id {card=N:0..1}
```

### After

```er id=orders-after title="Orders, after the schema change (after)"
users: "User"
orders: "Order"
items: "Order line"

group "Core" {
  users
  orders
  items
}

group "Promotions" {
  vouchers: "Voucher"
}

users.id : uuid {key=yes}
users.email : text {unique=yes}
orders.id : uuid {key=yes}
orders.user_id : uuid
orders.placed_at : timestamptz
orders.coupon_id : uuid {null=yes}
orders.currency : text
orders.voucher_id : uuid {null=yes}
items.order_id : uuid
items.qty : int
items.price : "numeric(10,2)"
vouchers.id : uuid {key=yes}
vouchers.code : text {unique=yes}

orders.user_id -> users.id : placed by {card=N:1}
items.order_id -> orders.id : belongs to {card=1..N:1}
orders.voucher_id -> vouchers.id : used {card=N:0..1}
```

## Where to keep sessions, revised

### Overlay

```tradeoffs id=sessions-diff-overlay title="Where to keep sessions, revised"
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

### Before

```tradeoffs id=sessions-diff-before title="Where to keep sessions, revised (before)"
redis: "Redis"
postgres: "Postgres" {role=focus}
cookie: "Signed cookie"

latency: "Read latency"
ops: "Running cost"
group "Retired" {
  revoke: "Revoke at once"
}

redis.latency : "<1 ms" {role=happy}
redis.ops : "another service" {role=error}
postgres.latency : "~2 ms" {note="p99 on a warm cache"}
postgres.ops : "already running" {role=happy}
redis.revoke : yes {role=happy}
postgres.revoke : yes {role=happy}
cookie.latency : none {role=happy}
cookie.ops : none {role=happy}
cookie.revoke : "not before expiry" {role=error}
```

### After

```tradeoffs id=sessions-diff-after title="Where to keep sessions, revised (after)"
redis: "Redis"
postgres: "Postgres" {role=focus}
jwt: "Signed token"

latency: "Read latency"
ops: "Running cost"
group "Security" {
  audit: "Audit trail"
}

redis.latency : "<2 ms" {role=happy}
redis.ops : "managed service" {note="billed per GB"}
postgres.latency : "~2 ms" {note="p99 on a warm cache"}
postgres.ops : "already running" {role=happy}
jwt.latency : none {role=happy}
jwt.ops : none {role=happy}
jwt.audit : no {role=error}
redis.audit : yes {role=happy}
postgres.audit : "via triggers" {role=happy}
```
