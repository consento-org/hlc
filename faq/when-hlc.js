const util = require('util')
const HLC = require('..')

const hlc = new HLC({ wallTime: () => 1631559364178067655n })
const nodeA = new HLC()
const node1 = new HLC()
const docA = { time: nodeA.now() }
const doc1 = { time: node1.now() }

console.log(render`# The power of HLC's

The basic of HLC's is that you call \`.now()\` multiple times
and it will always increment the timestamp, no matter if the \`.wallTime\` (the time of the OS)
changed not not. This means that two calls will not never the same timestamps after another.

\`\`\`js
hlc.now() // ${hlc.now()}
hlc.now() // ${hlc.now()}
\`\`\`

This is a powerful feature because using HLC's means every document/item will have a unique
_(per node)_, sortable timestamp, always!

This means that using HLC's you can **use timestamps as keys** in a single-node system!

\`\`\`js
const docA = { time: hlc.now() } // ${{ time: hlc.now() }}
const docB = { time: hlc.now() } // ${{ time: hlc.now() }}

const map = new Map()
map.set(JSON.stringify(docA.time), docA)
map.set(JSON.docB.time, docB)
\`\`\`

But what about a system of multiple nodes? The timestamps as they are can replace a _vector_!

This vector is awesome because you don't need to store a number per node \`O(N)\` but have
only the latest known timestamp \`O(1)\` :party:.

How does that work?

\`\`\`js
const nodeA = new HLC()
const node1 = new HLC()

const docA = { time: nodeA.now() } // ${docA}
const doc1 = { time: node1.now() } // ${doc1}
\`\`\`


The first two documents are created in parallel and there is a chance that either of 
the time stamp are first.

\`nodeA.now()\` will definitely create a timestamp newer than \`docA\` (${nodeA.now()}), but we can
also use \`.update()\` to certainly create timestamps newer than \`doc1\`!

\`\`\`js
nodeA.update(
  doc1.time
) // ${nodeA.update(doc1.time)}
\`\`\`

By processing every timestamp we know, we can make sure that the order of nodes is only in
question between sync operations!

\`\`\`js
const [docA, docB, doc1, doc2] = await Promise.all([
  // Ran at random time in parallel
  createDocAfterSomeTime(nodeA),
  createDocAfterSomeTime(nodeA),
  createDocAfterSomeTime(node1),
  createDocAfterSomeTime(node1),
])

// Sync
nodeA.update(doc1.time)
nodeA.update(doc2.time)
node1.update(docA.time)
node2.update(docB.time)

docC = { time: nodeA.now() }
\`\`\`

Here \`docC\` will be of a higher timestamp than all the other documents. This is
very useful for auto-merge operations. We know that only the documents between syncs
are to be sorted out, no matter how many clients may appear.

## When not to use HLC's?

- Don't use HLC's casually. Take your time to learn about the power and limitations of HLC's
    before you apply it. Mistake's in configuration can make your database vulnerable to attacks.

- Don't use them in hostile environments. HLC's have limited number space and a hostile party could
    create timestamps that exhaust the given number space. This implementation offers tools to mitigate
    the reduce risks but it's difficult to get it right and one has to make many assumptions in
    advance that may turn out wrong.

- As the timestamps are sorted only after sync we need node IDs as tie-breaks to deal with the
    disarray between the sync operations (merge-operation). Some applications have an easy time with this task
    automatically, others need manual ordering. For ordering by hand, HLC's may not help.

- HLC's are also not that good for human readbility. The timestamp itself has 96bits and - as mentioned
    above - node ID's may come into play. So humans may have to deal with very large numbers or strings which
    are not that good for short urls or to tell someone over the telephone.
`)

function render (strings, ...keys) {
  const result = [strings[0]]
  keys.forEach(function (key, i) {
    if (typeof key !== 'string') {
      key = util.inspect(key)
    }
    result.push(key, strings[i + 1])
  })
  return result.join('')
}
