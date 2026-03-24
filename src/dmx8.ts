import { TypedEmitter } from "./emitter.js";
import type {
	DigimaticConnectionState,
	DigimaticDmx8Events,
	DigimaticDmx8Reading,
	DigimaticEventListener,
} from "./types.js";
import { DigimaticError } from "./types.js";

const DEFAULT_PORT_OPTIONS = {
	baudRate: 9600,
	dataBits: 8 as const,
	stopBits: 1 as const,
	parity: "none" as const,
	flowControl: "none" as const,
};

const RESPONSE_TIMEOUT_MS = 5000;

/**
 * Parses a single response line from the DMX-8/2.
 *
 * Observed format: `1 MW +001.378 mm    `
 * i.e. `{channel} {mode} {signed_value} {unit}`
 */
function parseDmx8Line(line: string): DigimaticDmx8Reading | null {
	const m = line.match(/^(\d+)\s+\S+\s+([+-]\d+\.\d+)\s+(\S+)/);
	if (!m) return null;

	return {
		channel: parseInt(m[1], 10),
		value: parseFloat(m[2]),
		unit: m[3] === "in" ? "in" : "mm",
		timestamp: Date.now(),
	};
}

/**
 * Interface for the Mitutoyo DMX-8/2 multiplexer.
 *
 * Connects up to 8 Digimatic instruments to a single RS-232C port.
 * Communicates via ASCII text commands and responses.
 *
 * @example Poll a single channel
 * ```ts
 * const dmx = new DigimaticDmx8()
 * await dmx.connect()
 * const reading = await dmx.readChannel(0)
 * console.log(reading.value, reading.unit)
 * ```
 *
 * @example Continuous mode
 * ```ts
 * const dmx = new DigimaticDmx8()
 * await dmx.connect()
 * dmx.on('reading', (r) => console.log(`CH${r.channel}:`, r.value, r.unit))
 * await dmx.startContinuous()
 * ```
 */
export class DigimaticDmx8 {
	private emitter = new TypedEmitter<DigimaticDmx8Events>();
	private port: SerialPort | null = null;
	private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
	private _state: DigimaticConnectionState = "disconnected";
	private lineBuffer = "";
	private encoder = new TextEncoder();
	private decoder = new TextDecoder();

	get state(): DigimaticConnectionState {
		return this._state;
	}

	get isConnected(): boolean {
		return this._state === "connected";
	}

	// ─── Connection ──────────────────────────────────────────────────────────

	async connect(serialPort?: SerialPort): Promise<void> {
		if (!("serial" in navigator)) {
			throw new DigimaticError(
				"Web Serial API non supportata in questo browser. Usa Chrome o Edge desktop.",
				"UNSUPPORTED",
			);
		}

		if (this._state === "connected" || this._state === "connecting") {
			throw new DigimaticError(
				"DMX-8/2 già connesso o in fase di connessione.",
				"PORT_BUSY",
			);
		}

		this.setState("connecting");

		try {
			this.port = serialPort ?? (await navigator.serial.requestPort());
			await this.port.open(DEFAULT_PORT_OPTIONS);
			this.writer = this.port.writable!.getWriter();
			this.setState("connected");

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

	async disconnect(): Promise<void> {
		if (this._state === "disconnected") return;

		try {
			await this.sendCommand("GR\r\n");
		} catch {
			// ignore stop errors during disconnect
		}

		try {
			await this.reader?.cancel();
		} catch {
			// ignore cancel errors
		}
		this.reader = null;

		try {
			this.writer?.releaseLock();
		} catch {
			// ignore release errors
		}
		this.writer = null;

		try {
			await this.port?.close();
		} catch {
			// ignore close errors
		}
		this.port = null;
		this.lineBuffer = "";
		this.setState("disconnected");
	}

	// ─── Commands ────────────────────────────────────────────────────────────

	/**
	 * Requests a single reading from the given channel (1–8)
	 * by sending the "C1"–"C8" command.
	 * @throws {DigimaticError} if not connected or if the request times out
	 */
	async readChannel(channel: number): Promise<DigimaticDmx8Reading> {
		if (!this.isConnected) {
			throw new DigimaticError(
				"DMX-8/2 non connesso.",
				"CONNECTION_LOST",
			);
		}

		const cmd = `C${channel}\r\n`;

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.off("reading", handler);
				reject(
					new DigimaticError(
						`Timeout in attesa della risposta dal canale ${channel}.`,
						"TIMEOUT",
					),
				);
			}, RESPONSE_TIMEOUT_MS);

			const handler = (reading: DigimaticDmx8Reading) => {
				if (reading.channel === channel) {
					clearTimeout(timer);
					this.off("reading", handler);
					resolve(reading);
				}
			};

			this.on("reading", handler);
			this.sendCommand(cmd).catch((err) => {
				clearTimeout(timer);
				this.off("reading", handler);
				reject(err);
			});
		});
	}

	/**
	 * Starts continuous transmission from all channels.
	 * Readings are emitted via the `reading` event.
	 */
	async startContinuous(): Promise<void> {
		if (!this.isConnected) {
			throw new DigimaticError(
				"DMX-8/2 non connesso.",
				"CONNECTION_LOST",
			);
		}
		await this.sendCommand("GS\r\n");
	}

	/**
	 * Stops continuous transmission.
	 */
	async stopContinuous(): Promise<void> {
		if (!this.isConnected) {
			throw new DigimaticError(
				"DMX-8/2 non connesso.",
				"CONNECTION_LOST",
			);
		}
		await this.sendCommand("GR\r\n");
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

				console.log("[digimatic-js] dmx8 rx:", value);

				this.lineBuffer += this.decoder.decode(value);
				const lines = this.lineBuffer.split("\n");
				this.lineBuffer = lines.pop() ?? "";

				for (const line of lines) {
					this.handleLine(line.trim());
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

	private handleLine(line: string): void {
		if (!line) return;
		const reading = parseDmx8Line(line);
		if (reading) {
			this.emitter.emit("reading", reading);
		}
	}

	private async sendCommand(cmd: string): Promise<void> {
		if (!this.writer) {
			throw new DigimaticError(
				"Porta seriale non disponibile.",
				"CONNECTION_LOST",
			);
		}
		await this.writer.write(this.encoder.encode(cmd));
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
		this.port = null;
		this.reader = null;
		this.writer = null;
		this.lineBuffer = "";
	}

	private setState(state: DigimaticConnectionState): void {
		if (this._state === state) return;
		this._state = state;
		this.emitter.emit("stateChange", state);
	}

	// ─── Event API ───────────────────────────────────────────────────────────

	on<K extends keyof DigimaticDmx8Events>(
		event: K,
		listener: DigimaticEventListener<DigimaticDmx8Events[K]>,
	): this {
		this.emitter.on(event, listener);
		return this;
	}

	off<K extends keyof DigimaticDmx8Events>(
		event: K,
		listener: DigimaticEventListener<DigimaticDmx8Events[K]>,
	): this {
		this.emitter.off(event, listener);
		return this;
	}

	once<K extends keyof DigimaticDmx8Events>(
		event: K,
		listener: DigimaticEventListener<DigimaticDmx8Events[K]>,
	): this {
		this.emitter.once(event, listener);
		return this;
	}
}
