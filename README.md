# digimatic-js

TypeScript/browser library for communicating with **Mitutoyo Digimatic SPC** measuring instruments via the [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API).

> **Browser compatibility**: Chrome and Edge desktop (≥ 89). Not supported on Firefox, Safari, or mobile.

---

---

## Quick start

### Single device

```ts
import { DigimaticDevice } from 'digimatic-js'

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
import { DigimaticManager } from 'digimatic-js'

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

### Manual packet parsing (advanced)

```ts
import { parsePacket, PacketAccumulator } from 'digimatic-js'

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

---

## Publishing

This package is published on [JSR](https://jsr.io/@lgtm/digimatic-js).

```bash
pnpx jsr publish
```

## Local development

```bash
pnpm install
pnpm run preview # serve demo at http://localhost:3000
```

---

## License

MIT
