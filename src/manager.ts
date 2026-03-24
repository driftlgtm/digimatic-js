import { DigimaticDevice } from "./device.js";
import type { DigimaticDeviceOptions, DigimaticReading } from "./types.js";
import { DigimaticError } from "./types.js";

/**
 * Manages multiple simultaneous connections to Digimatic devices.
 *
 * @example
 * ```ts
 * const manager = new DigimaticManager()
 *
 * // Add devices
 * const id1 = await manager.addDevice()
 * const id2 = await manager.addDevice()
 *
 * // Listen to all readings
 * manager.onReading((id, reading) => {
 *   console.log(`Dispositivo ${id}:`, reading.value, reading.unit)
 * })
 *
 * // Get all devices
 * const devices = manager.getDevices()
 * ```
 */
export class DigimaticManager {
	private devices: Map<string, DigimaticDevice> = new Map();
	private readingCallbacks: Array<
		(id: string, reading: DigimaticReading) => void
	> = [];
	private idCounter = 0;

	/**
	 * Adds a new device by opening the port selection dialog.
	 * @returns The unique ID assigned to the device
	 */
	async addDevice(options?: DigimaticDeviceOptions): Promise<string> {
		const id = `device-${++this.idCounter}`;
		const device = new DigimaticDevice(options);

		device.on("reading", (reading) => {
			this.readingCallbacks.forEach((cb) => cb(id, reading));
		});

		await device.connect();
		this.devices.set(id, device);
		return id;
	}

	/**
	 * Removes and disconnects a device by ID.
	 */
	async removeDevice(id: string): Promise<void> {
		const device = this.devices.get(id);
		if (!device) {
			throw new DigimaticError(
				`Dispositivo "${id}" non trovato.`,
				"UNKNOWN",
			);
		}
		await device.disconnect();
		this.devices.delete(id);
	}

	/**
	 * Returns a device by ID.
	 */
	getDevice(id: string): DigimaticDevice | undefined {
		return this.devices.get(id);
	}

	/**
	 * Returns the map of all connected devices.
	 */
	getDevices(): ReadonlyMap<string, DigimaticDevice> {
		return this.devices;
	}

	/**
	 * Number of currently managed devices.
	 */
	get count(): number {
		return this.devices.size;
	}

	/**
	 * Registers a callback invoked every time any device sends a new reading.
	 */
	onReading(
		callback: (id: string, reading: DigimaticReading) => void,
	): () => void {
		this.readingCallbacks.push(callback);
		// Returns a function to unregister the callback
		return () => {
			this.readingCallbacks = this.readingCallbacks.filter(
				(cb) => cb !== callback,
			);
		};
	}

	/**
	 * Disconnects all devices and clears the state.
	 */
	async disconnectAll(): Promise<void> {
		const disconnections = Array.from(this.devices.entries()).map(
			async ([id, device]) => {
				await device.disconnect();
				this.devices.delete(id);
			},
		);
		await Promise.allSettled(disconnections);
		this.readingCallbacks = [];
	}
}
