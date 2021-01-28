const { test } = require('fresh-tape')
const { Timestamp } = require('.')
const HLC = require('.')

test('.now() returns a new timestamp', t => {
  const clock = new HLC()
  t.equals(clock.maxOffset, 0n)
  t.equals(clock.toleratedForwardClockJump, 0n)
  t.equals(clock.wallTimeUpperBound, 0n)
  const time = clock.now()
  t.equals(time.logical, 0)
  t.ok(time instanceof HLC.Timestamp)
  const time2 = clock.now()
  t.equals(time2.compare(time), 1)
  t.end()
})
test('.update() can override the internal clock', t => {
  const clock = new HLC()
  const time = clock.now()
  time.wallTime += BigInt(1e9) // Stepping 1s into the future
  clock.update(time)
  const time2 = clock.now()
  t.equals(time2.wallTime, time.wallTime)
  t.end()
})
test('repeat clocks on the same walltime increment logical parts', t => {
  const clock = new HLC()
  const time = clock.now()
  time.wallTime += BigInt(1e9) // Stepping 1s into the future
  clock.update(time)
  const time2 = clock.now()
  const time3 = clock.now()
  t.equals(time2.wallTime, time3.wallTime)
  t.equals(time2.logical, 2)
  t.equals(time3.logical, 3)
  t.end()
})
test('Timestamp comparison', t => {
  const a = new HLC.Timestamp(0, 0)
  const b = new HLC.Timestamp(0, 1)
  const c = new HLC.Timestamp(1, 1)
  t.equals(a.compare(a), 0)
  t.equals(a.compare(b), -1)
  t.equals(a.compare(c), -1)
  t.equals(b.compare(a), 1)
  t.equals(b.compare(b), 0)
  t.equals(b.compare(c), -1)
  t.equals(c.compare(a), 1)
  t.equals(c.compare(b), 1)
  t.equals(c.compare(c), 0)
  t.equals(HLC.Timestamp.bigger(a, a), a)
  t.equals(HLC.Timestamp.bigger(a, b), b)
  t.equals(HLC.Timestamp.bigger(a, c), c)
  t.equals(HLC.Timestamp.bigger(b, a), b)
  t.equals(HLC.Timestamp.bigger(b, b), b)
  t.equals(HLC.Timestamp.bigger(b, c), c)
  t.equals(HLC.Timestamp.bigger(c, a), c)
  t.equals(HLC.Timestamp.bigger(c, b), c)
  t.equals(HLC.Timestamp.bigger(c, c), c)
  t.end()
})
test('JSON de/serialization', t => {
  const clock = new HLC({
    wallTime: () => 0n,
    maxOffset: 3,
    toleratedForwardClockJump: 4,
    wallTimeUpperBound: BigInt(Number.MAX_SAFE_INTEGER + 1),
    last: new HLC.Timestamp(1)
  })
  const expectedJSON = {
    maxOffset: 3,
    wallTimeUpperBound: '0x20000000000000',
    toleratedForwardClockJump: 4,
    last: {
      wallTime: 1,
      logical: 0
    }
  }
  t.deepEquals(clock.toJSON(), expectedJSON)
  const restored = new HLC({
    wallTime: () => 0n,
    ...clock.toJSON()
  })
  t.deepEquals(restored.toJSON(), expectedJSON)
  t.end()
})
test('Bytes de/encoding', t => {
  const time = new HLC.Timestamp(15n, 5)
  const bytes = time.encode()
  t.ok(bytes instanceof Uint8Array)
  t.equals(bytes.length, 12)
  const restored = HLC.codec.decode(bytes)
  t.equals(restored.compare(time), 0)
  t.end()
})
test('Bytes de-/encoding with byob and offset', t => {
  const time = new HLC.Timestamp(15n, 5)
  const bytes = Buffer.alloc(20)
  t.equals(HLC.codec.encode(time, bytes).toString('hex'), '000000000000000f050000000000000000000000')
  bytes.fill(0)
  t.equals(time.encode(bytes, 2), bytes)
  t.equals(bytes.toString('hex'), '0000000000000000000f05000000000000000000')
  const restored = HLC.codec.decode(bytes, 2)
  t.equals(restored.compare(time), 0)
  t.end()
})
test('Bytes encoding on a too-small array', t => {
  t.throws(
    () => new HLC.Timestamp().encode(new Uint8Array(2)),
    new Error('The provided Uint8Array is too small. 12 byte required but only 2 byte given.')
  )
  t.end()
})
test('restoring from a past timestamp', t => {
  const clockOlder = new HLC({
    wallTime: () => 0n,
    last: new HLC.Timestamp(1)
  })
  t.equals(clockOlder.last.wallTime, 1n)
  const clockNewer = new HLC({
    wallTime: () => 2n,
    last: new HLC.Timestamp(1)
  })
  t.equals(clockNewer.last.wallTime, 2n)
  t.end()
})
test('updating with newer logical', t => {
  const clock = new HLC({
    wallTime: () => 0n,
    last: new HLC.Timestamp(1, 2)
  })
  clock.update(new HLC.Timestamp(1, 5))
  t.equals(clock.last.wallTime, 1n)
  t.equals(clock.last.logical, 6)
  t.end()
})
test('updating with older logical', t => {
  const clock = new HLC({
    wallTime: () => 0n,
    last: new HLC.Timestamp(1, 5)
  })
  clock.update(new HLC.Timestamp(1, 2))
  t.equals(clock.last.wallTime, 1n)
  t.equals(clock.last.logical, 6)
  t.end()
})
test('forward clock jump error', t => {
  let myTime = 1n
  const wallTime = () => myTime
  const clockNoError = new HLC({ wallTime })
  const clockError = new HLC({ wallTime, toleratedForwardClockJump: 10 })
  t.equals(clockError.toleratedForwardClockJump, 10n)
  myTime = 2n
  t.deepEquals(clockError.now(), clockNoError.now())
  myTime = 20n
  t.equals(clockNoError.now().compare(new HLC.Timestamp(20, 0)), 0)
  t.throws(() => clockError.now(), new HLC.ForwardJumpError(18n, 10n))
  t.end()
})
test('maxOffset error', t => {
  const wallTime = () => 0n
  const clockNoError = new HLC({ wallTime })
  const clockError = new HLC({ wallTime, maxOffset: 10n })
  t.equals(clockError.maxOffset, 10n)
  const jumpStamp = new HLC.Timestamp(20n)
  clockNoError.update(jumpStamp)
  t.deepEquals(clockNoError.now().toJSON(), {
    wallTime: 20,
    logical: 2
  })
  t.throws(() => clockError.update(jumpStamp), new HLC.ClockOffsetError(20n, 10n))
  t.end()
})
test('wall overflow error', t => {
  t.throws(() => {
    (new HLC({ wallTime: () => 18446744073709551615n + 1n })).now()
  }, new HLC.WallTimeOverflowError(18446744073709551616n, 18446744073709551615n))
  t.throws(() => {
    (new HLC({
      wallTime: () => 2n,
      wallTimeUpperBound: 1
    })).now()
  }, new HLC.WallTimeOverflowError(2n, 1n))
  t.end()
})
test('logical overflow leads to physical increase', t => {
  const clock = new HLC({
    wallTime: () => 0n,
    last: new Timestamp(0, 0xFFFFFFFF - 1)
  })
  t.deepEquals(clock.now().toJSON(), {
    wallTime: 0,
    logical: 0xFFFFFFFF
  })
  t.deepEquals(clock.now().toJSON(), {
    wallTime: 1,
    logical: 0
  })
  t.end()
})
test('example: usage', t => {
  const clock = new HLC({
    wallTime: require('bigint-time'), // [default=bigint-time] alternative implementation, in case `bigint-time` doesn't solve your needs
    maxOffset: 0, // [default=0] Maximum time in nanosecons that another timestamp may exceed the wall-clock before an error is thrown.
    toleratedForwardClockJump: 0, // [default=0] Maximum time in nanoseconds that the wall-clock may exceed the previous timestamp before an error is thrown. Setting it 0 will disable it.
    wallTimeUpperBound: 0, // [default=0] will throw an error if the wallTime exceeds this value. Setting it to 0 will limit it to the uint64 max-value.
    last: null // [default=undefined] The last known timestamp to start off, useful for restoring a clock's state
  })

  const timestamp = clock.now()

  // Makes sure that the next timestamp is bigger than the other timestamp
  clock.update(new HLC.Timestamp(1))

  // Turn the clock into an Uint8Array
  const bytes = timestamp.encode() // Shortform for HLC.codec.encode(timestamp)
  HLC.codec.decode(bytes)

  timestamp.encode(Buffer.allocUnsafe(16)) // If you prefer a Buffer instance
  t.end()
})
test('example: clock drift', t => {
  try {
    const clock = new HLC({
      maxOffset: 60 * 1e9 /* 1 minute in nanoseconds */
    })
    const timestamp = clock.now()
    clock.update(
      new HLC.Timestamp(timestamp.wallTime + BigInt(120 * 1e9))
    )
    t.fail('error should have thrown')
  } catch (error) {
    if (error.type !== 'ClockOffsetError') {
      throw error
    }
    t.deepEquals(error, new HLC.ClockOffsetError(error.offset, error.maxOffset))
  }
  t.end()
})
test('example: clock drift', t => {
  try {
    const wallTimeUpperBound = BigInt(new Date('2022-01-01T00:00:00.000Z').getTime()) * BigInt(1e6)
    const clock = new HLC({
      wallTime: () => wallTimeUpperBound + 1n, // Faking a wallTime that is beyond the max we allow
      wallTimeUpperBound
    })
    clock.now()
    t.fail('error should have thrown')
  } catch (error) {
    if (error.type !== 'WallTimeOverflowError') {
      throw error
    }
    t.deepEquals(error, new HLC.WallTimeOverflowError(error.time, error.maxTime))
  }
  t.end()
})
test('example: clock drift', t => {
  const clock = new HLC({
    toleratedForwardClockJump: 1e6 /* 1 ms in nanoseconds */
  })
  setTimeout(() => {
    try {
      clock.now()
      t.fail('error should have thrown')
    } catch (error) {
      if (error.type !== 'ForwardJumpError') {
        throw error
      }
      t.deepEquals(error, new HLC.ForwardJumpError(error.timejump, error.tolerance))
    }
    t.end()
  }, 10) // we didn't update the clock in 10 seconds
})
test('example: drift monitoring', t => {
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

  const clock = new CockroachHLC({
    wallTime: () => 10n,
    maxOffset: 20
  })
  clock.update(new Timestamp(13))
  t.equals(clock.monotonicityErrorCount, 1)
  t.end()
})
