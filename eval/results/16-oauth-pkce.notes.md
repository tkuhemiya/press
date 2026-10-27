# 16 oauth-pkce notes

## Types used and why
- `sequence` (flow): the whole point is who sends what to whom, in order, across front and back channels.
- `sequence` (attack): a second, smaller exchange to show the stolen code being rejected; separate idea, separate diagram.

## Checker rounds
- Round 1: 0 errors, 2 warnings.
  - `16-oauth-pkce.md:15: warning: Unknown kind 'client' for sequence; it will draw as a plain box. fix: Known kinds: user, service, database, queue, external.` (same at line 65)
  - Told me how to fix: yes. I dropped the kind (plain box) since none of the five fits "the OAuth client app".
- Round 2: clean.

## Wanted but couldn't express
- **Front channel vs back channel.** The key security fact is that the code travels through the browser (observable) while the verifier goes directly app-to-server. I wanted to group/band the browser-redirect messages as "front channel (untrusted)" and the token call as "back channel". Sequence has no message-range grouping or lane/participant grouping I know of; I said it in prose and step captions.
- **A "client app" participant kind.** `client` exists for architecture but not sequence; the OAuth "client" ended up as an unkinded box.
- **Showing that the verifier is secret / data carried.** I wanted an annotation like "verifier stays here" on the app lifeline, or a note on a message ("challenge = SHA256(verifier)"). Used self-messages (`app -> app : make verifier, hash it`) as a substitute; unclear whether `note` works on messages.
- **Attack diagram as a contrast.** I wanted the attack shown as a failing branch of the same flow (alt/else block: "with PKCE / without PKCE"). Had to make a second diagram, and the "rejected" reply is marked `happy` (good for the defender), which reads oddly next to the `error` interception.

## Skill gaps
- SKILL.md lists architecture kinds but not sequence kinds; I assumed they were shared and `client` would work. The checker corrected me.
- Unclear whether steps can pick between two messages with identical endpoints *and* no label, and whether self-messages are allowed (they were accepted).
- No guidance on whether `note` applies to sequence messages, or on alt/opt blocks.
