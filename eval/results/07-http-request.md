# What happens when you type a URL and press enter

Typing `https://example.com/news` and pressing enter sets off a chain of lookups and handshakes before a single pixel of the page appears. Most of the time is spent waiting on the network, so the browser works hard to skip steps it has done before. Here is the path for a first visit, with nothing cached.

## The conversation on the wire

```sequence id=req title="Loading a page for the first time"
browser: user "Browser"
dns: external "DNS resolver"
cdn: service "CDN edge"
origin: service "Origin server"

browser -> dns : where is example.com?
dns --> browser : 93.184.216.34
browser -> cdn : TCP SYN
cdn --> browser : SYN-ACK
browser -> cdn : TLS ClientHello
cdn --> browser : certificate, key share
browser -> cdn : GET /news
cdn -> origin : GET /news (cache miss)
origin --> cdn : 200 HTML
cdn --> browser : 200 HTML
browser -> cdn : GET style.css, app.js
cdn --> browser : 200 assets

steps:
  browser -> dns "The browser needs an IP address. It checks its own cache, the OS cache, then asks a resolver, which may walk from the root servers down to example.com's nameservers."
  browser -> cdn : TCP SYN "With an address in hand, it opens a TCP connection: one round trip before any data can flow."
  browser -> cdn : TLS ClientHello "TLS 1.3 agrees on keys and proves the server owns the name, in one more round trip."
  browser -> cdn : GET /news "Only now does the actual HTTP request go out, encrypted."
  cdn -> origin "The CDN has no copy, so it forwards the request to the origin, which builds the page."
  browser -> cdn : GET style.css, app.js "Parsing the HTML reveals more resources, which reuse the same connection."
```

### 1. Finding the server

A URL names a host, but the network routes by IP address. The browser first checks its own [DNS](#req.dns) cache, then the operating system's, then asks a recursive resolver (usually your ISP's or a public one like 1.1.1.1). If the resolver has never seen the name, it asks a root server who handles `.com`, asks that server who handles `example.com`, and finally gets an address. Each answer comes with a time-to-live, so the next visit skips all of this.

### 2. Opening a connection

The browser opens a TCP connection to that address with a three-way handshake. For HTTPS it then runs a TLS handshake: the server sends a certificate, the browser checks it chains up to a trusted authority and matches the hostname, and both sides derive session keys. With TLS 1.3 that is one round trip; with HTTP/3 over QUIC, transport and encryption are combined, and a returning visitor can sometimes send data in the very first packet.

Very often the server at the other end is not the origin but a [CDN edge](#req.cdn) a few milliseconds away. Terminating TLS close to the user is the single biggest speed-up for distant visitors.

### 3. The request and response

The browser sends `GET /news` with headers: the host, cookies, accepted formats and compression, and cache validators if it has an old copy. If the edge has a fresh copy it answers directly; otherwise it forwards to the [origin server](#req.origin), which runs application code, perhaps queries a database, and returns HTML with a status code and headers such as `Cache-Control` that decide who may store it and for how long.

### 4. Turning bytes into pixels

The browser does not wait for the whole document. As HTML streams in, it parses it into the DOM. A preload scanner looks ahead for `<link>` and `<script>` tags and fetches them early over the same connection. CSS builds the CSSOM, and the two combine into a render tree. Layout computes where every box goes, paint fills in pixels, and the compositor assembles layers on the GPU. Scripts can pause parsing unless they are marked `async` or `defer`, which is why their placement matters.

## Why the second visit is faster

Almost every step above has a cache: DNS answers, open connections kept alive, TLS session tickets, HTTP caches in the browser and at the edge. A warm second visit can skip straight from "press enter" to "render from cache", which is why first-load performance and repeat-load performance are such different problems.
