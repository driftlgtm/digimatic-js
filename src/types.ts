/**
 * A single reading received from a Digimatic device.
 */
export interface DigimaticReading {
	/** Numeric measurement value */
	value: number;
	/** Unit of measure ('mm' | 'in') */
	unit: "mm" | "in";
	/** Reception timestamp (ms epoch) */
	timestamp: number;
	/** Raw packet (13 bytes) for debugging */
	raw: Uint8Array;
}

/**
 * Connection state of a device.
 */
export type DigimaticConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

/**
 * Serial port configuration options.
 * Default values match the Digimatic SPC standard.
 */
export interface DigimaticPortOptions {
	/** Baud rate (default: 9600) */
	baudRate?: number;
	/** Data bits (default: 7) */
	dataBits?: 7 | 8;
	/** Stop bits (default: 1) */
	stopBits?: 1 | 2;
	/** Parity (default: 'even') */
	parity?: "none" | "even" | "odd";
	/** Flow control (default: 'none') */
	flowControl?: "none" | "hardware";
}

/**
 * Options for creating a DigimaticDevice.
 */
export interface DigimaticDeviceOptions {
	/** Serial port options */
	port?: DigimaticPortOptions;
	/** Maximum size of the readings history buffer (default: 1000) */
	bufferSize?: number;
	/** Timeout for nextReading() in ms (default: 5000) */
	readTimeout?: number;
}

/**
 * Map of events emitted by DigimaticDevice.
 */
export interface DigimaticDeviceEvents {
	/** New reading received */
	reading: DigimaticReading;
	/** Connection state changed */
	stateChange: DigimaticConnectionState;
	/** Communication error */
	error: Error;
}

/**
 * Generic type for an event listener.
 */
export type DigimaticEventListener<T> = (payload: T) => void;

/**
 * Digimatic protocol-specific error.
 */
export class DigimaticError extends Error {
	constructor(
		message: string,
		public readonly code:
			| "UNSUPPORTED"
			| "PORT_BUSY"
			| "PARSE_ERROR"
			| "CONNECTION_LOST"
			| "TIMEOUT"
			| "UNKNOWN",
	) {
		super(message);
		this.name = "DigimaticError";
	}
}
