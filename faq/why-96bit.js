const util = require('util')
const longfn = require('longfn')
const HLC = require('..')

const sample = new HLC.Timestamp({ wallTime: 1631552767459940000n, logical: 14 })
const exceed64Bit = new HLC.Timestamp({ wallTime: 0xFFFFFFFFFFFFFFFFn, logical: 14 })
const endOfTime = new HLC.Timestamp({ wallTime: 0xFFFFFFFFFFFFFFFFn, logical: Math.pow(2, 32) - 1 })
const insaneSize = new HLC.Timestamp({ wallTime: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn, logical: Math.pow(2, 32) - 1 })

function encodeHex (uint8Array) {
  return Buffer.from(uint8Array).toString('hex').toUpperCase()
}

function compare64Bit (timestamp, name) {
  const as64bit = timestamp.wallTime + BigInt(sample.logical)
  return `\`\`\`js
${name ? `${name} = ` : ''}${util.inspect(timestamp)}
  // (hex) ${encodeHex(timestamp.encode())}

(${name ? `${name}.wallTime + BigInt(${name}.logical)` : '64bit'}) → ${as64bit}
  // (hex) ${encodeHex(longfn.toBytesBE(longfn.fromBigInt(as64bit, true)))}
\`\`\``
}

console.log(render`# Why the HLC is implemented in 96bits?

Some HLC implementations use 64bit to store HLC timestamps. This implementation uses ${sample.encode().byteLength * 8}bits.
Consuming more space per timestamp may seem like a waste, but this is not the case:

Other HLC implementations use 64bits by combining the logical component with the \`wallTime\`. You could do this using
this implementation as well:

_example:_
${compare64Bit(sample, 'sample')}

The problem with using 64bits occurs when we reach the end of the number space. The 64bit number space is not
unlimited and the largest timestamp that we have is \`18446744073709552000\` (or \`0xFFFFFFFFFFFFFFFF\`). If this number is exceeded
you simply can not increase the timestamp anymore.

_example with wallTime at the 64bit limit:_
${compare64Bit(exceed64Bit)}

_Note how the 64bit representation overflowed!_ This is the natural limitation of nanosecond numbers as 64bit numbers.

Now, you may argue that the timestamp should never be reached anyways and indeed it _should_ not until the year ~2554.
However: things go wrong and hackers are a thing. Even without manipulating the code itself, it is easy to manipulate
an operating system's time by increasing the \`wallTime\` to the absolute limit.

If you stick to the 64bit space to represent the timestamp, the game is over. But, if you use the logical part separately,
you can still create \`${Math.pow(2, 32) - 1}\` new timestamps, which - while not desirable - is still a workable system state
for a time at least.

_example of a timestamp at the end of HLC's size limit:_
${compare64Bit(endOfTime)}

## Bonus question: why not variable length timestamps?

This whole article comes from the assumption that the timestamp consume a fixed amount of bits, but databases do support
variable length data fields and one may question why we shouldn't put timestamps in a variable size field. After all: this way
we could exceed for any kind of timestamp from now on until forever.

And while that is true and you _can_ use \`.toJSON()\` => \`${JSON.stringify(sample)}\` to get an unlimited timestamp
it does open yet another attack vector. BigInt numbers can grow to **any size** practically limited to your systems
memory/disc-space.

_example of a timestamp that a bit bigger:_
${compare64Bit(insaneSize)}

Here you can see that the binary representation never exceeds the 96bit limit but the JSON representation does so by a lot.
An attacker could use this to break your system by providing a very large timestamp and every subsequent timestamp would
need to be even larger.`)

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
