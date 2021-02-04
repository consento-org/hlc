type bigintLike = bigint | string | number
declare namespace HLC {
  class ClockOffsetError extends Error {
    type: 'ClockOffsetError'
    offset: bigint
    maxOffset: bigint
    constructor (offset: bigint, maxOffset: bigint)
  }
  class WallTimeOverflowError extends Error {
    type: 'WallTimeOverflowError'
    time: bigint
    maxTime: bigint
    constructor (time: bigint, maxTime: bigint)
  }
  class ForwardJumpError extends Error {
    type: 'ForwardJumpError'
    timejump: bigint
    tolerance: bigint
    constructor (timejump: bigint, tolerance: bigint)
  }
  class LogicalOverflowError extends Error {
    type: 'LogicalOverflowError'
    logical: number
    max: number
  }
  type TimestampOptions = [time: {
    wallTime: bigintLike
    logical?: number
  }] | [wallTime: bigintLike, logical: number] | [wallTime: bigintLike]
  class Timestamp {
    wallTime: bigint
    logical: number
    constructor (...opts: TimestampOptions)
    encode <Input extends Uint8Array> (byob: Uint8Array, offset?: number): Input
    encode (): Uint8Array
    compare (other: Timestamp): number
    static compare (a: Timestamp, b: Timestamp): number
    toJSON(): any
  }
  interface Options {
    wallTime?: () => bigint
    maxOffset?: bigintLike
    wallTimeUpperBound?: bigintLike
    toleratedForwardClockJump?: bigintLike
    last?: TimestampOptions
  }
  const codec: {
    name: 'hlc',
    decode (bytes: Uint8Array, offset?: number): Timestamp
    encode <Input extends Uint8Array> (timestamp: Timestamp, byob: Uint8Array, offset?: number): Input
    encode (timestamp: Timestamp): Uint8Array
  }
}
class HLC {
  constructor (options?: HLC.Options)
  maxOffset: bigint
  wallTimeUpperBound: bigint
  toleratedForwardClockJump: bigint
  last: HLC.Timestamp
  now(): HLC.Timestamp
  update(other: HLC.Timestamp): void
  validateOffset(offset: bigint): void
  toJSON(): any
}
export = HLC
