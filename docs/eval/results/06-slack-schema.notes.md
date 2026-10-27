# 06 slack-schema — notes

## Types used and why
- `er` (id=chat): the prompt is a data model; tables, fields and references are exactly what er draws. One diagram covers workspaces, users, memberships, channels, channel_members, messages (with a self-reference for threads) and reactions.

## Checker rounds
- Round 1 (first draft copied as-is): 0 errors, 0 warnings. Clean on first try.
  The self-referencing edge `messages.parent_id -> messages.id {card=N:0..1}` and three-column composite keys (`{key=yes}` on several fields) were accepted.

## Wanted but couldn't express
- **Nullability / constraints on a field.** `messages.parent_id` is nullable, and threads must be one level deep (a reply's parent must have a null parent_id). The `0..1` cardinality hints at optionality but there is no way to mark a field nullable, unique, or attach a constraint/check note. Put it in prose.
- **Marking a denormalized / derived field.** `reply_count` is a cache of a count; I wanted to flag it (e.g. a `note` or role meaning "derived"). SKILL.md mentions `note` for nodes but not whether properties accept it, so I left it in prose.
- **Highlighting the key design idea.** I wanted `role=focus` on the self-reference (threads are messages) but SKILL.md doesn't say whether er edges or fields accept roles; I didn't risk it.
- **Enum-valued types.** I wrote `"owner | admin | member | guest"` as the type string; there is no enum notion, so it is just a quoted label.
- **Tenant boundary / partitioning.** I wanted to show that everything hangs off a workspace and that messages are partitioned by channel. No grouping semantics for er documented; prose only.
- No steps: I didn't know whether er supports `steps:` (and what a step would select — a table? an edge?), so I explained it with per-table prose sections and links instead.

## Skill gaps
- Doesn't say whether er supports `steps`, `role`, `note`, or `group`.
- Doesn't say whether linking to a table (`#chat.users`) vs a field (`#chat.messages.parent_id`?) is possible; I linked to tables only.
- Composite keys: not covered; I guessed `{key=yes}` on each part and it passed.
- Nullable foreign keys: only implied by `0..1` cardinality.
