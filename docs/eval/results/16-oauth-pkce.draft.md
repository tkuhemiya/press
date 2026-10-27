# OAuth authorization code flow with PKCE

An app wants to read your calendar. It should never see your password, and the calendar
service should be able to hand out access that is narrow, revocable and short-lived. OAuth's
authorization code flow does this by splitting the job in two: the browser carries you to
the authorization server, where you log in and approve; the app then trades a one-time
*code* for an *access token* over a direct back-channel request.

PKCE (Proof Key for Code Exchange, pronounced "pixie") adds one small idea on top: the app
that starts the flow must prove it is the same app that finishes it.

## The flow

```sequence id=flow title="Authorization code flow with PKCE"
app: client "App"
browser: user "Browser"
auth: service "Authorization server"
api: service "Resource API"
app -> app : make verifier, hash it
app -> browser : redirect with challenge
browser -> auth : /authorize + challenge
auth -> auth : user logs in, consents
auth --> browser : redirect with code
browser --> app : code
app -> auth : /token + code + verifier {role=focus}
auth -> auth : hash(verifier) == challenge?
auth --> app : access token {role=happy}
app -> api : request + token
api --> app : calendar data
steps:
  app -> app "The app invents a random secret, the code verifier, and keeps it to itself. It sends only a hash of it, the code challenge."
  browser -> auth "The browser carries the challenge to the authorization server, which stores it next to the request."
  auth --> browser "After you approve, the server issues a short-lived authorization code and sends it back through a redirect, where anything watching the redirect could see it."
  app -> auth "To redeem the code, the app must also present the original verifier. Only the party that made the challenge knows it."
  auth --> app "The server hashes the verifier, compares it with the stored challenge, and only then releases the token."
```

Walk through it. Before anything else, [the app](#flow.app) generates a high-entropy random
string, the **code verifier**, and computes `challenge = BASE64URL(SHA256(verifier))`. It
sends the user to the [authorization server](#flow.auth) with the challenge in the URL. The
verifier never leaves the app at this point.

You log in and approve. The server records the challenge, mints an **authorization code**
and redirects the browser back to the app with that code in the URL. The code is the
fragile part of the whole flow: it travels through the browser, through redirect URIs,
sometimes through the operating system, and it can leak in all sorts of ways.

Then comes the back-channel call. The app posts the code *and the verifier* to the token
endpoint. The server hashes the verifier and checks it against the challenge it stored
earlier. If they match, it returns an access token (and usually a refresh token). The app
uses the token to call the [resource API](#flow.api).

## What PKCE protects against

The original authorization code flow assumed the app had a **client secret** it could send
with the code exchange. A server-side web app can keep a secret. A mobile app, a desktop app
or a single-page app cannot: anything shipped to a user's device can be extracted. Those
"public clients" were left with a code that, once stolen, could be redeemed by anyone.

That is the **authorization code interception attack**. On mobile, a malicious app can
register the same custom URL scheme as the real one and receive the redirect. In a browser,
the code can show up in logs, history, a `Referer` header or a compromised extension.

```sequence id=attack title="A stolen code without the verifier"
app: client "Real app"
evil: external "Attacker"
auth: service "Authorization server"
auth --> evil : code (intercepted) {role=error}
evil -> auth : /token + code, no verifier
auth --> evil : rejected: no matching verifier {role=happy}
app -> auth : /token + code + verifier
auth --> app : access token
```

With PKCE the [attacker](#attack.evil) holds the code but not the verifier, and it cannot
work the verifier backwards from the challenge because SHA-256 is one-way. The code is
useless to them. In effect PKCE gives every flow a fresh, one-time client secret that is
created on the device and never travels through the browser.

A few details matter in practice:

- **Use `S256`, not `plain`.** The spec allows sending the verifier itself as the
  challenge; that only helps if the front channel is never observed, which is the very
  thing PKCE assumes you cannot guarantee.
- **PKCE also defends confidential clients.** It blocks *code injection*, where an attacker
  slips a stolen code into a victim's session. OAuth 2.1 makes PKCE mandatory for every
  client, not just public ones.
- **It is not a replacement for `state`** or for exact redirect URI matching. `state`
  (or the OpenID Connect `nonce`) protects against cross-site request forgery; PKCE
  protects the code itself. Use all of them.

The short version: the authorization code is a bearer ticket that has to travel through
untrusted territory. PKCE binds it to a secret that never does.
