# How a TCP connection opens and closes

A TCP connection is a small state machine on each side. Most of the states exist to
make sure neither side forgets a packet that is still in flight.

## Opening: the three-way handshake

```sequence id=handshake title="Three-way handshake"
client: service "Client"
server: service "Server"

client -> server : SYN (seq = x)
server -> client : SYN-ACK (seq = y, ack = x + 1)
client -> server : ACK (ack = y + 1) {role=happy}

steps:
  client -> server : SYN (seq = x)      "The client picks a random starting sequence number and sends SYN."
  server -> client                      "The server acknowledges it and sends its own starting number."
  client -> server : ACK (ack = y + 1)  "The client acknowledges the server's number. Both sides now agree."
```

Three messages, not two, because each side has to learn that the *other* side received
its starting number.

## The whole lifecycle

```state-machine id=tcp title="TCP connection states"
start -> closed
closed -> listen : passive open {role=muted}
closed -> syn_sent : active open
listen -> syn_rcvd : rcv SYN {role=muted}
syn_sent -> established : rcv SYN-ACK
syn_rcvd -> established : rcv ACK {role=muted}
established: "established" {role=happy}
established -> fin_wait_1 : close
established -> close_wait : rcv FIN {role=muted}
fin_wait_1 -> fin_wait_2 : rcv ACK
fin_wait_2 -> time_wait : rcv FIN
close_wait -> last_ack : close {role=muted}
last_ack -> closed : rcv ACK {role=muted}
time_wait: "time_wait" {role=focus, note="waits 2 × MSL"}
time_wait -> closed : timeout

steps:
  closed -> syn_sent          "The client opens actively and sends SYN."
  syn_sent -> established     "The SYN-ACK arrives; data can flow."
  established -> fin_wait_1   "The client closes first and sends FIN."
  fin_wait_1 -> fin_wait_2    "The server acknowledges the FIN."
  fin_wait_2 -> time_wait     "The server sends its own FIN."
  time_wait -> closed         "Only after waiting twice the maximum segment lifetime does the client forget the connection."
```

The muted states are the server's side of the same story. The one that surprises people
is [time_wait](#tcp.time_wait): the side that closes first keeps the connection around
for up to a few minutes, so that a delayed packet from the old connection cannot be
mistaken for part of a new one on the same ports.
