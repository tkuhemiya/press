# How photo uploads work

A photo upload looks like one request, but most of the work happens after the response.
The browser never sends the image through the API: it uploads straight to object storage,
and the API only hands out permission and records what arrived. This page shows the parts
involved, then follows one upload through them.

## The parts

```architecture id=uploads title="Photo uploads"
phone: user "Photographer"
app: client "Web app"
cdn: external "CDN"

group "Private network" {
  api: service "Uploads API"
  db: database "Photos DB"
  sessions: cache "Session cache"
  jobs: queue "resize-jobs"
  worker: service "Resizer" {note="scales to 4 sizes"}
}

bucket: storage "Object storage" {role=focus}

phone -> app
app -> api : request upload URL
api -> sessions : check session {role=muted}
app -> bucket : PUT original {role=focus}
bucket --> jobs : object created
jobs --> worker : resize
worker -> bucket : write sizes
worker -> db : mark ready {role=happy}
cdn -> bucket : fetch on miss

steps:
  app -> api           "The app asks the API for permission to upload, not to upload."
  api -> sessions      "The API checks who is asking and signs a short-lived upload URL."
  app -> bucket        "The app sends the original **straight to storage**; the API never sees the bytes."
  bucket -> jobs       "Storage announces the new object on a queue."
  jobs -> worker       "A resizer picks the job up whenever it has capacity."
  worker -> db         "Once every size exists, the photo is marked ready and appears in the feed."
```

The key decision is that [object storage](#uploads.bucket) takes the upload directly. A
large file would otherwise tie up [the API](#uploads.api) for the whole transfer, and the API
would need as much bandwidth as every photographer combined.

The queue matters as much. Resizing is slow and bursty, so [the resizer](#uploads.worker)
works at its own pace and a spike in uploads only makes the queue longer. Nothing the
photographer is waiting on gets slower.

## What can go wrong

If the resizer falls behind, photos stay in the queue and the feed shows them late, but
no upload fails. If the API is down, no new uploads can start, but the ones already
in flight still finish, because they only need storage.
