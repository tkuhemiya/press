# The JavaScript event loop

JavaScript runs your code on a single thread. There is one call stack, and only one function
is ever executing at a time. Yet a page can fetch data, wait on timers and respond to clicks
all at once. The trick is that JavaScript never *waits*. Slow work is handed to the host (the
browser or Node), and when it finishes, a callback is queued. The **event loop** is the rule
that decides which queued callback runs next.

## The parts

```architecture id=parts title="Where callbacks wait"
group "JavaScript engine" {
  stack: service "Call stack" {role=focus}
  micro: queue "Microtask queue"
}
group "Host (browser or Node)" {
  apis: service "Timers, network, DOM events"
  tasks: queue "Task queue"
  render: service "Rendering"
}
stack -> apis : setTimeout, fetch, addEventListener
apis -> tasks : callback when ready
stack -> micro : promise settles, queueMicrotask
tasks -> stack : one task
micro -> stack : every microtask
render --> stack : requestAnimationFrame
```

The [call stack](#parts.stack) is where code actually runs. When a function calls another,
a frame is pushed; when it returns, the frame is popped. While anything is on the stack,
nothing else can run: not a click handler, not a timer, not a repaint.

When your code calls `setTimeout`, `fetch` or `addEventListener`, it does not wait. It
registers a callback with the [host](#parts.apis) and returns at once. When the timer fires
or the response arrives, the host puts a **task** (sometimes called a macrotask) in the
[task queue](#parts.tasks).

Promises use a separate, more urgent line: the [microtask queue](#parts.micro). When a
promise settles, its `.then` callbacks are queued as microtasks. So is the continuation
after an `await`, and anything passed to `queueMicrotask`.

## The loop

The loop itself is short enough to write down:

```state-machine id=loop title="One turn of the event loop" direction=right
start -> run_task
run_task -> drain_micro : stack empty
drain_micro -> drain_micro : run next microtask
drain_micro -> render : microtask queue empty
render -> run_task : take next task
steps:
  run_task -> drain_micro "Take the oldest task and run it to completion. Nothing interrupts it."
  drain_micro -> drain_micro "Run every microtask, including any new ones queued while draining. The queue must be empty before the loop moves on."
  drain_micro -> render "Only now may the browser recalculate styles, lay out and paint, if a frame is due."
  render -> run_task "Then one more task, and the cycle repeats."
```

The asymmetry is the important part. The loop takes **one** task per turn, but **all**
microtasks, including any that get queued while it is draining. That makes microtasks the
right tool for "run this as soon as the current code finishes, before anything else
happens", and it is why promise callbacks always beat timers.

It is also a trap. A microtask that keeps queueing another microtask never lets the loop
reach [rendering](#loop.render) or the next task. The page freezes just as surely as with an
infinite `while` loop, and no `setTimeout(…, 0)` callback can break in.

## A worked example

```js
console.log('A');
setTimeout(() => console.log('B'), 0);
Promise.resolve().then(() => console.log('C'));
console.log('D');
```

This prints `A D C B`. Here is the order of events:

```timeline id=order title="What runs when"
script: "Script runs: logs A, schedules B, queues C, logs D"
empty: "Stack empties"
micro: "Microtasks drain: logs C" {role=focus}
paint: "Maybe render"
task: "Next task: timer callback logs B"
script -> micro : promise queued C
script -> task : timer queued B
```

The whole script is itself a task, so it runs to completion first: `A`, then `D`. The
`setTimeout` callback has gone to the task queue even with a delay of zero, and the promise
callback to the microtask queue. When the script ends and [the stack empties](#order.empty),
the loop drains microtasks before taking another task, so `C` prints. Only on the next turn
does the timer's task run and print `B`.

## What to take away

- Long-running synchronous code blocks everything, including rendering. Break it up or move
  it to a worker.
- `await` does not create a new task; the code after it resumes as a microtask, ahead of
  any timers or events.
- `setTimeout(fn, 0)` means "after the current task, any microtasks and maybe a render",
  not "now".
- Node has the same model with more queues (timers, I/O, `setImmediate`, and
  `process.nextTick`, which runs even before promise microtasks), but the rule of one task,
  then all microtasks, still holds.
