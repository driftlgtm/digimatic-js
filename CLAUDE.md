# CLAUDE.md

## Project

TypeScript/browser library for communicating with Mitutoyo Digimatic SPC instruments via the Web Serial API. Published on JSR as `@lgtm/digimatic-js`.

## Commands

```bash
pnpm dev          # Vite dev server for the demo (localhost:5173)
pnpm build:demo   # Build the demo to demo/dist/
pnpm tsc --noEmit # Type check (no build output)
pnpx jsr publish  # Publish to JSR
```

## Architecture

- `src/device.ts` — `DigimaticDevice`: single Digimatic instrument over Web Serial. Passive reader (device pushes 13-byte binary packets when DATA is pressed).
- `src/manager.ts` — `DigimaticManager`: manages multiple `DigimaticDevice` instances, each on its own serial port.
- `src/dmx8.ts` — `DigimaticDmx8`: Mitutoyo DMX-8/2 multiplexer. ASCII text protocol, bidirectional (send commands, receive responses). Supports poll mode (`C1`–`C8`) and continuous mode (`GS`/`GR`).
- `src/parser.ts` — Binary packet parser for the raw Digimatic SPC protocol (13-byte packets).
- `src/emitter.ts` — `TypedEmitter<TEvents>`: minimal generic typed event emitter, no external dependencies.
- `src/types.ts` — Shared interfaces and types.
- `src/index.ts` — Public exports.
- `demo/` — Vite demo app using `DigimaticDmx8`. Entry point: `demo/index.html`.
- `vite.config.js` — Aliases `@lgtm/digimatic-js` to `./src/index.ts` for local development.
- `tsconfig.json` — `noEmit: true`. Covers both `src/` and `demo/`. Includes `paths` mapping for `@lgtm/digimatic-js`.

## DMX-8/2 protocol

- Serial: 9600 baud, 8 data bits, 1 stop bit, no parity, no flow control
- Poll command: `C1\r\n` – `C8\r\n`
- Continuous start/stop: `GS\r\n` / `GR\r\n`
- Response format: `{channel} MW {signed_value} {unit}\r\n` (e.g. `1 MW +001.378 mm`)

## Notes

- The library targets browser environments only (Web Serial API). No Node.js support.
- `DigimaticDevice` uses the raw SPC binary protocol (7 data bits, even parity). `DigimaticDmx8` uses ASCII text (8 data bits, no parity) — do not mix them up.
- JSR publishes TypeScript sources directly (`exports: ./src/index.ts`). The `demo/` folder is excluded from the package.
