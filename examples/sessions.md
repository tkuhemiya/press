# Where to keep login sessions

Every web app has to remember who is logged in between requests. There are three usual
places to keep that, and each one is fast or cheap or safe, but not all three. The one
question that usually decides it: when someone's account is compromised, can you log them
out *right now*?

```tradeoffs id=sessions title="Where to keep sessions"
redis: "Redis"
postgres: "Postgres" {role=focus}
cookie: "Signed cookie"

latency: "Read latency"
scale: "Scales out"
ops: "Running cost"
revoke: "Revoke at once"
size: "Session size limit"

group "Operations" {
  ops
  scale
}

redis.latency : "<1 ms" {role=happy}
redis.scale : yes {role=happy}
redis.ops : "another service" {role=error}
redis.revoke : yes {role=happy}
redis.size : none
postgres.latency : "~2 ms"
postgres.scale : "with replicas"
postgres.ops : "already running" {role=happy}
postgres.revoke : yes {role=happy}
postgres.size : none
cookie.latency : none {role=happy}
cookie.scale : "nothing to scale" {role=happy}
cookie.ops : none {role=happy}
cookie.revoke : "not before expiry" {role=error}
cookie.size : "4 KB" {role=error}

steps:
  revoke            "The deciding question: can you log someone out right now?"
  cookie.revoke     "A signed cookie stays valid until it expires, whatever the server knows."
  redis.ops         "Redis revokes at once, but it is one more service to run and watch."
  postgres          "Postgres revokes at once, is fast enough, and is already running."
```

[Signed cookies](#sessions.cookie) win on every cost, which is why they are tempting. But
[revocation](#sessions.revoke) is the row that matters when something goes wrong, and
there a cookie [cannot help](#sessions.cookie.revoke).

When there are many options, `direction=down` lists them down the side instead:

```tradeoffs id=queues title="Picking a queue" direction=down
sqs: "SQS"
kafka: "Kafka" {role=focus}
rabbit: "RabbitMQ"

order: "Ordering"
replay: "Replay old messages"
ops: "Operations"

sqs.order : "FIFO queues only"
sqs.replay : no {role=error}
sqs.ops : managed {role=happy}
kafka.order : "per partition" {role=happy}
kafka.replay : yes {role=happy}
kafka.ops : "heavy" {role=error}
rabbit.order : "per queue"
rabbit.replay : "streams only"
rabbit.ops : moderate
```
