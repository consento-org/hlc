const util = require('util')
const HLC = require('..')

let now = 1n
const wallTime = () => now

const node1Offset = 0n
const node1 = new HLC({ wallTime: () => wallTime() + 0n + node1Offset })
let node2Offset = 0n
const node2 = new HLC({ wallTime: () => wallTime() + 1n + node2Offset })
let node3Offset = 0n
const node3 = new HLC({ wallTime: () => wallTime() + 5n + node3Offset })

function syncAllNodes () {
  const now1 = node1.now()
  const now2 = node2.now()
  const now3 = node3.now()
  node1.update(now2)
  node1.update(now3)
  node2.update(now1)
  node2.update(now3)
  node3.update(now1)
  node3.update(now2)
  return 'sync all nodes'
}

function advanceTime (amount) {
  now += amount
  return `advance time by \`${amount}n\` (wallTime=\`${now}\`)`
}

console.log(render`# How HLC's are not unique?

Looking into statements about HLC's we find:

> Most of the time they store a node ID too as a tie breaker in case of identical timestamps and counters. ([source](https://imfeld.dev/notes/hybrid_logical_clock))

> However it doesn't guarantee that provided timestamps will be unique across services ... sometimes come together with some unique and ordered process identifier ([source](https://bartoszsypytkowski.com/hybrid-logical-clocks/))

> In practice, you'll want a third element, a "node ID" that is unique per device. ([source](https://jaredforsyth.com/posts/hybrid-logical-clocks/))

... unfortunately none of these elaborate why a "node ID" is a good idea. This article is an attempt to mitigate this.

Let's say we have three HLC nodes with an artificial \`wallTime\` that is frozen in time, currently at ${now}.

_Node2_ is \`1n\` ahead of _node1_ and _node3_ is another \`4n\` ahead of node1. In a real system the difference between the nodes
may be much larger. Also of note is that the nodes are progressing in parallel, meaning that one node likely stays ahead of the others.

- node1: ${node1.now()}
- node2: ${node2.now()}
- node3: ${node3.now()}

Without syncing or progresses in the \`wallTime\`, naturally _node1_ and _node2_ produce the same, non-unique timestamps
consistently.

- node1: ${node1.now()}
- node2: ${node2.now()}
- node3: ${node3.now()}

As you can see all of the node's logical counters increased even though the \`wallTime\` didn't making the timestamps unique
only per node. In practice, time advances which means that two timestamps would need to be created within \`< 1 nanosecond\`
of time, which is very unlikely. Let's ${advanceTime(1n)} and we shall see that the logical clock is reset.

- node1: ${node1.now()}
- node2: ${node2.now()}
- node3: ${node3.now()}

The strength of HLC's is revealed when a sync happens. If we ${syncAllNodes()}, we will notice that
all timestamps are beyond the \`wallTime\`=${now} and also beyond the previous largest timestamp of _node3_.

- node1: ${node1.now()}
- node2: ${node2.now()}
- node3: ${node3.now()}

If we further ${advanceTime(1n)}, it will not make a difference for _node1_ and _node2_. Their \`wallTime\` is still
behind the last \`wallTime\` they used, but their logical component will increase.

- node1: ${node1.now()}
- node2: ${node2.now()}
- node3: ${node3.now()}

Just to illustrate this point, we can ${advanceTime(1n)} once more and the \`wallTime\` will still not have increased.

- node1: ${node1.now()}
- node2: ${node2.now()}
- node3: ${node3.now()}

Only if we ${advanceTime(4n)} to a point where it caught up with the \`5n\` advance of _node3_ during the last sync,
the other nodes use the \`wallTime\` again.

- node1: ${node1.now()}
- node2: ${node2.now()}
- node3: ${node3.now()}

Unlike the case of multiple operations per nanosecond, this case is actually rather common. Clocks are never
100% in sync and after a sync process it is very likely that all but the most advanced clock will use the
logical component.

The clocks using the logical component will increment independently. This will create equivalent,
non-unique timestamps in the process.

## Bonus Question: Why don't we sync the wallTime?

There is a reasonably argument to be made that the \`wallTime\` should be increased for the nodes lagging behind.
You can add an offset to the largest \`wallTime\` that you received.

It is a good idea to do that, particularly to reduce the chance of duplicates and it may make a little more sense
for users. However, you need to be careful when offsets to the \`wallTime\` don't compound.

In the previous examples, the time for all nodes advanced at the same pace. But in reality it does not. Each
node increments at slightly different paces. Let's say we adjust _node2's? wallTime to add \`4n\` => ${1n + (node2Offset += 4n)}
offset to its \`wallClock\`. When we next ${advanceTime(1n)} we will see that _node2_ and _node3_ both advanced.

- node2: ${node2.now()}
- node3: ${node3.now()}

What could happen though is that _node2_ advances sometimes at a pace of ${node2Offset += 2n} while
_node3_ advances sometimes advances at the pace of ${node3Offset += 1n}.

- node2: ${node2.now()}
- node3: ${node3.now()}

Suddenly _node2_ is ahead and _node3_ needs to compensate by increasing its offset by \`+1\`, even though it is
physically the still \`3n\` ahead of _node2_! From that point on every unevenness in advance causes
all nodes to adjust for the biggest entry. This will lead to clocks automaticaly drifting little by little into the future.

Due to this difficulty, using the \`wallTime\` synching is not _(yet?)_ generalized and you need to be careful to make
sure that you don't exceed the time of the actually "furthest ahead" node.

### Important to note

Synching \`wallTime\` will reduce the probability for a non-unique timestamp drastically, but even so
it is still possible to have non-unique timestamps: Two nodes that happen to have the same \`wallTime\` and \`logical time\`.

The probability depends on the numbers of nodes, the amount of average drift and number of timestamps created.
Unless you feel confident that your probabilities are in your favor, it is a good idea to assume timestamps as non-unique.
`)

function render (strings, ...keys) {
  const result = [strings[0]]
  keys.forEach(function (key, i) {
    if (typeof key !== 'string') {
      key = '`' + util.inspect(key) + '`'
    }
    result.push(key, strings[i + 1])
  })
  return result.join('')
}
