import type { DigimaticDeviceEvents, DigimaticEventListener } from "./types.js";

type EventKey = keyof DigimaticDeviceEvents;

/**
 * Minimal typed event emitter with no external dependencies.
 */
export class TypedEmitter {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private listeners: Map<EventKey, Set<DigimaticEventListener<any>>> =
		new Map();

	on<K extends EventKey>(
		event: K,
		listener: DigimaticEventListener<DigimaticDeviceEvents[K]>,
	): this {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(listener);
		return this;
	}

	off<K extends EventKey>(
		event: K,
		listener: DigimaticEventListener<DigimaticDeviceEvents[K]>,
	): this {
		this.listeners.get(event)?.delete(listener);
		return this;
	}

	once<K extends EventKey>(
		event: K,
		listener: DigimaticEventListener<DigimaticDeviceEvents[K]>,
	): this {
		const wrapper: DigimaticEventListener<DigimaticDeviceEvents[K]> = (
			payload,
		) => {
			listener(payload);
			this.off(event, wrapper);
		};
		return this.on(event, wrapper);
	}

	emit<K extends EventKey>(
		event: K,
		payload: DigimaticDeviceEvents[K],
	): void {
		this.listeners.get(event)?.forEach((fn) => fn(payload));
	}

	removeAllListeners(event?: EventKey): void {
		if (event) {
			this.listeners.delete(event);
		} else {
			this.listeners.clear();
		}
	}
}
