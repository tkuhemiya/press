# How backpropagation computes gradients

Training a neural network means nudging every weight in the direction that lowers the loss. To do that you need the gradient: for each weight, how much the loss would change if that weight moved a little. A network can have millions of weights, and computing each gradient separately would be hopeless. Backpropagation gets all of them in one backward sweep that costs about as much as the forward pass. The trick is the chain rule, applied in the right order, with intermediate results reused.

## A tiny network

Take one input `x`, one hidden unit and one output, with a squared-error loss against a target `t`:

- `z1 = w1·x + b1`, then `h = σ(z1)` (a sigmoid)
- `z2 = w2·h + b2`, which is the prediction `ŷ`
- `L = ½(ŷ − t)²`

Written as a graph, each value depends only on the ones to its left.

```architecture id=net title="The forward computation" direction=right
x: "input x"
w1: "weight w1"
z1: "z1 = w1·x + b1"
h: "h = σ(z1)"
w2: "weight w2"
z2: "ŷ = w2·h + b2"
loss: "L = ½(ŷ − t)²" {role=focus}
x -> z1
w1 -> z1
z1 -> h
h -> z2
w2 -> z2
z2 -> loss

steps:
  x -> z1 "Forward pass: compute every intermediate value left to right and keep them; the backward pass will need them."
  z2 -> loss "At the end, the loss is a single number. Its gradient with respect to itself is 1, and that is where the backward pass starts."
  z2 -> loss "Step back one node: ∂L/∂ŷ = ŷ − t. This is the error signal."
  w2 -> z2 "∂L/∂w2 = (ŷ − t)·h. The gradient for a weight is the incoming error times the value that weight multiplied."
  h -> z2 "∂L/∂h = (ŷ − t)·w2. The error is passed backward through the weight to the hidden unit."
  w1 -> z1 "∂L/∂z1 = ∂L/∂h · σ'(z1), and ∂L/∂w1 = ∂L/∂z1 · x. Same pattern, one layer further back."
```

## The forward pass stores, the backward pass multiplies

The forward pass runs left to right, computing [z1](#net.z1), [h](#net.h), [ŷ](#net.z2) and finally the [loss](#net.loss). Crucially, it remembers every intermediate value. That memory is why training uses much more RAM than inference.

The backward pass runs right to left. Start from the loss, where the derivative of `L` with respect to itself is 1. Each node receives "how much does the loss change if I change?" from the node after it, multiplies by its own local derivative, and passes the result to the nodes before it. Local derivatives are cheap and known in advance: the derivative of a sum is 1, of a product is the other factor, of a sigmoid is `σ(z)(1 − σ(z))`.

Following that rule through our network:

1. `∂L/∂ŷ = ŷ − t`, the raw error.
2. For the output weight, `∂L/∂w2 = (ŷ − t) · h`. Notice `h` comes from the forward pass.
3. To go further back, `∂L/∂h = (ŷ − t) · w2`.
4. Through the sigmoid, `∂L/∂z1 = ∂L/∂h · h(1 − h)`.
5. For the first weight, `∂L/∂w1 = ∂L/∂z1 · x`.

Each line reuses the one before it. That reuse is the whole point. Computing `∂L/∂w1` from scratch would repeat the work of steps 1, 3 and 4; with a hundred layers, naive differentiation would repeat the shared prefix for every weight. Backprop computes each shared piece once.

## What changes in a real network

Real layers are vectors and matrices rather than single numbers, so the products become matrix products: for a layer `z = W·h`, the gradient for `W` is the outer product of the incoming error and `h`, and the error passed back is `Wᵀ` times the incoming error. When a value feeds several later nodes, the gradients arriving from each are summed. Frameworks such as PyTorch and JAX do exactly this automatically: they record the forward graph, then walk it backward.

Two practical consequences fall out of the mechanism. The sigmoid's derivative is at most 0.25, so multiplying many of them shrinks the error signal toward zero in deep networks, the *vanishing gradient* problem, which is why modern networks prefer ReLU and residual connections. And because the backward pass needs the stored activations, memory, not compute, is often what limits batch size.

Once every gradient is known, the optimizer updates each weight, for example `w ← w − η·∂L/∂w`, and the cycle repeats on the next batch.
