# The TLS 1.3 handshake in one round trip

Before a browser can send a single byte of an HTTPS request, it and the server have to agree on
two things: a shared secret key that nobody on the network can learn, and proof that the server
really is who it claims to be. TLS 1.2 needed two full round trips to get there. TLS 1.3 does it
in one, and the trick is surprisingly simple: the client stops asking and starts guessing.

## The exchange

```sequence id=tls title="TLS 1.3 full handshake"
client: user "Client"
server: service "Server"
client -> server : ClientHello + key share
server -> client : ServerHello + key share
server -> client : EncryptedExtensions
server -> client : Certificate
server -> client : CertificateVerify
server -> client : Finished
client -> server : Finished
client -> server : HTTP request {role=happy}
server --> client : HTTP response
steps:
  client -> server : ClientHello + key share "The client sends its supported ciphers and, crucially, a Diffie-Hellman public key for the group it expects the server to pick."
  server -> client : ServerHello + key share "The server picks the same group and replies with its own public key. Both sides can now compute the same shared secret."
  server -> client : Certificate "Everything after ServerHello is already encrypted. The certificate proves which key belongs to the server's name."
  server -> client : CertificateVerify "A signature over the whole transcript so far proves the server holds the private key for that certificate, so nobody in the middle swapped key shares."
  client -> server : Finished "The client checks the server's Finished MAC, sends its own, and the handshake is done after one round trip."
  client -> server : HTTP request "Application data rides in the same flight as the client's Finished; no extra wait."
```

The [client](#tls.client) opens with a `ClientHello`. Besides the usual list of cipher suites and
extensions, it includes a **key share**: an ephemeral Diffie-Hellman public key, usually for
X25519. This is the guess. In TLS 1.2 the client first asked which key exchange the server
wanted, waited for the answer, and only then sent its key material. TLS 1.3 cut the menu down to
a handful of modern groups, so the client can just pick the most likely one and send a key up
front.

The [server](#tls.server) answers with a `ServerHello` that carries its own key share. At this
moment both sides hold each other's public keys, and each can compute the same shared secret
without that secret ever crossing the wire. From the shared secret they derive handshake keys,
and **everything the server sends after `ServerHello` is encrypted**, including its certificate.
That is a privacy improvement over TLS 1.2, where an observer could read which certificate was
presented.

The rest of the server's first flight does authentication:

- `Certificate` binds a public key to the server's hostname, signed by a certificate authority
  the client trusts.
- `CertificateVerify` is a signature, made with that certificate's private key, over a hash of
  every handshake message so far. It is what stops a man in the middle: an attacker could replace
  the key shares, but could not then produce this signature.
- `Finished` is a MAC over the transcript, proving the server derived the same keys.

The client verifies all three, sends its own `Finished`, and is free to send its HTTP request
immediately, in the same flight. The server's response arrives one round trip after the very
first packet, counting from the TLS layer.

## Why one round trip is enough

The saving comes from removing a negotiation step, not from cutting corners on security. In TLS
1.2 the first round trip was spent agreeing *how* to exchange keys, and the second actually
exchanging them. TLS 1.3 merges the two by having the client send key material speculatively.

If the guess is wrong (the server doesn't support the group the client chose), the server sends
a `HelloRetryRequest` naming a group it does accept, and the client tries again. That costs the
extra round trip TLS 1.2 always paid, but in practice almost every server supports X25519, so the
fallback is rare.

TLS 1.3 also dropped static RSA key exchange entirely. Every connection uses ephemeral
Diffie-Hellman, so every session has forward secrecy: stealing the server's private key later
does not decrypt recorded traffic.

## Zero round trips, with a catch

A client that has talked to the server before can hold a *pre-shared key* from the earlier
session and send application data in its very first flight ("0-RTT" or early data). The cost is
that early data can be replayed by an attacker who captures it, so servers should only accept it
for requests that are safe to repeat, such as a plain `GET`.
