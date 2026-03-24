import type { DigimaticReading } from "./types.js";
import { DigimaticError } from "./types.js";

/**
 * Length of a complete Digimatic packet (in nibbles/bytes).
 *
 * The Digimatic SPC protocol transmits 13 ASCII bytes (representing nibbles),
 * each encoding 4 bits of data:
 *
 *  Byte 0      : flags (bit 3 = negative sign)
 *  Bytes 1–6   : 6 decimal digits of the value (low nibble)
 *  Byte 7      : decimal point position (low nibble)
 *  Byte 8      : unit flag (bit 0: 0=mm, 1=inch) + other flags
 *  Bytes 9–12  : checksum / padding
 */
export const PACKET_SIZE = 13;

/**
 * Parses a raw Digimatic packet (13 bytes) and returns a reading.
 *
 * @throws {DigimaticError} if the packet has the wrong size or contains invalid data
 */
export function parsePacket(
	data: Uint8Array,
	timestamp?: number,
): DigimaticReading {
	if (data.length !== PACKET_SIZE) {
		throw new DigimaticError(
			`Wrong packet size: expected ${PACKET_SIZE} bytes, got ${data.length}`,
			"PARSE_ERROR",
		);
	}

	// Nibble 0: flags
	// Bit 3 of nibble 0 indicates the sign (1 = negative)
	const signFlag = data[0]! & 0x08;
	const sign = signFlag ? -1 : 1;

	// Nibbles 1–6: decimal digits (low nibble of each byte)
	let digitStr = "";
	for (let i = 1; i <= 6; i++) {
		const nibble = data[i]! & 0x0f;
		if (nibble > 9) {
			throw new DigimaticError(
				`Invalid digit at byte ${i}: 0x${nibble.toString(16)}`,
				"PARSE_ERROR",
			);
		}
		digitStr += nibble.toString();
	}

	// Nibble 7: decimal point position
	const decimalPos = data[7]! & 0x0f;

	// Nibble 8: unit flag (bit 0 = 0 → mm, 1 → inch)
	const unitFlag = data[8]! & 0x01;
	const unit: "mm" | "in" = unitFlag === 0 ? "mm" : "in";

	const rawInt = parseInt(digitStr, 10);
	if (isNaN(rawInt)) {
		throw new DigimaticError(
			`Non-numeric value in packet: "${digitStr}"`,
			"PARSE_ERROR",
		);
	}

	const value = (rawInt / Math.pow(10, decimalPos)) * sign;

	return {
		value,
		unit,
		timestamp: timestamp ?? Date.now(),
		raw: data.slice(),
	};
}

/**
 * Accumulates incoming bytes in a buffer and extracts complete packets.
 * Handles fragmented streams (common with USB-serial adapters).
 */
export class PacketAccumulator {
	private buffer: number[] = [];

	/**
	 * Pushes new bytes and returns all complete packets found.
	 */
	push(bytes: Uint8Array): Uint8Array[] {
		for (const byte of bytes) {
			this.buffer.push(byte);
		}
		return this.extractPackets();
	}

	private extractPackets(): Uint8Array[] {
		const packets: Uint8Array[] = [];

		while (this.buffer.length >= PACKET_SIZE) {
			// Look for a valid packet start: the first byte must have
			// a high nibble of 0 (Digimatic flag byte).
			// This allows re-sync in case of corrupted data.
			const startIndex = this.findPacketStart();

			if (startIndex === -1) {
				// No valid start found: flush the buffer keeping only
				// the last (PACKET_SIZE - 1) bytes (they might be the
				// start of a future packet).
				this.buffer = this.buffer.slice(-(PACKET_SIZE - 1));
				break;
			}

			// Discard bytes before the packet start
			if (startIndex > 0) {
				this.buffer = this.buffer.slice(startIndex);
			}

			// Not enough bytes for a complete packet yet
			if (this.buffer.length < PACKET_SIZE) break;

			const packetBytes = new Uint8Array(
				this.buffer.slice(0, PACKET_SIZE),
			);
			packets.push(packetBytes);
			this.buffer = this.buffer.slice(PACKET_SIZE);
		}

		return packets;
	}

	/**
	 * Cerca il primo byte valido come inizio pacchetto Digimatic.
	 * Il nibble alto del primo byte deve essere 0 (flag byte standard).
	 */
	private findPacketStart(): number {
		for (let i = 0; i < this.buffer.length; i++) {
			// The high nibble of the Digimatic flag byte is always 0
			if ((this.buffer[i]! & 0xf0) === 0x00) {
				return i;
			}
		}
		return -1;
	}

	/** Clears the internal buffer (e.g. after a disconnection). */
	reset(): void {
		this.buffer = [];
	}
}
