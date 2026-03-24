import type { DigimaticEventListener } from "./types.js";

/**
 * Minimal typed event emitter with no external dependencies.
 */
export class TypedEmitter<TEvents extends object> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private listeners: Map<keyof TEvents, Set<DigimaticEventListener<any>>> =
		new Map();

	on<K extends keyof TEvents>(
		event: K,
		listener: DigimaticEventListener<TEvents[K]>,
	): this {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(listener);
		return this;
	}

	off<K extends keyof TEvents>(
		event: K,
		listener: DigimaticEventListener<TEvents[K]>,
	): this {
		this.listeners.get(event)?.delete(listener);
		return this;
	}

	once<K extends keyof TEvents>(
		event: K,
		listener: DigimaticEventListener<TEvents[K]>,
	): this {
		const wrapper: DigimaticEventListener<TEvents[K]> = (payload) => {
			listener(payload);
			this.off(event, wrapper);
		};
		return this.on(event, wrapper);
	}

	emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
		this.listeners.get(event)?.forEach((fn) => fn(payload));
	}

	removeAllListeners(event?: keyof TEvents): void {
		if (event) {
			this.listeners.delete(event);
		} else {
			this.listeners.clear();
		}
	}
}
