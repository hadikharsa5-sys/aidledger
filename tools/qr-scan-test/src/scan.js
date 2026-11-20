import { ENGINES } from "./engines.js";

const $ = (id) => document.getElementById(id);
const STORE_KEY = "mr09-results";
const PREFS_KEY = "mr09-prefs";

// ---------- storage (wrapped: private tabs can throw) ----------
function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

let results = load(STORE_KEY, []);

// ---------- device info ----------
const device = {
  userAgent: navigator.userAgent,
  cores: navigator.hardwareConcurrency ?? "?",
  memoryGB: navigator.deviceMemory ?? "?",
  screen: `${screen.width}x${screen.height} @${devicePixelRatio}x`,
  nativeBarcodeDetector: "BarcodeDetector" in window,
  secureContext: window.isSecureContext,
};
$("device").textContent = JSON.stringify(device, null, 2);

// ---------- setup form ----------
for (const [key, engine] of Object.entries(ENGINES)) {
  const opt = new Option(engine.label + (engine.available() ? "" : " — not supported here"), key);
  opt.disabled = !engine.available();
  $("engine").add(opt);
}

const prefs = load(PREFS_KEY, {});
for (const id of ["phone", "engine", "light", "card", "timeout"]) {
  if (prefs[id]) $(id).value = prefs[id];
}
// Never start on a scanner this browser can't run.
if ($("engine").selectedOptions[0]?.disabled || !$("engine").value) {
  $("engine").value = [...$("engine").options].find((o) => !o.disabled).value;
}
if (typeof prefs.auto === "boolean") $("auto").checked = prefs.auto;

function savePrefs() {
  const p = {};
  for (const id of ["phone", "engine", "light", "card", "timeout"]) p[id] = $(id).value;
  p.auto = $("auto").checked;
  save(PREFS_KEY, p);
}

// ---------- scanning session ----------
let session = null; // { handle, engineKey, cameraStartMs, settings }
let armedAt = null;
let timeoutId = null;
let autoId = null;

function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = "status " + kind;
}

function arm() {
  clearTimeout(autoId);
  armedAt = performance.now();
  setStatus("Scanning… point at the card", "armed");
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => record(false, null, "timeout"), Number($("timeout").value));
}

function record(ok, text, reason) {
  if (armedAt === null || !session) return;
  const ms = Math.round(performance.now() - armedAt);
  armedAt = null;
  clearTimeout(timeoutId);
  if (navigator.vibrate) navigator.vibrate(ok ? 80 : [60, 60, 60]);

  const s = session.settings;
  results.push({
    time: new Date().toISOString(),
    phone: $("phone").value.trim() || "unnamed phone",
    engine: session.engineKey,
    light: $("light").value,
    card: $("card").value,
    ok,
    ms: ok ? ms : null,
    gaveUpAfterMs: ok ? null : ms,
    reason: ok ? "" : reason,
    code: text ?? "",
    cameraStartMs: session.cameraStartMs,
    resolution: s.width && s.height ? `${s.width}x${s.height}` : "",
    userAgent: device.userAgent,
  });
  save(STORE_KEY, results);
  render();

  if (ok) setStatus(`✓ ${text}  —  ${(ms / 1000).toFixed(2)} s`, "ok");
  else setStatus(reason === "timeout" ? `✗ Not read in ${(ms / 1000).toFixed(0)} s` : "✗ Marked failed", "fail");

  if ($("auto").checked) autoId = setTimeout(arm, 2000);
}

function onDecode(text) {
  if (armedAt !== null) record(true, text);
}

$("startBtn").onclick = async () => {
  savePrefs();
  $("setupError").hidden = true;
  if (!window.isSecureContext) {
    showSetupError("The camera only works over HTTPS. Open the https:// address the dev server printed.");
    return;
  }
  const engineKey = $("engine").value;
  $("setup").hidden = true;
  $("scan").hidden = false;
  setStatus("Opening camera…", "idle");
  const t0 = performance.now();
  try {
    const handle = await ENGINES[engineKey].start($("viewport"), onDecode);
    const cameraStartMs = Math.round(performance.now() - t0);
    // Settings are only reliable once frames are flowing.
    await new Promise((r) => setTimeout(r, 300));
    session = { handle, engineKey, cameraStartMs, settings: handle.settings() };
    arm();
  } catch (err) {
    await stopSession();
    showSetupError(`Could not start the camera with ${engineKey}: ${err?.message ?? err}`);
  }
};

function showSetupError(msg) {
  $("setupError").textContent = msg;
  $("setupError").hidden = false;
}

async function stopSession() {
  clearTimeout(timeoutId);
  clearTimeout(autoId);
  armedAt = null;
  if (session) await session.handle.stop();
  session = null;
  $("viewport").innerHTML = "";
  $("scan").hidden = true;
  $("setup").hidden = false;
}

$("nextBtn").onclick = () => session && arm();
$("failBtn").onclick = () => record(false, null, "marked by tester");
$("stopBtn").onclick = stopSession;

// ---------- results ----------
function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pct(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
const sec = (ms) => (ms == null ? "–" : (ms / 1000).toFixed(2) + " s");

function render() {
  $("count").textContent = results.length;

  const groups = new Map();
  for (const r of results) {
    const key = [r.phone, r.engine, r.light, r.card].join(" | ");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  if (!groups.size) {
    $("summary").innerHTML = '<p class="hint">No scans yet.</p>';
  } else {
    const rows = [...groups.entries()].map(([key, rs]) => {
      const [phone, engine, light, card] = key.split(" | ");
      const ok = rs.filter((r) => r.ok).map((r) => r.ms);
      const fails = rs.length - ok.length;
      const cam = median(rs.map((r) => r.cameraStartMs));
      return `<tr>
        <td>${esc(phone)}<br><small>${esc(light)}, ${esc(card)}</small></td>
        <td>${esc(engine)}</td>
        <td>${rs.length}</td>
        <td>${Math.round((fails / rs.length) * 100)}%</td>
        <td>${sec(median(ok))}</td>
        <td>${sec(pct(ok, 90))}</td>
        <td>${sec(cam)}</td>
      </tr>`;
    });
    $("summary").innerHTML = `<div class="scroll"><table>
      <thead><tr><th>Phone / conditions</th><th>Scanner</th><th>Scans</th><th>Failed</th><th>Median</th><th>Slowest 10%</th><th>Camera start</th></tr></thead>
      <tbody>${rows.join("")}</tbody></table></div>`;
  }

  $("log").innerHTML = results.length
    ? `<div class="scroll"><table><thead><tr><th>#</th><th>Scanner</th><th>Result</th><th>Code</th></tr></thead><tbody>${results
        .map(
          (r, i) => `<tr><td>${i + 1}</td><td>${esc(r.engine)}</td><td>${
            r.ok ? sec(r.ms) : "✗ " + esc(r.reason)
          }</td><td>${esc(r.code)}</td></tr>`
        )
        .reverse()
        .join("")}</tbody></table></div>`
    : "";
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function toCsv() {
  const cols = ["time", "phone", "engine", "light", "card", "ok", "ms", "gaveUpAfterMs", "reason", "code", "cameraStartMs", "resolution", "userAgent"];
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...results.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

function csvFile() {
  const name = `mr09-${($("phone").value.trim() || "phone").replace(/\W+/g, "-")}-${Date.now()}.csv`;
  return new File([toCsv()], name, { type: "text/csv" });
}

$("downloadBtn").onclick = () => {
  const file = csvFile();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

if (navigator.canShare && navigator.canShare({ files: [new File(["x"], "x.csv", { type: "text/csv" })] })) {
  $("shareBtn").hidden = false;
  $("shareBtn").onclick = async () => {
    try {
      await navigator.share({ files: [csvFile()], title: "MR-09 scan results" });
    } catch {}
  };
}

$("sendBtn").onclick = async () => {
  if (!results.length) return alert("No scans to send yet.");
  const btn = $("sendBtn");
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    const res = await fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: $("phone").value.trim(), csv: toCsv() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.status);
    btn.textContent = `✓ Sent ${data.rows} scans`;
  } catch (err) {
    btn.textContent = "Send to laptop";
    alert("Could not send: " + (err.message || err) + "\nUse Share CSV or Download CSV instead.");
  } finally {
    btn.disabled = false;
    setTimeout(() => (btn.textContent = "Send to laptop"), 4000);
  }
};

$("clearBtn").onclick = () => {
  if (!results.length || !confirm(`Delete all ${results.length} recorded scans on this phone?`)) return;
  results = [];
  save(STORE_KEY, results);
  render();
};

render();
