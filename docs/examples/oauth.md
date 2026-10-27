# OAuth's authorization code flow, step by step

"Log in with GitHub" looks like one click, but four parties exchange six messages, and
the security of the whole thing rests on which of those messages the browser can see.

```sequence id=oauth title="Authorization code flow with PKCE"
user: user "You"
browser: client "Browser"
group "Your app" {
  app: service "App server"
}
group "GitHub" {
  auth: external "Authorization server"
  api: external "API"
}

phase front "Front channel: through the browser" {
  user -> browser : click "Log in with GitHub"
  browser -> auth : redirect with client_id, challenge
  auth -> user : "Allow access?"
  user -> auth : approve
  auth --> browser : redirect with code
  browser -> app : code
}
phase back "Back channel: server to server" {
  app -> auth : code + verifier + secret {role=focus}
  auth --> app : access token {role=happy}
  app -> api : request with token
  api --> app : your profile
}

steps:
  browser -> auth          "The app sends you to GitHub with its id and a hashed one-time **challenge**."
  auth -> user             "GitHub, not the app, asks for your consent."
  auth -> browser          "GitHub sends the browser back with a short-lived **code**. The code is not a token."
  browser -> app           "The browser hands the code to the app's server."
  app -> auth              "The server trades the code for a token, proving it is the same party that started (verifier) and the real app (secret)."
  auth -> app              "The token goes straight to the server; it never passes through the browser."
  app -> api               "The server can now call the API on your behalf."
```

The key move is the [code exchange](#oauth.app->auth): anything in the
[front channel](#oauth.front) passes through the browser and can be stolen, so the browser
only ever carries a code that is useless without the secret held by the
[app server](#oauth.app). The token itself travels only in the [back channel](#oauth.back). The challenge and verifier (PKCE) close
the remaining gap: even someone who intercepts the code cannot redeem it, because only
the party that started the flow knows the verifier.
