import { TypedEmitter } from "./emitter.js";
import { PacketAccumulator, parsePacket } from "./parser.js";
import type {
	DigimaticConnectionState,
	DigimaticDeviceEvents,
	DigimaticDeviceOptions,
	DigimaticEventListener,
	DigimaticReading,
} from "./types.js";
import { DigimaticError } from "./types.js";

const DEFAULT_OPTIONS: Required<DigimaticDeviceOptions> = {
	port: {
		baudRate: 9600,
		dataBits: 7,
		stopBits: 1,
		parity: "even",
		flowControl: "none",
	},
	bufferSize: 1000,
	readTimeout: 5000,
};

/**
 * Represents a single Digimatic device connected via the Web Serial API.
 *
 * @example
 * ```ts
 * const device = new DigimaticDevice()
 * device.on('reading', (r) => console.log(r.value, r.unit))
 * await device.connect()
 * ```
 */
export class DigimaticDevice {
	private emitter = new TypedEmitter<DigimaticDeviceEvents>();
	private port: SerialPort | null = null;
	private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private accumulator = new PacketAccumulator();
	private readings: DigimaticReading[] = [];
	private _state: DigimaticConnectionState = "disconnected";
	private abortController: AbortController | null = null;
	private readonly options: Required<DigimaticDeviceOptions>;

	constructor(options: DigimaticDeviceOptions = {}) {
		this.options = {
			...DEFAULT_OPTIONS,
			port: { ...DEFAULT_OPTIONS.port, ...options.port },
			bufferSize: options.bufferSize ?? DEFAULT_OPTIONS.bufferSize,
			readTimeout: options.readTimeout ?? DEFAULT_OPTIONS.readTimeout,
		};
	}

	// ─── State ───────────────────────────────────────────────────────────────

	get state(): DigimaticConnectionState {
		return this._state;
	}

	get isConnected(): boolean {
		return this._state === "connected";
	}

	/** History buffer of received readings (last `bufferSize` values). */
	get history(): ReadonlyArray<DigimaticReading> {
		return this.readings;
	}

	/** Last received reading, or null if no reading has been received yet. */
	get lastReading(): DigimaticReading | null {
		return this.readings.at(-1) ?? null;
	}

	// ─── Connection ──────────────────────────────────────────────────────────

	/**
	 * Apre il dialog di selezione porta e si connette al dispositivo.
	 * Richiede Chrome/Edge desktop con Web Serial API disponibile.
	 *
	 * @throws {DigimaticError} if Web Serial is not supported or the port is already in use
	 */
	async connect(serialPort?: SerialPort): Promise<void> {
		if (!("serial" in navigator)) {
			throw new DigimaticError(
				"Web Serial API non supportata in questo browser. Usa Chrome o Edge desktop.",
				"UNSUPPORTED",
			);
		}

		if (this._state === "connected" || this._state === "connecting") {
			throw new DigimaticError(
				"Dispositivo già connesso o in fase di connessione.",
				"PORT_BUSY",
			);
		}

		this.setState("connecting");

		try {
			this.port = serialPort ?? (await navigator.serial.requestPort());

			const portOptions = this.options.port;
			await this.port.open({
				baudRate: portOptions.baudRate!,
				dataBits: portOptions.dataBits,
				stopBits: portOptions.stopBits,
				parity: portOptions.parity,
				flowControl: portOptions.flowControl,
			});

			this.accumulator.reset();
			this.abortController = new AbortController();
			this.setState("connected");

			// Start the read loop in the background
			this.startReadLoop().catch((err: unknown) => {
				if (this._state !== "disconnected") {
					this.handleError(err);
				}
			});
		} catch (err) {
			this.setState("error");
			this.port = null;
			throw err;
		}
	}

	/**
	 * Disconnects the device and releases the serial port.
	 */
	async disconnect(): Promise<void> {
		if (this._state === "disconnected") return;

		this.abortController?.abort();
		this.abortController = null;

		try {
			await this.reader?.cancel();
		} catch {
			// ignore cancel errors
		}
		this.reader = null;

		try {
			await this.port?.close();
		} catch {
			// ignore close errors
		}
		this.port = null;

		this.accumulator.reset();
		this.setState("disconnected");
	}

	// ─── Read loop ───────────────────────────────────────────────────────────

	private async startReadLoop(): Promise<void> {
		if (!this.port?.readable) return;

		this.reader = this.port.readable.getReader();

		try {
			while (this._state === "connected") {
				const { value, done } = await this.reader.read();
				if (done) break;
				if (!value || value.length === 0) continue;

				console.log("[digimatic-js] serial rx:", value);

				const packets = this.accumulator.push(value);
				for (const packet of packets) {
					this.handlePacket(packet);
				}
			}
		} catch (err) {
			if (this._state === "connected") {
				this.handleError(err);
			}
		} finally {
			this.reader?.releaseLock();
			this.reader = null;
		}
	}

	private handlePacket(raw: Uint8Array): void {
		try {
			const reading = parsePacket(raw, Date.now());
			this.addReading(reading);
			this.emitter.emit("reading", reading);
		} catch (err) {
			// Malformed packet: emit the error but do not interrupt reading
			this.emitter.emit(
				"error",
				err instanceof Error ? err : new Error(String(err)),
			);
		}
	}

	private addReading(reading: DigimaticReading): void {
		this.readings.push(reading);
		if (this.readings.length > this.options.bufferSize) {
			this.readings.shift();
		}
	}

	private handleError(err: unknown): void {
		const error =
			err instanceof DigimaticError
				? err
				: new DigimaticError(
						err instanceof Error ? err.message : String(err),
						"CONNECTION_LOST",
					);
		this.setState("error");
		this.emitter.emit("error", error);
		// Silent cleanup
		this.port = null;
		this.reader = null;
		this.accumulator.reset();
	}

	private setState(state: DigimaticConnectionState): void {
		if (this._state === state) return;
		this._state = state;
		this.emitter.emit("stateChange", state);
	}

	// ─── Utilities ───────────────────────────────────────────────────────────

	/**
	 * Restituisce una Promise che si risolve alla prossima misura ricevuta.
	 * Si rifiuta se il dispositivo non è connesso o scatta il timeout.
	 */
	nextReading(): Promise<DigimaticReading> {
		if (!this.isConnected) {
			return Promise.reject(
				new DigimaticError(
					"Dispositivo non connesso.",
					"CONNECTION_LOST",
				),
			);
		}
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.off("reading", handler);
				reject(
					new DigimaticError(
						"Timeout in attesa della misura.",
						"TIMEOUT",
					),
				);
			}, this.options.readTimeout);

			const handler: DigimaticEventListener<DigimaticReading> = (
				reading,
			) => {
				clearTimeout(timer);
				resolve(reading);
			};

			this.once("reading", handler);
		});
	}

	/** Svuota il buffer storico delle misure. */
	clearHistory(): void {
		this.readings = [];
	}

	// ─── Event API ───────────────────────────────────────────────────────────

	on<K extends keyof DigimaticDeviceEvents>(
		event: K,
		listener: DigimaticEventListener<DigimaticDeviceEvents[K]>,
	): this {
		this.emitter.on(event, listener);
		return this;
	}

	off<K extends keyof DigimaticDeviceEvents>(
		event: K,
		listener: DigimaticEventListener<DigimaticDeviceEvents[K]>,
	): this {
		this.emitter.off(event, listener);
		return this;
	}

	once<K extends keyof DigimaticDeviceEvents>(
		event: K,
		listener: DigimaticEventListener<DigimaticDeviceEvents[K]>,
	): this {
		this.emitter.once(event, listener);
		return this;
	}
}
