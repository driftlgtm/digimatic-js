/**
 * digimatic-js
 *
 * Browser library for communicating with Mitutoyo Digimatic SPC devices
 * via the Web Serial API.
 *
 * @example Basic usage (single device)
 * ```ts
 * import { DigimaticDevice } from 'digimatic-js'
 *
 * const device = new DigimaticDevice()
 *
 * device.on('reading', (r) => {
 *   console.log(`Reading: ${r.value} ${r.unit}`)
 * })
 *
 * device.on('error', (err) => {
 *   console.error('Error:', err.message)
 * })
 *
 * // Opens the port selection dialog (requires a user gesture)
 * await device.connect()
 * ```
 *
 * @example Multi-device usage with DigimaticManager
 * ```ts
 * import { DigimaticManager } from 'digimatic-js'
 *
 * const manager = new DigimaticManager()
 *
 * const id1 = await manager.addDevice()
 * const id2 = await manager.addDevice()
 *
 * const unsubscribe = manager.onReading((id, reading) => {
 *   console.log(`[${id}] ${reading.value} ${reading.unit}`)
 * })
 * ```
 *
 * @example Single reading with Promise
 * ```ts
 * import { DigimaticDevice } from 'digimatic-js'
 *
 * const device = new DigimaticDevice()
 * await device.connect()
 *
 * // Waits for the next reading (press DATA on the device)
 * const reading = await device.nextReading()
 * console.log(reading.value, reading.unit)
 * ```
 *
 * @module
 */

export { DigimaticDevice } from "./device.js";
export { DigimaticManager } from "./manager.js";
export { DigimaticDmx8 } from "./dmx8.js";
export { parsePacket, PacketAccumulator, PACKET_SIZE } from "./parser.js";
export { DigimaticError } from "./types.js";
export type {
	DigimaticReading,
	DigimaticConnectionState,
	DigimaticPortOptions,
	DigimaticDeviceOptions,
	DigimaticDeviceEvents,
	DigimaticDmx8Reading,
	DigimaticDmx8Events,
	DigimaticEventListener,
} from "./types.js";
