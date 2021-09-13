# How HLC's are not unique?

Let's say we have three HLC nodes with an artificial `wallTime` that is frozen in time, currently at `1n`.

_Node2_ is `1n` ahead of _node1_ and _node3_ is another `4n` ahead of node1. In a real system the difference between the nodes
may be much larger. Also of note is that the nodes are progressing in parallel, meaning that one node likely stays ahead of the others.

- node1: `Timestamp { wallTime: 1n, logical: 1 }`
- node2: `Timestamp { wallTime: 2n, logical: 1 }`
- node3: `Timestamp { wallTime: 6n, logical: 1 }`

Without syncing or progresses in the `wallTime`, naturally _node1_ and _node2_ produce the same, non-unique timestamps
consistently.

- node1: `Timestamp { wallTime: 1n, logical: 2 }`
- node2: `Timestamp { wallTime: 2n, logical: 2 }`
- node3: `Timestamp { wallTime: 6n, logical: 2 }`

As you can see all of the node's logical counters increased even though the `wallTime` didn't making the timestamps unique
only per node. In practice, time advances which means that two timestamps would need to be created within `< 1 nanosecond`
of time, which is very unlikely. Let's advance time by `1n` (wallTime=`2`) and we shall see that the logical clock is reset.

- node1: `Timestamp { wallTime: 2n, logical: 0 }`
- node2: `Timestamp { wallTime: 3n, logical: 0 }`
- node3: `Timestamp { wallTime: 7n, logical: 0 }`

The strength of HLC's is revealed when a sync happens. If we sync all nodes, we will notice that
all timestamps are beyond the `wallTime`=`2n` and also beyond the previous largest timestamp of _node3_.

- node1: `Timestamp { wallTime: 7n, logical: 3 }`
- node2: `Timestamp { wallTime: 7n, logical: 3 }`
- node3: `Timestamp { wallTime: 7n, logical: 4 }`

If we further advance time by `1n` (wallTime=`3`), it will not make a difference for _node1_ and _node2_. Their `wallTime` is still
behind the last `wallTime` they used, but their logical component will increase.

- node1: `Timestamp { wallTime: 7n, logical: 4 }`
- node2: `Timestamp { wallTime: 7n, logical: 4 }`
- node3: `Timestamp { wallTime: 8n, logical: 0 }`

Just to illustrate this point, we can advance time by `1n` (wallTime=`4`) once more and the `wallTime` will still not have increased.

- node1: `Timestamp { wallTime: 7n, logical: 5 }`
- node2: `Timestamp { wallTime: 7n, logical: 5 }`
- node3: `Timestamp { wallTime: 9n, logical: 0 }`

Only if we advance time by `4n` (wallTime=`8`) to a point where it caught up with the `5n` advance of _node3_ during the last sync,
the other nodes use the `wallTime` again.

- node1: `Timestamp { wallTime: 8n, logical: 0 }`
- node2: `Timestamp { wallTime: 9n, logical: 0 }`
- node3: `Timestamp { wallTime: 13n, logical: 0 }`

Unlike the case of multiple operations per nanosecond, this case is actually rather common. Clocks are never
100% in sync and after a sync process it is very likely that all but the most advanced clock will use the
logical component.

The clocks using the logical component will increment independently. This will create equivalent,
non-unique timestamps in the process.

## Bonus Question: Why don't we sync the wallTime?

There is a reasonably argument to be made that the `wallTime` should be increased for the nodes lagging behind.
You can add an offset to the largest `wallTime` that you received.

It is a good idea to do that, particularly to reduce the chance of duplicates and it may make a little more sense
for users. However, you need to be careful when offsets to the `wallTime` don't compound.

In the previous examples, the time for all nodes advanced at the same pace. But in reality it does not. Each
node increments at slightly different paces. Let's say we adjust _node2's? wallTime to add `4n` => `5n`
offset to its `wallClock`. When we next advance time by `1n` (wallTime=`9`) we will see that _node2_ and _node3_ both advanced.

- node2: `Timestamp { wallTime: 14n, logical: 0 }`
- node3: `Timestamp { wallTime: 14n, logical: 0 }`

What could happen though is that _node2_ advances sometimes at a pace of `6n` while
_node3_ advances sometimes advances at the pace of `1n`.

- node2: `Timestamp { wallTime: 16n, logical: 0 }`
- node3: `Timestamp { wallTime: 15n, logical: 0 }`

Suddenly _node2_ is ahead and _node3_ needs to compensate by increasing its offset by `+1`, even though it is
physically the still `3n` ahead of _node2_! From that point on every unevenness in advance causes
all nodes to adjust for the biggest entry. This will lead to clocks automaticaly drifting little by little into the future.

Due to this difficulty, using the `wallTime` synching is not _(yet?)_ generalized and you need to be careful to make
sure that you don't exceed the time of the actually "furthest ahead" node.

### Important to note

Synching `wallTime` will reduce the probability for a non-unique timestamp drastically, but even so
it is still possible to have non-unique timestamps: Two nodes that happen to have the same `wallTime` and `logical time`.

The probability depends on the numbers of nodes, the amount of average drift and number of timestamps created.
Unless you feel confident that your probabilities are in your favor, it is a good idea to assume timestamps as non-unique.


---

(_Generated from [non-unique.js](./non-unique.js)_)
