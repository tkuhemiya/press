# Authoring eval prompts

Each prompt is a request a reader might make of an AI. An agent answers it as a Press
document, using only `skills/press/SKILL.md`. Several prompts are chosen because no current
diagram type fits them well: finding those gaps is part of the point.

| # | Slug | Prompt | Likely fit |
|---|---|---|---|
| 01 | tls-handshake | Explain what happens during a TLS 1.3 handshake, and why it needs only one round trip. | sequence |
| 02 | git-rebase | Explain the difference between `git merge` and `git rebase`, and when to use each. | ? (no commit-graph type) |
| 03 | k8s-deploy | Explain what happens inside Kubernetes when you run `kubectl apply` on a Deployment. | sequence, architecture |
| 04 | circuit-breaker | Explain how a circuit breaker protects a service, with its states. | state-machine |
| 05 | pick-database | We're building a small SaaS app. Should we use Postgres, MongoDB or DynamoDB? | tradeoffs |
| 06 | slack-schema | Sketch a data model for a Slack-like chat app: workspaces, channels, messages, threads. | er |
| 07 | http-request | What happens when you type a URL into a browser and press enter? | sequence, architecture |
| 08 | backprop | Explain how backpropagation computes gradients in a small neural network. | ? (no compute-graph type) |
| 09 | inflation-spiral | Explain how a wage-price spiral works and what central banks do about it. | causal-loop |
| 10 | price-ceiling | Explain what happens when a government puts a price ceiling on rent. | ? (no supply-demand type) |
| 11 | apollo-11 | Walk through the Apollo 11 mission from launch to splashdown. | timeline |
| 12 | photosynthesis | Explain how photosynthesis turns light into sugar. | ? (no pathway or cycle type) |
| 13 | false-sharing | Explain false sharing between CPU cores and how to avoid it. | ? (no memory-layout type) |
| 14 | remote-work | Lay out the strongest arguments for and against fully remote work. | ? (no argument-map type) |
| 15 | incident-triage | We get paged for high latency. How should the on-call engineer triage it? | decision-tree |
| 16 | oauth-pkce | Explain the OAuth authorization code flow with PKCE, and what PKCE protects against. | sequence |
| 17 | thermostat | Explain how a thermostat keeps a room at a set temperature, and why it overshoots. | causal-loop, ? (block diagram) |
| 18 | event-loop | Explain the JavaScript event loop: call stack, task queue and microtasks. | ? (no call-stack type) |
| 19 | raft-election | Explain how Raft elects a leader. | state-machine, sequence |
| 20 | choose-license | Help me pick an open-source license for a library I'm releasing. | decision-tree, tradeoffs |
