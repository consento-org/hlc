# Why the HLC is implemented in 96bits?

Some HLC implementations use 64bit to store HLC timestamps. This implementation of uses 96bits.
Consuming more space per timestamp may seem like a waste. This is not the case:

Other HLC implementations use 64bits by combining the logical component with the `wallTime`. You can do this using
the algorithm presented in here as well:

_example:_
```js
sample = Timestamp { wallTime: 1631552767459940000n, logical: 14 }
  // (hex) 16A4709900C156A00000000E

(sample.wallTime + BigInt(sample.logical)) → 1631552767459940014
  // (hex) 16A4709900C156AE
```

The problem with using 64bits occurs when we reach the end of the number space. The 64bit number space is not
limited and the largest timestamp that we have is `18446744073709552000` (or `0xFFFFFFFFFFFFFFFF`). If this number is exceeded
you simply can not increase the timestamp anymore.

_example with wallTime at the 64bit limit:_
```js
Timestamp { wallTime: 18446744073709551615n, logical: 14 }
  // (hex) FFFFFFFFFFFFFFFF0000000E

(64bit) → 18446744073709551629
  // (hex) FFFFFFFFFFFFFFFF
```

_Note how the 64bit representation overflowed!_ This is the natural limitation of nanosecond numbers as 64bit numbers.

Now, you may argue that the timestamp should never be reached anyways and indeed it _should_ not until the year ~2554.
However: things go wrong and hackers are a thing. Even without manipulating the code itself is easily possible to manipulate
a system's time by increasing the wallTime to our limit.

If you stick to the 64bit space to represent the timestamp, the game is over. But, if you use the logical part separately,
you can still create `4294967295` new timestamps, which - while not desirable - is still a workable system state
for a time at least.

_example of a timestamp at the end of HLC's size limit:_
```js
Timestamp { wallTime: 18446744073709551615n, logical: 4294967295 }
  // (hex) FFFFFFFFFFFFFFFFFFFFFFFF

(64bit) → 18446744073709551629
  // (hex) FFFFFFFFFFFFFFFF
```

## Bonus question: why not variable length timestamps?

This whole article comes from the assumption that the timestamp consume a fixed amount of bits, but databases do support
variable length data fields and one may question why we shouldn't put timestamps in a variable size field. After all: this way
we could exceed for any kind of timestamp from now on until forever.

And while that is true and you _can_ use `.toJSON()` => `{"wallTime":"0x16a4709900c156a0","logical":14}` to get an unlimited timestamp
it does open yet another attack vector. BigInt numbers can grow to **any size** practically limited to your systems
memory/disc-space.

_example of a timestamp that a bit bigger:_
```js
Timestamp {
  wallTime: 546812681195752981093125556779405341338292357723303109106442651602488249799843980805878294255763455n,
  logical: 4294967295
}
  // (hex) FFFFFFFFFFFFFFFFFFFFFFFF

(64bit) → 546812681195752981093125556779405341338292357723303109106442651602488249799843980805878294255763469
  // (hex) FFFFFFFFFFFFFFFF
```

Here you can see that the binary representation never exceeds the 96bit limit but the JSON representation does so by a lot.
An attacker could use this to break your system by providing a very large timestamp and every subsequent timestamp would
need to be even larger.

---

(_Generated from [why-96bit.js](./why-96bit.js)_)
