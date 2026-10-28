# The checkout system, three ways

One diagram cannot say who uses checkout, where card data goes, and where it runs.
This page draws each of those separately: the context, the data flow, and the
deployment.

## Who talks to whom

```c4 id=ctx title="Checkout in context"
customer: person "Customer"
shop: system "Online shop" {role=focus}
psp: system "Payment processor" {external=yes}
mail: system "Email provider" {external=yes}

customer -> shop : Places orders
shop -> psp : Charges cards
shop -> mail : Sends receipts

steps:
  customer -> shop   "A customer places an order in the shop."
  shop -> psp        "The shop never touches card numbers; the processor does."
  shop -> mail       "Receipts go out through a separate provider."
```

The [online shop](#ctx.shop) is the only system we run. Both
[the payment processor](#ctx.psp) and the email provider are outside our control.

```c4 id=parts title="Inside the online shop"
customer: person "Customer"
group "Online shop" {
  web: container "Web app" {tech="Next.js"}
  api: container "Orders API" {tech="Go"}
  db: container "Orders DB" {tech=Postgres}
}
psp: system "Payment processor" {external=yes}

customer -> web : Uses
web -> api : JSON/HTTPS
api -> db : Reads and writes
api -> psp : Charges cards
```

## Where card data goes

The part of checkout that handles money is a small data flow. The trust boundary
matters: everything inside it can see an order, and only the processor sees a card.

```data-flow id=flow title="Checkout data"
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
psp --> charge : Result {role=happy}
charge -> orders : Paid order

steps:
  customer -> validate  "The cart is checked for stock and price before any money moves."
  charge -> psp         "Only a token and an amount leave our systems."
  charge -> orders      "A paid order is stored last, so no order exists without a charge."
```

## Where it runs

```deployment id=prod title="Checkout in production" direction=down
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

steps:
  cdn -> lb      "Static pages come from the CDN; everything else reaches the load balancer."
  lb -> api      "The load balancer spreads requests over three replicas."
  pg --> pg_r    "If zone a fails, the replica in zone b is promoted."
```

The [orders API](#prod.api) runs three replicas in one cluster. The database is the
one thing that spans [two zones](#prod.pg_r).
