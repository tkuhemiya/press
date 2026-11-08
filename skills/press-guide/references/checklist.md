# What a project guide can cover

Each item answers a question a newcomer asks. **Why** says what the reader loses without it. **Look for** says where it hides in code. **Include when** is the signal that the project has it; the core items are always in. **Show as** is the form that carries it best.

## 1. Why does it exist?

### 1.1 Purpose and users (core)

- **Why:** every later detail is easier to judge once the reader knows the goal. Without it they cannot tell a core feature from a leftover.
- **Look for:** the README, product docs, the names of the main routes and entities, the clients that call it.
- **Show as:** one paragraph, then a `c4` context figure: the people, this system, and the systems around it.

### 1.2 Domain language (core)

The ten to twenty words that mean something specific here: "settlement", "tenant", "run", "lease".

- **Why:** often the biggest barrier, and the one most guides forget. When the code says `Batch` and the team says "a drop", every conversation is a translation.
- **Look for:** type and table names, enums, the words in issue titles, places where code and docs use different names for the same thing.
- **Show as:** a table: term, what it means here, the code name. Note pairs that are easy to confuse.

### 1.3 Key decisions and history

Why it is built this way, and what was tried and dropped.

- **Why:** it stops newcomers from "fixing" a deliberate choice, and it explains code that looks odd.
- **Look for:** ADRs, design docs, large PRs, commit messages, comments that start "we do this because".
- **Include when:** there is a written decision, or an odd shape with a commit that explains it.
- **Show as:** `tradeoffs` for a decision between options, `timeline` for how the system evolved.

## 2. What is it made of, and where does it end?

### 2.1 The map (core)

Five to nine parts: services, workers, queues, stores, and how they connect.

- **Why:** everything else zooms into it. It is the picture the reader keeps in their head.
- **Look for:** clients built at startup, service URLs in config, `docker-compose`, queue and cache clients, packages in a monorepo.
- **Show as:** `architecture`, or `c4` containers.

### 2.2 The edges: every way in and out (core)

Four kinds of way in, not one:

- **Requests:** HTTP and gRPC routes, CLI commands.
- **Events:** queue topics consumed, webhooks received.
- **Time:** cron entries and schedulers.
- **People:** admin panels, manual scripts, direct database edits.

And the ways out: responses, events emitted, calls made, files written, emails and notifications sent.

- **Why:** the edge is the system's contract. It is what other teams depend on and what breaks them when it changes. It is also the full list of ways the system can be made to act, so nothing happens that the reader did not expect.
- **Look for:** the router, consumer registrations, the scheduler, the `bin/` and `scripts/` directories, outgoing HTTP clients, publishers.
- **Show as:** a table in the appendix with every entry; an `architecture` figure with the system as a group and the kinds of traffic crossing it.

### 2.3 Dependencies, upstream and downstream

For each one, more than its name:

- **Hard or soft:** does this system fail when it is down, or degrade?
- **Waits or not:** does a slow dependency make this system slow?
- **Who owns it:** another team, a vendor, or this team.

- **Why:** "depends on Redis" says little. "If Redis is down, logins fail but search still works" is what someone on call needs.
- **Look for:** client construction, timeouts and fallbacks around calls, health checks, circuit breakers.
- **Include when:** it calls anything outside its own process and database.
- **Show as:** `architecture` with the hard dependencies marked, plus a table: dependency, what uses it, what happens when it is down.

### 2.4 Trust boundaries

Where authentication happens, where authorisation is checked, where personal or payment data goes, where secrets come from.

- **Why:** security bugs live where data crosses a line nobody drew.
- **Look for:** auth middleware, permission checks, fields with emails, names, cards or tokens, secret managers, logging of request bodies.
- **Include when:** it handles users, money, personal data, or credentials.
- **Show as:** `data-flow` with the boundaries as groups.

### 2.5 Code map

The modules, the rules about what may import what, and the files a newcomer opens first.

- **Why:** it connects the map of the running system to the files you edit.
- **Look for:** top-level directories, package boundaries, lint rules on imports, a `core` or `domain` package.
- **Show as:** `dependency` when the point is who may import whom. `class`, grouped by those modules, for the types a neighbour calls — that class is the module's interface, not its internals. A table of directories when the layering is not the point.

## 3. What does it remember?

### 3.1 Data model (core)

- **Why:** the data outlives the code. Most behaviour is easier to understand once you know what is stored.
- **Look for:** migrations, ORM models, `schema.prisma`, `CREATE TABLE`, protobuf or JSON schemas for stored documents.
- **Show as:** `er`, one figure for the heart of the model, others for separate areas. Fifteen entities is a ceiling.

### 3.2 Who owns each copy of the data

For each entity: is this system the source of truth, or does it hold a copy (a cache, a replica, a search index, a denormalised field, another service's table)? How does the copy stay current, and how stale can it be?

- **Why:** most "how did these get out of sync" bugs start here, and an `er` figure does not show it.
- **Look for:** caches with TTLs, sync jobs, change-data capture, event handlers that write a local copy, fields copied from another table.
- **Include when:** any data exists in two places.
- **Show as:** `data-flow` from each source of truth to its copies, labelled with what keeps them in step.

### 3.3 Lifecycles (core when there is a state field)

The states each important thing moves through, and what moves it.

- **Why:** a status column is a state machine whether anyone drew it or not, and the bugs sit in transitions nobody expected: refunded, then shipped.
- **Look for:** `status`, `state`, `phase` fields, enums with a `switch` over them, two booleans that must agree, `canX()` guards, every place that writes the field.
- **Show as:** `state-machine`, one per important thing, with the final states and the error paths marked.

### 3.4 Invariants

The rules that must always hold: "a paid order always has a charge id", "a balance never goes negative". For each, where it is enforced: a database constraint, the code, or nowhere.

- **Why:** they are how to reason about correctness. A rule enforced nowhere is a bug waiting.
- **Look for:** unique and foreign keys, check constraints, assertions, validation at write time, tests that name a rule.
- **Include when:** you found one. There almost always is one.
- **Show as:** a table: rule, where it is enforced, what breaks it. Link to the lifecycle figure.

### 3.5 State outside the database

In-memory caches, sessions, files on disk, queue contents, feature flag values, leader election.

- **Why:** this is what vanishes on restart and what differs between replicas.
- **Look for:** module-level maps, local files, `tmp` directories, in-process caches, locks.
- **Include when:** there is any.
- **Show as:** prose and a short table; mark it on the map if it changes how the parts connect.

## 4. What happens when it runs?

### 4.1 The main paths (core)

The three to five requests or events that make up most of the traffic or most of the value, followed end to end. The write path and the read path separately.

- **Why:** a reader who has followed one real request understands the parts far better than one who read about them.
- **Look for:** handlers that await several calls in order, the busiest routes, the flows the tests cover most.
- **Show as:** `sequence` with steps along the path, with the failure branches that matter.

### 4.2 Work on a clock

Cron jobs, workers, retries, TTL expiry, cleanups, reports, reconciliation. For each: what triggers it, what it reads, what it changes, and what happens if it does not run or runs twice.

- **Why:** the hidden half of many systems. Things change "by themselves" at 2am, and a newcomer debugging a row cannot find the code that wrote it.
- **Look for:** crontab, scheduler config, Kubernetes `CronJob`, `setInterval`, worker entry points, TTL settings.
- **Include when:** anything runs without a request.
- **Show as:** a table of jobs; a `timeline` with lanes for a day in the system's life (which jobs run when, which overlap); a `sequence` for any job whose order matters.

### 4.3 Settings that change behaviour

Configuration keys, feature flags, their defaults, and which differ between environments.

- **Why:** they explain "it works on staging", and they are switches a reader might flip.
- **Look for:** config loaders, env var reads, flag checks, per-environment files.
- **Include when:** a setting picks a code path, not just a hostname.
- **Show as:** `decision-tree` for flags that pick a path; a table for the rest.

### 4.4 Concurrency and consistency

Transactions, locks, idempotency keys, ordering guarantees, at-least-once delivery, what two concurrent writes do.

- **Why:** the hardest bugs, and the least visible in code.
- **Look for:** transaction blocks, `SELECT … FOR UPDATE`, unique keys used as locks, dedupe tables, message ordering keys, optimistic version columns.
- **Include when:** two requests or workers can touch the same thing.
- **Show as:** `sequence` or a `timeline` with lanes showing the race and what prevents it.

### 4.5 Where it runs

Environments, regions, replicas, scaling, what is stateful.

- **Look for:** Terraform, Helm, Kubernetes manifests, replica counts, autoscaling rules, health checks.
- **Include when:** there are infra files.
- **Show as:** `deployment`.

### 4.6 Scale and hot spots

Volumes, the hot paths, the known slow parts.

- **Include when:** you have real numbers from config, dashboards or docs. Never estimate one.
- **Show as:** prose.

## 5. What happens when things go wrong?

### 5.1 Failure modes

For each dependency and each step of the main paths: what happens when it is slow, down, or returns garbage.

- **Why:** this is what on call needs, and the code answers it only one `catch` at a time.
- **Look for:** `catch` blocks, fallbacks, error responses, dead-letter queues, compensations.
- **Show as:** the failure branch in the `sequence` for that path; a `decision-tree` for "what happens if"; a table of dependency, symptom, effect.

### 5.2 Load and retries

Retries, backoff, timeouts, rate limits, queues that grow, autoscaling, caches that must warm.

- **Why:** a system that is fine at normal load can make itself worse under stress: retry storms, cold caches, growing queues.
- **Look for:** retry config, backoff, limits, queue depth alarms, autoscaling rules.
- **Include when:** there is any retry or limit.
- **Show as:** `causal-loop`.

### 5.3 How you know it is healthy

Key metrics, logs, alerts, dashboards, SLOs. When an alert fires, where to look first.

- **Look for:** metrics definitions, alert rules, dashboard config, log fields, health endpoints.
- **Include when:** there is any of it. Say so when there is none.
- **Show as:** a table: signal, what it means, where to look.

### 5.4 Recovery

Runbooks, replaying a dead-letter queue, backfills, rollback.

- **Look for:** runbooks, `scripts/` with "replay", "backfill" or "fix" in the name, admin endpoints.
- **Show as:** a table, or a `sequence` for a recovery whose order matters.

## 6. How do people work on it?

### 6.1 The dev loop

Set up, run, test, and fake the dependencies, locally.

- **Why:** the first thing a new engineer does, and the first place they get stuck.
- **Look for:** README setup, `Makefile`, `package.json` scripts, `docker-compose`, seed data, `.env.example`.
- **Show as:** a short list of commands, each with what it does.

### 6.2 Scripts

For each script: what it does, who runs it, how often, and whether it is safe to run twice. Sort them:

- **Recurring and automated:** cron, CI jobs.
- **Recurring and manual:** monthly reports, key rotation.
- **One-off or break-glass:** backfills, data fixes. The dangerous ones; say so.
- **Dev helpers:** codegen, seeding, linters.

- **Why:** scripts are where knowledge hides. A newcomer cannot tell a weekly report from a script that deletes data.
- **Look for:** `scripts/`, `bin/`, `tools/`, `Makefile` targets, `package.json` scripts, CI workflows, runbooks that call them.
- **Include when:** there are any.
- **Show as:** a table in the appendix, grouped as above; a `sequence` for the one script whose order matters.

### 6.3 The path to production

Branch, CI checks, review, deploy, rollout (canary, flag, percentage), rollback.

- **Look for:** CI workflows, deploy config, release scripts, branch protection, changelog tooling.
- **Include when:** there is CI or deploy config.
- **Show as:** `sequence`, or a `timeline` when the stages and their duration matter.

### 6.4 Schema and data changes

How migrations run, in what order relative to the code deploy, and whether they must be backward compatible.

- **Why:** a migration that runs before the code that needs it, or after the code that drops the old column, is an outage.
- **Look for:** migration tooling, deploy hooks, comments about expand and contract.
- **Include when:** there are migrations.
- **Show as:** a `sequence` of deploy order.

### 6.5 Testing

What unit, integration and end-to-end tests cover, what is not covered at all, which tests are slow or flaky.

- **Show as:** prose and a short table.

### 6.6 Conventions

Error handling, naming, where new code goes, the unwritten rules a reviewer will flag.

- **Look for:** lint config, `CONTRIBUTING`, review comments, patterns repeated across modules.
- **Show as:** a short list.

### 6.7 Owners

Who owns which part, who is on call, which teams to talk to.

- **Look for:** `CODEOWNERS`, on-call config, team names in docs.
- **Include when:** there is any record of it. Never guess a person.
- **Show as:** a table.
