import { DigimaticDmx8, DigimaticDmx8Reading } from "@lgtm/digimatic-js";

interface CardReading {
	value: number;
	unit: string;
	hold: boolean;
	negative: boolean;
}

const dmx = new DigimaticDmx8();
const simDevices = new Map<string, ReturnType<typeof setInterval>>();

const deviceList = document.getElementById("device-list")!;
const readingsGrid = document.getElementById("readings-grid")!;
const readingsEmpty = document.getElementById("readings-empty")!;
const log = document.getElementById("log")!;
const btnConnect = document.getElementById("btn-connect") as HTMLButtonElement;
const btnDiscAll = document.getElementById(
	"btn-disconnect-all",
) as HTMLButtonElement;
const btnSimulate = document.getElementById(
	"btn-simulate",
) as HTMLButtonElement;

// Support badge
const badge = document.getElementById("support-badge")!;
if ("serial" in navigator) {
	badge.textContent = "Web Serial ✓";
	badge.className = "badge support-ok";
} else {
	badge.textContent = "Web Serial ✗";
	badge.className = "badge support-no";
	btnConnect.disabled = true;
}

// ── Logging ──────────────────────────────────────────────────────────────────
function logLine(eventName: string, body: string) {
	const now = new Date();
	const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}.${String(now.getMilliseconds()).padStart(3, "0")}`;
	const line = document.createElement("div");
	line.className = "log-line";
	line.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-event ev-${eventName}">${eventName}</span>
    <span class="log-body">${body}</span>
  `;
	log.prepend(line);
	while (log.children.length > 100) log.removeChild(log.lastChild!);
}

// ── Device sidebar ───────────────────────────────────────────────────────────
function renderDeviceList() {
	const ids: string[] = [];
	if (dmx.isConnected) ids.push("DMX-8/2");
	ids.push(...simDevices.keys());

	if (ids.length === 0) {
		deviceList.innerHTML =
			'<div class="empty-state">No devices connected</div>';
		readingsEmpty.style.display = "";
		btnDiscAll.disabled = true;
		return;
	}
	readingsEmpty.style.display = "none";
	btnDiscAll.disabled = false;
	deviceList.innerHTML = ids
		.map(
			(id) => `
    <div class="device-item">
      <div class="dot"></div>
      <div class="device-id">${id}</div>
    </div>
  `,
		)
		.join("");
}

// ── Readings cards ───────────────────────────────────────────────────────────
function getOrCreateCard(deviceId: string) {
	let card = document.getElementById(`card-${deviceId}`);
	if (!card) {
		card = document.createElement("div");
		card.className = "reading-card";
		card.id = `card-${deviceId}`;
		card.innerHTML = `
      <div class="reading-label">${deviceId}</div>
      <div class="reading-value">—<span class="unit"></span></div>
      <div class="reading-meta"></div>
    `;
		readingsGrid.appendChild(card);
	}
	return card;
}

function updateCard(
	deviceId: string,
	{ value, unit, hold, negative }: CardReading,
) {
	const card = getOrCreateCard(deviceId);
	const valEl = card.querySelector(".reading-value");
	const metaEl = card.querySelector(".reading-meta");
	valEl!.childNodes[0].textContent = value.toFixed(4);
	valEl!.querySelector(".unit")!.textContent = " " + unit;
	const tags = [];
	if (hold) tags.push(`<span class="tag tag-hold">HOLD</span>`);
	if (negative) tags.push(`<span class="tag tag-neg">NEG</span>`);
	metaEl!.innerHTML = tags.join("");
	card.classList.add("fresh");
	setTimeout(() => card.classList.remove("fresh"), 400);
}

function removeCard(deviceId: string) {
	document.getElementById(`card-${deviceId}`)?.remove();
}

// ── DMX-8/2 events ───────────────────────────────────────────────────────────
dmx.on("reading", (r: DigimaticDmx8Reading) => {
	const id = `ch${r.channel}`;
	updateCard(id, {
		value: r.value,
		unit: r.unit,
		hold: false,
		negative: r.value < 0,
	});
	logLine("measurement", `[CH${r.channel}] ${r.value.toFixed(4)} ${r.unit}`);
});

dmx.on("stateChange", (state) => {
	if (state === "disconnected" || state === "error") {
		for (let i = 1; i <= 8; i++) removeCard(`ch${i}`);
		renderDeviceList();
		btnConnect.disabled = false;
		setPollButtonsEnabled(false);
		logLine("disconnect", "DMX-8/2");
	}
});

dmx.on("error", (err) => {
	logLine("error", err.message);
});

// ── Buttons ──────────────────────────────────────────────────────────────────
btnConnect.addEventListener("click", async () => {
	try {
		await dmx.connect();
		await dmx.startContinuous();
		renderDeviceList();
		btnConnect.disabled = true;
		setPollButtonsEnabled(true);
		logLine("connect", "DMX-8/2");
	} catch (err) {
		logLine("error", (err as Error).message);
	}
});

btnDiscAll.addEventListener("click", async () => {
	if (dmx.isConnected) {
		await dmx.disconnect();
		for (let i = 1; i <= 8; i++) removeCard(`ch${i}`);
	}
	for (const [id, intervalId] of simDevices) {
		clearInterval(intervalId);
		removeCard(id);
		logLine("disconnect", `id="${id}"`);
	}
	simDevices.clear();
	renderDeviceList();
	btnConnect.disabled = false;
});

// ── Poll buttons ─────────────────────────────────────────────────────────────
const pollButtons = document.querySelectorAll<HTMLButtonElement>(".btn-poll");

function setPollButtonsEnabled(enabled: boolean) {
	pollButtons.forEach((btn) => (btn.disabled = !enabled));
}

pollButtons.forEach((btn) => {
	btn.addEventListener("click", async () => {
		const channel = parseInt(btn.dataset.channel!);
		btn.disabled = true;
		try {
			const reading = await dmx.readChannel(channel);
			updateCard(`ch${reading.channel}`, {
				value: reading.value,
				unit: reading.unit,
				hold: false,
				negative: reading.value < 0,
			});
		} catch (err) {
			logLine("error", (err as Error).message);
		} finally {
			btn.disabled = !dmx.isConnected;
		}
	});
});

// ── Simulator ────────────────────────────────────────────────────────────────
let simCounter = 0;
btnSimulate.addEventListener("click", () => {
	const id = `sim-${++simCounter}`;
	let base = parseFloat((Math.random() * 50).toFixed(3));
	const intervalId = setInterval(
		() => {
			base += (Math.random() - 0.5) * 0.1;
			const reading: CardReading = {
				value: parseFloat(base.toFixed(4)),
				unit: "mm",
				hold: false,
				negative: base < 0,
			};
			updateCard(id, reading);
			logLine(
				"measurement",
				`[${id}] ${reading.value.toFixed(4)} ${reading.unit}`,
			);
		},
		1000 + Math.random() * 500,
	);
	simDevices.set(id, intervalId);
	renderDeviceList();
	getOrCreateCard(id);
	logLine("connect", `id="${id}" (simulated)`);
});
