import { DigimaticManager } from "@lgtm/digimatic-js";

const manager = new DigimaticManager();
const simDevices = new Map(); // id → intervalId

const deviceList = document.getElementById("device-list");
const readingsGrid = document.getElementById("readings-grid");
const readingsEmpty = document.getElementById("readings-empty");
const log = document.getElementById("log");
const btnConnect = document.getElementById("btn-connect");
const btnDiscAll = document.getElementById("btn-disconnect-all");
const btnSimulate = document.getElementById("btn-simulate");

// Support badge
const badge = document.getElementById("support-badge");
if ("serial" in navigator) {
	badge.textContent = "Web Serial ✓";
	badge.className = "badge support-ok";
} else {
	badge.textContent = "Web Serial ✗";
	badge.className = "badge support-no";
	btnConnect.disabled = true;
}

// ── Logging ──────────────────────────────────────────────────────────────────
function logLine(eventName, body) {
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
	while (log.children.length > 100) log.removeChild(log.lastChild);
}

// ── Device sidebar ───────────────────────────────────────────────────────────
function renderDeviceList() {
	const ids = [
		...Array.from(manager.getDevices().keys()),
		...Array.from(simDevices.keys()),
	];
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
function getOrCreateCard(deviceId) {
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

function updateCard(deviceId, { value, unit, hold, negative }) {
	const card = getOrCreateCard(deviceId);
	const valEl = card.querySelector(".reading-value");
	const metaEl = card.querySelector(".reading-meta");
	valEl.childNodes[0].textContent = value.toFixed(4);
	valEl.querySelector(".unit").textContent = " " + unit;
	const tags = [];
	if (hold) tags.push(`<span class="tag tag-hold">HOLD</span>`);
	if (negative) tags.push(`<span class="tag tag-neg">NEG</span>`);
	metaEl.innerHTML = tags.join("");
	card.classList.add("fresh");
	setTimeout(() => card.classList.remove("fresh"), 400);
}

function removeCard(deviceId) {
	document.getElementById(`card-${deviceId}`)?.remove();
}

// ── Manager readings ─────────────────────────────────────────────────────────
manager.onReading((id, reading) => {
	updateCard(id, reading);
	logLine(
		"measurement",
		`[${id}] ${reading.value.toFixed(4)} ${reading.unit}${reading.hold ? " HOLD" : ""}`,
	);
});

// ── Buttons ──────────────────────────────────────────────────────────────────
btnConnect.addEventListener("click", async () => {
	try {
		const id = await manager.addDevice();
		const device = manager.getDevice(id);
		device.on("stateChange", (state) => {
			if (state === "disconnected" || state === "error") {
				removeCard(id);
				renderDeviceList();
				logLine("disconnect", `id="${id}"`);
			}
		});
		device.on("error", (err) => {
			logLine("error", `[${id}] ${err.message}`);
		});
		renderDeviceList();
		getOrCreateCard(id);
		logLine("connect", `id="${id}"`);
	} catch (err) {
		logLine("error", err.message);
	}
});

btnDiscAll.addEventListener("click", async () => {
	await manager.disconnectAll();
	for (const [id, intervalId] of simDevices) {
		clearInterval(intervalId);
		removeCard(id);
		logLine("disconnect", `id="${id}"`);
	}
	simDevices.clear();
	renderDeviceList();
});

// ── Simulator ────────────────────────────────────────────────────────────────
let simCounter = 0;
btnSimulate.addEventListener("click", () => {
	const id = `sim-${++simCounter}`;
	let base = parseFloat((Math.random() * 50).toFixed(3));
	const intervalId = setInterval(
		() => {
			base += (Math.random() - 0.5) * 0.1;
			const reading = {
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
