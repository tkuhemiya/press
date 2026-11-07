---
name: verification-map
description: Deeply read a codebase, find the places where correctness matters, and recommend the right verification method for each (types, PBT, fuzzing, contracts, TLA+, proofs, etc.).
---

# Verification Map

Produce a prioritised map of **places** in a codebase and the **verification method** each place should get, with the concrete property to check and a starter snippet. The goal is to spend verification effort where bugs are expensive, using the cheapest technique that can actually see the bug.

A **place** is any unit with its own correctness concern: a pure function or module, an input boundary (decoder, handler, consumer), an API between two services, a multi-step protocol (saga, retry, outbox, leader election), a stateful component (ledger, cache, inventory), a concurrency primitive, an unsafe or native block, or a whole subsystem under faults.

If the user passes an argument (a path, service name or concern like "payments"), focus there but still read enough of the rest to understand context.

## Ground rules

- **Read the code. Don't guess from file names.** Every claim in the report cites `path:line`. If you didn't read it, don't assess it.
- **Understand the problem before the code.** What does this system do, for whom, and what would a bad bug cost (money, data loss, security, privacy, downtime)?
- **Read-only.** Don't modify code or install tools unless the user asks.
- **Prefer the cheapest net that catches the bug.** Order of preference: better design or types first, then static analysis, then tests and verification. Prose rules and human review come last. If a type, a refactor or a lint rule makes a bug impossible, recommend that over a test.
- **Say "don't bother" explicitly.** Plain glue code and CRUD with low blast radius gets example tests or nothing. A useful map says where *not* to spend effort.
- **Formal proof is rare.** Recommend Lean, Dafny, Verus or Kani only for small, stable, pure kernels with a crisp spec and a high cost of failure. Always state how the proof connects to production code.
- **Write the property, not just the technique.** "Add property tests" is useless. Write `sum(split(total, n)) == total and max - min <= 1`.
- **Be honest about what exists.** Credit existing tests and checks accurately, and note where they are weak (asserting only that a value is defined, mocks that can drift, tests an agent could game).

## Process

### 1. Orient: what is this system?

Read, in order: README and docs, architecture notes and ADRs, the build and package manifests, deployment config (docker-compose, Kubernetes manifests, Terraform, serverless config), entry points (main, routers, handlers, consumers, cron jobs), and the data layer (schemas, migrations, ORM models).

Write down:
- The domain and the job the system does.
- Services or modules, and how they talk: HTTP, gRPC, queues, shared database, events. Note delivery guarantees (at-least-once, ordering) where you can find them.
- Data stores and what is stored in each.
- Where untrusted input enters.
- Where money, auth, personal data or irreversible actions are touched.

For large codebases, split exploration across subagents by service or directory if that tool is available, then merge the findings yourself.

### 2. Inventory existing verification

Find and read: test directories and test configs, CI workflows, type-checker and linter configs (and how strict they are), coverage config, contract tests, fuzz targets and corpora, property tests, formal specs (`.tla`, `.als`, `.lean`, `.dfy`), sanitizer or race-detector flags, and chaos or load tests.

Use git history when it's available:
- `git log --since=1.year --name-only` to find churn hotspots.
- `git log -i --grep='fix\|bug\|regress\|hotfix'` to find where bugs have actually happened.

### 3. Enumerate places

Walk the code and list candidate places. For each, record the location, what it does, and its **place type**:

| Place type | Typical locations |
|---|---|
| Pure decision logic | pricing, tax, discounts, permissions, state transitions, scheduling, validation rules |
| Input boundary | request decoders, webhook handlers, queue consumers, file importers, parsers for money, dates and IDs |
| Service-to-service API | HTTP or gRPC clients and their providers, event producers and consumers |
| Multi-step protocol | sagas, compensations, retries, idempotency keys, outbox and inbox, distributed locks, leader election, cache invalidation |
| Stateful component | ledgers, balances, inventory counts, caches, sessions, rate limiters |
| In-process concurrency | shared mutable state, locks, atomics, channels, async task fan-out |
| Unsafe or native code | `unsafe` blocks, FFI, C/C++ extensions, manual memory |
| Serialization | encode and decode pairs, schema migrations, version compatibility |
| Behaviour-preserving change | rewrites, migrations, ports, performance optimisations |
| Whole system under faults | crash recovery, partitions, replication, failover |
| Glue | thin controllers, CRUD, config wiring |

### 4. Score risk

Score each place 1 to 3 on each factor, and give the reasoning:
- **Impact:** what breaks, and for whom, if it's wrong. Money, auth, data loss and privacy score 3.
- **Likelihood:** complexity, branching, arithmetic, concurrency, untrusted input, churn, and bug history.
- **Current coverage:** how much existing checks actually constrain it. Low coverage raises priority.
- **Oracle clarity:** is there a crisp rule for "correct"? High clarity makes stronger techniques cheaper.

Priority is roughly impact × likelihood, raised by weak coverage. Keep only places that matter. Group trivial ones under "don't bother".

### 5. Choose techniques

Use this mapping. A place can get more than one technique. Pick the cheapest one that sees the bug first.

| Situation | Technique | Notes |
|---|---|---|
| An invalid state could be made unrepresentable | **Types or a refactor** | Newtypes, enums for states, parse-don't-validate. Always check this first. |
| Business logic tangled with I/O | **Extract a pure core** | Recommend the refactor first, so the next rows become cheap. |
| Pure logic with a rule that holds across inputs | **Property-based tests** | Use one of these patterns: round trip, conservation, idempotence, oracle or differential, metamorphic, stateful model. |
| Bytes from outside | **Coverage-guided fuzzing** | Pair with a round-trip or no-crash property. Commit the corpus. |
| Two services talk over an API or events | **Consumer-driven contract tests** | Pact or similar. Replaces hand-written mocks. Gate deploys with `can-i-deploy`. |
| Retries, duplicates, ordering, partial failure across steps | **TLA+ or Alloy model** | Model the protocol, not the code. Name the invariants. Keep it under about 150 lines. |
| The same invariant in the running system | **Trace-based tests** | Requires OpenTelemetry. For example, assert exactly one refund span per failed order. |
| No clear spec, but the current behaviour is trusted | **Record and replay or differential testing** | Keploy-style traffic replay, or old vs new implementation. |
| Small, stable, pure, high-stakes kernel | **Proof** | Lean or Dafny via model plus differential tests, or Verus, Kani or Aeneas for Rust. State the bridge to production code. |
| In-process concurrency | **Schedule exploration or race detection** | Loom, Shuttle, `go test -race`, ThreadSanitizer. |
| Unsafe or native memory | **UB detection** | Miri, ASan, UBSan, MSan, plus fuzzing. |
| Whole-system fault tolerance | **Deterministic simulation, Jepsen-style, or chaos** | Usually nightly or pre-release, not per PR. |
| Existing tests look weak, or an agent wrote them | **Mutation testing** | Run on changed lines only, to keep cost down. |
| Glue or CRUD with low impact | **Example tests or nothing** | Say so. |

Pick tools for the actual language:

| Language | Property tests | Fuzzing | Other |
|---|---|---|---|
| Python | Hypothesis | atheris | CrossHair, mutmut |
| TypeScript / JS | fast-check | jazzer.js | Stryker |
| Go | rapid | `go test -fuzz` | `-race`, go-mutesting |
| Rust | proptest | cargo-fuzz | Kani, Verus, Aeneas, Loom, Shuttle, Miri, cargo-mutants |
| Java / Kotlin | jqwik | Jazzer | PIT |
| C / C++ | RapidCheck | libFuzzer, AFL++ | ASan, TSan, UBSan, CBMC, KLEE |
| .NET | FsCheck | SharpFuzz | Stryker.NET |

Cross-language: Pact (contracts), Tracetest (traces), Keploy (record and replay), TLA+ / TLC and Alloy (design models), Lean and Dafny (proofs).

### 6. Write each recommendation

For every place that gets a technique beyond example tests, give:
1. **Place:** name and `path:line` range.
2. **What it does:** one or two sentences.
3. **What can go wrong:** a concrete failure scenario with inputs or an event order, not "edge cases".
4. **Why this technique:** why it sees this bug and cheaper options don't.
5. **The property or invariant:** written out precisely.
6. **Starter snippet:** 5 to 25 lines in the project's language, test framework and conventions, using real function names from the code.
7. **Effort:** hours, days or weeks, plus any prerequisite such as a refactor or OpenTelemetry.
8. **Blind spots:** what this check won't catch, and what covers it instead.

### 7. Check your own work before reporting

- Every cited path and line exists and says what you claim.
- Every snippet uses functions and types that actually exist with those signatures.
- No technique is recommended for a place it can't see (for example, unit property tests can't catch cross-service ordering bugs).
- Each high-impact place has at least one technique that addresses its specific failure scenario.
- The "don't bother" list is real and non-empty for any codebase of meaningful size.

## Report format

Deliver one report in this order. Keep the prose tight. Tables are for scanning; detail goes in the per-place sections.

1. **Summary** (5 to 8 lines): what the system is, the three highest-risk places, and the single most valuable first move.
2. **System map:** services or modules, how they communicate, data stores, trust boundaries. A small diagram (Mermaid or ASCII) if the system has more than three components.
3. **Existing verification:** what's there, what's strong, what's weak.
4. **Priority table:** one row per place, sorted by priority, with columns: Priority, Place, Location, Type, Risk (I/L/C), Technique(s), Effort.
5. **Place details:** the eight-part write-up from step 6, for the top places (about 5 to 15).
6. **Refactors that unlock verification:** for example "extract `computeRefund` from `RefundHandler.handle` so it can be property-tested".
7. **Deliberately not verifying:** places judged low value, each with a one-line reason.
8. **Rollout order:** a numbered sequence, cheapest high-value steps first, with what to run on every save, every PR, nightly, and per design change.
9. **Open questions:** places where the intended behaviour is unclear and a human must decide. Ask instead of inventing a spec.

If the report is long, offer to save it as a document. Otherwise answer in the conversation.
