# digimatic-js

TypeScript/browser library for communicating with **Mitutoyo Digimatic SPC** measuring instruments via the [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API).

> **Browser compatibility**: Chrome and Edge desktop (≥ 89). Not supported on Firefox, Safari, or mobile.

---

## Installation

Generally speaking, to bundle this library in your project, you can use:

```bash
# Replace "pnpm" with your package manager or runtime of choice (npm, yarn, bun, deno, etc.)
pnpm install jsr:@lgtm/digimatic-js
```

---

## Quick start

### Single device

```ts
import { DigimaticDevice } from '@lgtm/digimatic-js'

const device = new DigimaticDevice()

device.on('reading', (r) => {
  console.log(`Reading: ${r.value} ${r.unit}`)  // e.g. "Reading: 25.340 mm"
})

device.on('stateChange', (state) => {
  console.log('State:', state) // 'connecting' | 'connected' | 'disconnected' | 'error'
})

device.on('error', (err) => {
  console.error('Error:', err.message)
})

// Opens the native port selection dialog (requires a user gesture)
await device.connect()

// Press DATA on the device to receive a reading
```

### Promise for a single reading

```ts
await device.connect()

// Waits for the next reading (with configurable timeout)
const reading = await device.nextReading()
console.log(reading.value, reading.unit)
```

### Multiple devices with DigimaticManager

```ts
import { DigimaticManager } from '@lgtm/digimatic-js'

const manager = new DigimaticManager()

// Each addDevice() opens a port selection dialog
const id1 = await manager.addDevice()
const id2 = await manager.addDevice()

// Global callback for all readings
const unsubscribe = manager.onReading((deviceId, reading) => {
  console.log(`[${deviceId}] ${reading.value} ${reading.unit}`)
})

// Remove a device
await manager.removeDevice(id1)

// Unregister the callback
unsubscribe()

// Disconnect everything
await manager.disconnectAll()
```

### Mitutoyo DMX-8/2 multiplexer

The `DigimaticDmx8` class communicates with the **DMX-8/2**, a microcontrolled interface that connects up to 8 Digimatic instruments to a single RS-232C port.

#### Continuous mode

```ts
import { DigimaticDmx8 } from '@lgtm/digimatic-js'

const dmx = new DigimaticDmx8()

dmx.on('reading', (r) => {
  console.log(`CH${r.channel}: ${r.value} ${r.unit}`)
})

dmx.on('error', (err) => console.error(err.message))

// Opens the native port selection dialog (requires a user gesture)
await dmx.connect()

// Start continuous transmission from all channels
await dmx.startContinuous()

// Stop when done
await dmx.stopContinuous()
await dmx.disconnect()
```

#### Poll a single channel

```ts
await dmx.connect()

// Send "C1" and wait for the response
const reading = await dmx.readChannel(1)
console.log(reading.channel, reading.value, reading.unit)
```

### Manual packet parsing (advanced)

```ts
import { parsePacket, PacketAccumulator } from '@lgtm/digimatic-js'

// Direct parsing of a raw packet (13 bytes)
const raw = new Uint8Array([0x00, 0x02, 0x05, 0x03, 0x04, 0x00, 0x00, 0x02, 0x00, ...])
const reading = parsePacket(raw)

// Accumulator for fragmented streams
const acc = new PacketAccumulator()
const packets = acc.push(incomingBytes)
packets.forEach(p => console.log(parsePacket(p)))
```

---

## API

### `DigimaticDevice`

#### Constructor

```ts
new DigimaticDevice(options?: DigimaticDeviceOptions)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `port.baudRate` | `number` | `9600` | Serial baud rate |
| `port.dataBits` | `7 \| 8` | `7` | Data bits |
| `port.stopBits` | `1 \| 2` | `1` | Stop bits |
| `port.parity` | `string` | `'even'` | Parity |
| `port.flowControl` | `string` | `'none'` | Flow control |
| `bufferSize` | `number` | `1000` | Max readings in history buffer |
| `readTimeout` | `number` | `5000` | Timeout for nextReading() in ms |

#### Methods

| Method | Description |
|---|---|
| `connect(port?)` | Connects (opens dialog if port is omitted) |
| `disconnect()` | Disconnects and releases the port |
| `nextReading()` | Promise → next reading |
| `clearHistory()` | Clears the history buffer |
| `on(event, cb)` | Adds a listener |
| `off(event, cb)` | Removes a listener |
| `once(event, cb)` | One-time listener |

#### Properties

| Property | Type | Description |
|---|---|---|
| `state` | `DigimaticConnectionState` | Current state |
| `isConnected` | `boolean` | True if connected |
| `history` | `ReadonlyArray<DigimaticReading>` | Readings buffer |
| `lastReading` | `DigimaticReading \| null` | Last received reading |

#### Events

| Event | Payload | Description |
|---|---|---|
| `reading` | `DigimaticReading` | New reading received |
| `stateChange` | `DigimaticConnectionState` | Connection state changed |
| `error` | `Error` | Communication error |

### `DigimaticDmx8`

#### Methods

| Method | Description |
|---|---|
| `connect(port?)` | Connects (opens dialog if port is omitted) |
| `disconnect()` | Disconnects and releases the port |
| `startContinuous()` | Sends `GS` — device streams all channels continuously |
| `stopContinuous()` | Sends `GR` — stops continuous transmission |
| `readChannel(n)` | Sends `Cn` (1–8), returns a Promise → single reading |
| `on(event, cb)` | Adds a listener |
| `off(event, cb)` | Removes a listener |
| `once(event, cb)` | One-time listener |

#### Events

| Event | Payload | Description |
|---|---|---|
| `reading` | `DigimaticDmx8Reading` | New reading received |
| `stateChange` | `DigimaticConnectionState` | Connection state changed |
| `error` | `Error` | Communication error |

### `DigimaticDmx8Reading`

```ts
interface DigimaticDmx8Reading {
  channel: number      // Channel index (1–8)
  value: number        // Numeric value (e.g. 11.378)
  unit: 'mm' | 'in'   // Unit of measure
  timestamp: number    // Reception time as ms epoch
}
```

### `DigimaticReading`

```ts
interface DigimaticReading {
  value: number        // Numeric value (e.g. 25.340)
  unit: 'mm' | 'in'   // Unit of measure
  timestamp: number    // Reception time as ms epoch
  raw: Uint8Array      // Raw packet (13 bytes) for debugging
}
```

### `DigimaticError`

```ts
class DigimaticError extends Error {
  code: 'UNSUPPORTED' | 'PORT_BUSY' | 'PARSE_ERROR' | 'CONNECTION_LOST' | 'TIMEOUT' | 'UNKNOWN'
}
```

---

## Hardware setup

The Digimatic SPC protocol uses a **proprietary 5-pin connector** (Mitutoyo Mini-DIN). To connect it to a PC:

1. **Mitutoyo USB-ITN cable** (264-016): official SPC → USB adapter, appears as a Virtual COM Port
2. **SPC → RS-232 cable** + generic **RS-232 → USB** adapter
3. **Arduino/microcontroller** as a bridge (for DIY projects)

Once connected, the device appears as a serial port in the `navigator.serial.requestPort()` dialog.

### DMX-8/2 multiplexer

The **Mitutoyo DMX-8/2** connects up to 8 Digimatic instruments to a single RS-232C port (D-SUB 9). Use it when you need to read multiple gauges simultaneously from one serial connection.

- Connect the DMX-8/2 to the PC via a **DB9 RS-232 → USB adapter**
- Connect up to 8 Digimatic instruments to the DMX-8/2 inputs
- The device appears as a single serial port — use `DigimaticDmx8` to communicate with it

Serial parameters used by the DMX-8/2: 9600 baud, 8 data bits, 1 stop bit, no parity, no flow control.

---

## Publishing

This package is published on [JSR](https://jsr.io/@lgtm/digimatic-js).

```bash
pnpx jsr publish
```

## Local development

```bash
pnpm install
pnpm dev # serve demo at http://localhost:3000
```

---

## License

MIT
