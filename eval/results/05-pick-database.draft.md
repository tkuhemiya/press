# Postgres, MongoDB or DynamoDB for a small SaaS app

Short answer: **start with Postgres** unless you already know one of the specific reasons below
applies to you. A typical SaaS app is relational at heart (accounts have users, users have
projects, projects have invoices) and its query patterns change every month while you find
product fit. Postgres is the option that handles both of those well and still has room for the
unstructured bits.

## How they compare

```tradeoffs id=dbs title="Three databases for a small SaaS"
pg: "Postgres" {role=focus}
mongo: "MongoDB"
dynamo: "DynamoDB"
group "Data model" {
  pg.model : "relational + JSONB" {role=happy}
  mongo.model : documents
  dynamo.model : "key-value, single table"
  pg.joins : "native joins" {role=happy}
  mongo.joins : "$lookup, limited"
  dynamo.joins : none {role=error}
  pg.adhoc : "any SQL" {role=happy}
  mongo.adhoc : "good, needs indexes"
  dynamo.adhoc : "plan access patterns up front" {role=error}
}
group "Correctness" {
  pg.tx : "full ACID" {role=happy}
  mongo.tx : "multi-doc since 4.0"
  dynamo.tx : "limited, 100 items"
  pg.schema : "enforced, migrations"
  mongo.schema : "flexible, optional validation"
  dynamo.schema : "only keys enforced"
}
group "Operations" {
  pg.ops : "managed: RDS, Neon, Supabase"
  mongo.ops : "managed: Atlas"
  dynamo.ops : "fully serverless" {role=happy}
  pg.scale : "vertical, then read replicas"
  mongo.scale : "built-in sharding" {role=happy}
  dynamo.scale : "near-unlimited" {role=happy}
  pg.lockin : "none, runs anywhere" {role=happy}
  mongo.lockin : "low"
  dynamo.lockin : "AWS only" {role=error}
}
```

## Why Postgres fits a small SaaS

The main risk for a young product isn't scale; it's that you don't yet know what questions you'll
ask of your data. Next quarter someone will want "accounts on the Pro plan with more than five
inactive users, grouped by signup month". In [Postgres](#dbs.pg) that is one SQL query. In
[DynamoDB](#dbs.dynamo) it's a new index or an export to another system, because DynamoDB makes
you design tables around access patterns you know in advance. That's a superb trade at large,
predictable scale and a poor one while you're still discovering the product.

Multi-tenant SaaS data is also full of relationships and invariants: a seat belongs to exactly
one subscription, an invoice line references a price that must exist. Foreign keys and
transactions enforce those in the database, rather than in application code that someone will
eventually forget to update.

The usual argument for a document store, that your data doesn't have a fixed shape, is answered
by `JSONB` columns: keep the relational core in tables and put per-customer settings or webhook
payloads in an indexed JSON column. And Postgres is boring in the best sense. Every ORM supports
it, every host offers it, and extensions like `pgvector` and full-text search cover needs you'd
otherwise add a second system for.

On scale: a single modern Postgres instance comfortably serves thousands of tenants. By the time
you outgrow it, you'll have the revenue and the knowledge of your access patterns to decide what
to move.

## When the others win

```decision-tree id=pick title="Which one?"
aws: "All-in on AWS serverless, access patterns well known?"
shape: "Data mostly self-contained documents with varying shape?"
team: "Team already expert in MongoDB?"
dynamo: "DynamoDB"
mongo: "MongoDB"
pg: "Postgres" {role=happy}
aws -> dynamo : yes
aws -> shape : no
shape -> team : yes
shape -> pg : no
team -> mongo : yes
team -> pg : no
```

**Pick [MongoDB](#dbs.mongo)** when your core entities really are self-contained documents read
and written whole (a CMS, a product catalogue with wildly varying attributes, event payloads) and
your team already knows it well. Atlas is a good managed service and horizontal sharding is
built in.

**Pick DynamoDB** when you're committed to AWS Lambda and want zero database operations, pay per
request, and your access patterns are few and stable (a session store, a high-volume event log,
a per-user key-value lookup). Its cost and latency stay flat from ten requests to ten million,
which no other option here matches. Just budget time to learn single-table design; teams who
treat it like a relational database get burned.

It's also common to end up with Postgres as the system of record and DynamoDB or Redis next to it
for one hot, simple workload. That's a fine place to arrive at, but not a reason to start there.
