const bigIntTime = require('bigint-time')
const { toBytesBE, fromBigInt, fromInt, fromBytesBE, toBigInt, MAX_UNSIGNED_VALUE } = require('longfn')

function writeUint32 (target, offset, num) {
  target[offset] = num & 0xFF
  target[offset + 1] = (num & 0xFF00) >> 8
  target[offset + 2] = (num & 0xFF0000) >> 16
  target[offset + 3] = (num & 0xFF000000) >> 24
}

function readUint32 (target, offset) {
  return target[offset] |
    (target[offset + 1] << 8) |
    (target[offset + 2] << 16) |
    (target[offset + 3] << 24)
}

const TMP_INT = fromInt(0)
const n1e6 = BigInt(1e6)
const UINT64_MAX = toBigInt(MAX_UNSIGNED_VALUE)
const UINT32_MAX = 0xFFFFFFFF

function bigIntCoerce (input, fallback) {
  if (typeof input === 'bigint') return input
  if (typeof input === 'number' || typeof input === 'string') return BigInt(input)
  return fallback
}

function bigIntJSON (bigInt) {
  if (bigInt < Number.MAX_SAFE_INTEGER) {
    return Number(bigInt)
  }
  return '0x' + bigInt.toString(16)
}

class ClockOffsetError extends Error {
  constructor (offset, maxOffset) {
    super(`The received time is ${offset / n1e6}ms ahead of the wall time, exceeding the 'maxOffset' limit of ${maxOffset / n1e6}ms.`)
    this.offset = offset
    this.maxOffset = maxOffset
  }
}
ClockOffsetError.prototype.type = 'ClockOffsetError'

class WallTimeOverflowError extends Error {
  constructor (time, maxTime) {
    super(`The wall time ${time / n1e6}ms exceeds the max time of ${maxTime / n1e6}ms.`)
    this.time = time
    this.maxTime = maxTime
  }
}
WallTimeOverflowError.prototype.type = 'WallTimeOverflowError'

class ForwardJumpError extends Error {
  constructor (timejump, tolerance) {
    super(`Detected a forward time jump of ${timejump / n1e6}ms, which exceed the allowed tolerance of ${tolerance / n1e6}ms.`)
    this.timejump = timejump
    this.tolerance = tolerance
  }
}
ForwardJumpError.prototype.type = 'ForwardJumpError'

const codec = Object.freeze({
  name: 'hlc',
  encode (current, byob, offset = 0) {
    let out
    if (byob) {
      if (byob.byteLength < 12) {
        throw new Error(`The provided Uint8Array is too small. 12 byte required but only ${byob.byteLength} byte given.`)
      }
      out = byob
    } else {
      out = new Uint8Array(12)
    }
    offset = byob ? offset : 0
    toBytesBE(fromBigInt(current.wallTime, true, TMP_INT), offset, out)
    writeUint32(out, offset + 8, current.logical)
    return out
  },
  decode (array, offset = 0) {
    return new Timestamp(toBigInt(fromBytesBE(array, true, offset, TMP_INT)), readUint32(array, offset + 8))
  }
})

class Timestamp {
  constructor (wallTime, logical = 0) {
    if (typeof wallTime === 'object') {
      this.wallTime = bigIntCoerce(wallTime.wallTime, 0n)
      this.logical = wallTime.logical
    } else {
      this.wallTime = bigIntCoerce(wallTime, 0n)
      this.logical = logical
    }
  }

  static bigger (a, b) {
    return a.compare(b) === -1 ? b : a
  }

  encode (byob, offset = 0) {
    return codec.encode(this, byob, offset)
  }

  toJSON () {
    return {
      wallTime: bigIntJSON(this.wallTime),
      logical: this.logical
    }
  }

  compare (other) {
    if (this.wallTime > other.wallTime) return 1
    if (this.wallTime < other.wallTime) return -1
    if (this.logical > other.logical) return 1
    if (this.logical < other.logical) return -1
    return 0
  }
}

class HLC {
  constructor ({ wallTime, maxOffset, wallTimeUpperBound, toleratedForwardClockJump, last } = {}) {
    this.wallTime = wallTime || bigIntTime
    this.maxOffset = bigIntCoerce(maxOffset, 0n)
    this.wallTimeUpperBound = bigIntCoerce(wallTimeUpperBound, 0n)
    this.toleratedForwardClockJump = bigIntCoerce(toleratedForwardClockJump, 0n)
    this.last = new Timestamp(this.wallTime())
    if (last) {
      this.last = Timestamp.bigger(new Timestamp(last), this.last)
    }
  }

  toJSON () {
    return {
      maxOffset: bigIntJSON(this.maxOffset),
      wallTimeUpperBound: bigIntJSON(this.wallTimeUpperBound),
      toleratedForwardClockJump: bigIntJSON(this.toleratedForwardClockJump),
      last: this.last.toJSON()
    }
  }

  now () {
    return this.update(this.last)
  }

  validateOffset (offset) {
    if (this.toleratedForwardClockJump > 0n && -offset > this.toleratedForwardClockJump) {
      throw new ForwardJumpError(-offset, this.toleratedForwardClockJump)
    }
    if (this.maxOffset > 0n && offset > this.maxOffset) {
      throw new ClockOffsetError(offset, this.maxOffset)
    }
  }

  update (other) {
    const last = Timestamp.bigger(other, this.last)
    let wallTime = this.wallTime()
    const offset = last.wallTime - wallTime
    this.validateOffset(offset)
    let logical
    if (offset < 0n) {
      logical = 0
    } else {
      wallTime = last.wallTime
      logical = last.logical + 1
      if (logical > UINT32_MAX) {
        wallTime += 1n
        logical = 0
      }
    }
    const maxWallTime = this.wallTimeUpperBound > 0n ? this.wallTimeUpperBound : UINT64_MAX
    if (wallTime > maxWallTime) {
      throw new WallTimeOverflowError(wallTime, maxWallTime)
    }
    this.last = new Timestamp(wallTime, logical)
    return this.last
  }
}
HLC.Timestamp = Timestamp
HLC.WallTimeOverflowError = WallTimeOverflowError
HLC.ClockOffsetError = ClockOffsetError
HLC.ForwardJumpError = ForwardJumpError
HLC.codec = codec
module.exports = HLC
