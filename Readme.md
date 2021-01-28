## Hybrid Logical Clock

`@consento/hlc` is a [Hybrid Logical Clock][HLC] implementation in JavaScript.
You can use this in a decentralized system to sort statements created by tow
separate devices.

> **TL;DR**: This clock will use the system clock unless the system clock is behind
another known timestamp, in which case it will increment a counter.

It is comparable to [CockroachDB's implementation][CockroachHLC].
It creates Timestamps with a nanosecond (uint64) WallClock _(using [bigint-time][bigint-time])_ that supports de-/encoding
from Uint8Arrays _(compatible with [codecs][codecs])_ and JSON.

[HLC]: https://muratbuffalo.blogspot.com/2014/07/hybrid-logical-clocks.html
[CockroachHLC]: https://github.com/cockroachdb/cockroach/blob/663fcf17cb8789a2c46a719e0107a15400eee918/pkg/util/hlc/hlc.go
[bigint-time]: https://github.com/consento-org/bigint-time
[codecs]: https://github.com/mafintosh/codecs

## Usage

```javascript
const HLC = require('@consento/hlc')
const clock = new HLC({
  wallTime: require('bigint-time'), // [default=bigint-time] alternative implementation, in case `bigint-time` doesn't solve your needs
  maxOffset: 0, // [default=0] Maximum time in nanosecons that another timestamp may exceed the wall-clock before an error is thrown.
  toleratedForwardClockJump: 0, // [default=0] Maximum time in nanoseconds that the wall-clock may exceed the previous timestamp before an error is thrown. Setting it 0 will disable it.
  wallTimeUpperBound: 0, // [default=0] will throw an error if the wallTime exceeds this value. Setting it to 0 will limit it to the uint64 max-value.
  last: null, // [default=undefined] The last known timestamp to start off, useful for restoring a clock's state
})

const timestamp = clock.now()

// Makes sure that the next timestamp is bigger than the other timestamp
clock.update(new HLC.Timestamp(1))

// Turn the clock into an Uint8Array
const bytes = timestamp.encode() // Shortform for HLC.codec.encode(timestamp)
const restored = HLC.codec.decode(bytes)

const buffer = timestamp.encode(Buffer.allocUnsafe(16)) // If you prefer a Buffer instance
```

## Clock Drift

> **TL;DR** There is no one-size-fits all solution to clock drifts, so you need to consider your strategy for this.

In a decentralized system, the wallclock of a different device may be ahead of the current device's wall-clock
_(see ["Clock Drift" at Wikipedia](https://en.wikipedia.org/wiki/Clock_drift))_. This means we need to allow
wallclocks in updates to be newer/bigger than our own.

But if we allow this a malicous or broken implementation could create a timestamp that is set to `UINT64_MAX_VALUE`
with a logical clock of `UINT32_MAX_VALUE` and then we can not have a newer clock.

The `maxOffset` option comes into play when syncing with other devices and how accurate the timestamp is on these
devices. If they are perfectly in sync a `maxOffset=0` might be a good idea, but in real life conditions: 20 seconds
up to a minute should be considered a good idea [[ref](https://superuser.com/a/1212945)].

_Provoking a clock-drift error with a set `maxOffset`:_
```javascript
const clock = new HLC({
  maxOffset: 60 * 1e9 /* 1 minute in nanoseconds */
})
const timestamp = clock.now()
clock.update(
  new HLC.Timestamp(timestamp.wallTime + BigInt(120 * 1e9))
)
```
```
ClockOffsetError: The received time is 119061ms ahead of the wall time, exceeding the 'maxOffset' limit of 60000ms..
    at HLC.update (/consento/hlc/index.js:166:15) {
  type: 'ClockOffsetError',
  offset: 119061660718n,
  maxOffset: 60000000000n
}
```

## Wallclock Limits

> **TL;DR** Timestamps can be broken and you may want to set a limit in order for the broken timestamps to not ruin the whole system.

Additional to the previous explanation, a clock of a users/server device may be set to any given number.

This means that your physical clock could simply be set to a ridiculous value that breaks the clocks functionality.
The `wallTimeUpperBound` option allows you to prevent this and make sure that even if a devices clock is tuned to
11 your application/service can be fixed with an update.

For example: If you know that any application running **will** be updated within a two year period and you are okay
for the older versions to not work anymore, then it makes sense to set `wallTimeUpperBound` to a fixed `bigint`
timestamp of "now + 2years". Applications older than 2 years will stop working. Maybe 2 years is a bit tight, then
you could set it to a 100 years.

_Provoking a wall-time-verflow error with a set `wallTimeUpperBound`:_
```javascript
const wallTimeUpperBound = BigInt(new Date('2022-01-01T00:00:00.000Z').getTime()) * BigInt(1e6)
const clock = new HLC({
  wallTime: () => wallTimeUpperBound + 1n, // Faking a wallTime that is beyond the max we allow
  wallTimeUpperBound
})
clock.now()
```
```
WallTimeOverflowError: The wall time 1640995200000ms exceeds the max time of 1640995200000ms.
    at HLC.update (/consento/hlc/index.js:185:13)
    at HLC.now (/consento/hlc/index.js:154:17) {
  type: 'WallTimeOverflowError',
  time: 1640995200000000001n,
  maxTime: 1640995200000000000n
}
```

## Runtime Clock Manipulation

> **TL;DR** The system clock can be manipulated and you need to some extra effort to have some safeguard against it.

An alternative way to `wallTimeUpperBound` for restricting clock drifts is `toleratedForwardClockJump`. It will
prevent that the `wallClock` exceeds the last known wall-clock by a given amount. Combined with an interval this
makes sure that an error occurs when the physical clock suddenly jumped too far like this:

```javascript
const clock = new HLC({
  toleratedForwardClockJump: 10 * 1e9 /* 10 seconds in nanoseconds */
})
// We update the clock every second, which should prevent that error from happening
setInterval(() => clock.now(), 1)
```

If we forget to update the clock in time or someone manipulates the clock an error is thrown:

```javascript
const clock = new HLC({
  toleratedForwardClockJump: 1e6 /* 1 ms in nanoseconds */
})
setTimeout(() => clock.now(), 10) // we didn't update the clock in 10 seconds
```
```
ForwardJumpError: Detected a forward time jump of 11ms, which exceed the allowed tolerance of 1ms.
    at HLC.update (/consento/hlc/index.js:165:13)
    at HLC.now (/consento/hlc/index.js:157:17) {
  type: 'ForwardJumpError',
  timejump: 11036527n,
  tolerance: 1000000n
}
```

## Clock drift monitoring

Running a system you may want to track how much a clock drifts.

The cockroach db counts how often the 1/10th of `maxOffset` is reached in the [`monotonicityErrorCount`][monotonicityErrorCount] property.

Since there may be various ways how to track this, you can just extend the
`HLC` class for monitoring any way you like:

```javascript
const HLC = require('@consento/hlc')

class CockroachHLC extends HLC {
  constructor (opts) {
    super(opts)
    this.monotonicityErrorCount = 0
  }
  validateOffset (offset) {
    super.validateOffset(offset)
    if (this.maxOffset > 10n && offset > this.maxOffset / 10n) {
      this.monotonicityErrorCount += 1
    }
  }
}

const clock = new CockroachHLC({ maxOffset: 20 })
```

[monotonicityErrorCount]: https://github.com/cockroachdb/cockroach/blob/663fcf17cb8789a2c46a719e0107a15400eee918/pkg/util/hlc/hlc.go#L65-L67

## Deserialization

The system allows not just the de-/serialization of timestamps using **sortable** Uint8Array or Buffers:

```javascript
HLC.codec.encode(timestamp, [byob, offset])
HLC.codec.decode(uint8Array, offset=0)
```

The deserialization to `JSON` works simply using `.toJSON`:

```javascript
const jsonObject = clock.now().toJSON()
const timestamp = new HLC.Timestamp(json)
```

However unlikely, it is also possible to save/restore the entire clock using `JSON`:

```javascript
const clock = new HLC()
const restored = new HLC(clock.toJSON())
```

## License

[MIT](./LICENSE)
