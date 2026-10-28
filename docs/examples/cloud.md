# One app on three clouds

Vendor icons let a diagram say which managed service does each job. The label names what this instance is for; the icon names the product.

## Uploads on AWS

```architecture id=aws title="Image uploads on AWS"
user: user "Browser"
cdn: aws.cloudfront "Photo CDN"
api: aws.api-gateway "Public API"
fn: aws.lambda "Resize function" {role=focus}
bucket: aws.s3 "Originals"
jobs: aws.sqs "Thumbnail jobs"
meta: aws.dynamodb "Photo metadata"

user -> cdn : GET /photo
cdn -> bucket : miss
user -> api : upload
api -> fn
fn -> bucket : put
fn -> jobs
fn -> meta
```

A request for a photo reaches [the CDN](#aws.cdn) first, and only a miss goes to [the bucket](#aws.bucket). An upload runs [the resize function](#aws.fn), which stores the original and queues the thumbnails.

## The same API on Kubernetes

```architecture id=k8s title="The API as a Kubernetes deployment"
lb: gcp.networking "Cloud load balancer"
ing: k8s.ingress "api.example.com"
svc: k8s.service "api"
dep: k8s.deployment "api"
pod: k8s.pod "api-7f9c"
cm: k8s.configmap "settings"
creds: k8s.secret "db-creds"
sql: gcp.cloud-sql "Photos database"
vault: azure.key-vaults "Shared vault"

lb -> ing -> svc -> pod
dep -> pod : manages
pod -> cm
pod -> creds
pod -> sql
creds -> vault : synced from
```

## One upload, in order

```sequence id=upload title="One upload"
user: user "Browser"
api: aws.api-gateway "Public API"
fn: aws.lambda "Resize"
bucket: aws.s3 "Originals"

user -> api : POST /photos
api -> fn : invoke
fn -> bucket : put
bucket --> fn : 200
fn --> user : 201 Created
```
