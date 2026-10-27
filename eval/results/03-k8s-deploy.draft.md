# What `kubectl apply` actually does

When you run `kubectl apply -f deployment.yaml`, very little happens synchronously. `kubectl`
sends one HTTP request, the API server stores an object, and the command returns. Everything
else, from creating Pods to starting containers, is done afterwards by independent controllers
that each watch for changes and nudge the cluster toward what you asked for. Kubernetes is a set
of reconcile loops sharing one database.

## The pieces

```architecture id=k8s title="Who takes part"
you: user "kubectl"
group "Control plane" {
  api: service "API server" {role=focus}
  etcd: database "etcd"
  dc: service "Deployment controller"
  rsc: service "ReplicaSet controller"
  sched: service "Scheduler"
}
group "Worker node" {
  kubelet: service "kubelet"
  runtime: service "Container runtime"
}
registry: external "Image registry"
you -> api : apply
api -> etcd : read / write
dc -> api : watch, write
rsc -> api : watch, write
sched -> api : watch, bind
kubelet -> api : watch, status
kubelet -> runtime : start containers
runtime -> registry : pull image
```

Notice that every component talks to the [API server](#k8s.api), and only the API server talks
to [etcd](#k8s.etcd). The controllers never call each other. They communicate by writing objects
and watching for objects other components wrote.

## The chain of events

```sequence id=flow title="From apply to running containers"
you: user "kubectl"
api: service "API server"
dc: service "Deployment ctrl"
rsc: service "ReplicaSet ctrl"
sched: service "Scheduler"
kubelet: service "kubelet"
you -> api : PATCH Deployment
api --> you : 200 configured
api -> dc : Deployment changed
dc -> api : create ReplicaSet
api -> rsc : ReplicaSet created
rsc -> api : create Pods
api -> sched : unscheduled Pods
sched -> api : bind Pod to node
api -> kubelet : Pod assigned
kubelet -> api : Pod Running {role=happy}
steps:
  you -> api : PATCH Deployment "kubectl computes a diff against the last applied config and sends it. The API server authenticates, runs admission, validates, and writes to etcd. kubectl is done."
  dc -> api : create ReplicaSet "The Deployment controller sees a new pod template, so it creates a ReplicaSet for it (or scales an existing one)."
  rsc -> api : create Pods "The ReplicaSet controller counts its Pods, finds fewer than replicas, and creates Pod objects with no node."
  sched -> api : bind Pod to node "The scheduler filters nodes that fit the Pod's requests and constraints, scores them, and records its choice."
  kubelet -> api : Pod Running "The kubelet on that node pulls the image, starts the containers, and reports status back once probes pass."
```

**1. The API server.** `kubectl apply` is a client-side (or, with `--server-side`, server-side)
three-way merge: it compares your file, the live object and the last configuration it applied,
and sends a patch. The [API server](#flow.api) authenticates you, checks RBAC, runs mutating and
validating admission webhooks, validates the schema, and persists the result to etcd. At that
point `kubectl` prints `deployment.apps/web configured` and exits. Nothing is running yet.

**2. The Deployment controller.** It watches Deployments. If the pod template changed, it creates
a new ReplicaSet with a hash of that template in its name, and starts a **rolling update**: scale
the new ReplicaSet up and the old one down, a few Pods at a time, within the limits set by
`maxSurge` and `maxUnavailable`. If only `replicas` changed, it just resizes the current ReplicaSet.

**3. The ReplicaSet controller.** It compares how many Pods match its selector with how many it
wants, and creates or deletes Pod objects to close the gap. A freshly created Pod has an empty
`nodeName`.

**4. The scheduler.** It watches for Pods with no node. For each, it filters out nodes that can't
host it (not enough CPU or memory, taints, affinity rules), scores the rest, and writes a binding.

**5. The kubelet.** Each node's kubelet watches for Pods bound to it. It asks the container
runtime to pull the image and start the containers, sets up networking and volumes, then runs the
readiness probe. Only when the Pod reports Ready does the Deployment controller count it as
available and continue the rollout by scaling down an old Pod.

## Why it is built this way

Because each controller only compares *desired* with *observed* and acts on the difference, the
system is self-healing. If a node dies, its Pods vanish, the ReplicaSet controller sees too few,
and the whole chain runs again with no human involved. The same property means `kubectl apply`
is idempotent: applying an unchanged file finds no difference and does nothing.

To watch the asynchronous part happen, run `kubectl rollout status deployment/web` or
`kubectl get events --watch` right after applying.
