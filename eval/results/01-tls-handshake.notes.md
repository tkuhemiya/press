# 01 tls-handshake: notes

## Types used and why
- `sequence` (id=tls): the handshake is literally messages between two parties in order, and the "one round trip" claim is about counting flights. Six steps walk the key exchange, then authentication, then early application data.

## Checker rounds
- Round 1 (the copy of the first draft): 0 errors, 0 warnings. No changes needed.
- I also rendered it (`press build`) to check the result. No problems found.

## Wanted but couldn't express
- **A round-trip bracket / flight grouping.** The whole point is "one round trip". I wanted to bracket messages into flights (client flight 1, server flight 1, client flight 2) or mark the RTT boundary. Sequence has no fragment/bracket/divider construct (like UML `par`/`opt` or a horizontal "1 RTT" marker). Instead I said it in prose.
- **"Encrypted from here on" region.** Everything after ServerHello is encrypted. I wanted a shaded span or a divider across the lifelines. There is no way to mark a range of messages. Instead: prose plus a step caption.
- **Comparison with TLS 1.2 (2-RTT).** A side-by-side of two sequences, or one diagram showing the extra round trip as `muted`, would make "why only one" obvious. I could have written a second sequence, but without alignment between them it wouldn't compare well, so I left it to prose.
- **Optional/conditional message (HelloRetryRequest).** No `opt`/alt branch in sequence. Covered in prose only.
- Messages bundled in one TCP flight (ServerHello..Finished) had to be five separate arrows; no way to say "sent together".

## Skill gaps
- The step syntax for sequences is shown only as a one-line example (`api -> db : insert "caption"`). Not clear whether a step label must match exactly, or what happens when two messages share from/to *and* a label (e.g. two `Finished` messages in opposite directions are fine, but two identical ones?).
- Not stated whether `{role=...}` on a sequence message is meaningful or how it shows.
