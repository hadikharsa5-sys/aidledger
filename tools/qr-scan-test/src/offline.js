// MR-09 offline storage test.
// Checks, on a real phone, whether the browser keeps (1) an offline copy of
// the page via a service worker and (2) data in IndexedDB after the phone is
// locked, loses signal, or Chrome is restarted.

const $ = (id) => document.getElementById(id);
const DB_NAME = "mr09-offline";
const LOG_KEY = "mr09-offline-log";
const PHONE_KEY = "mr09-prefs";

// ---------- small helpers ----------
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
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Share the phone name with the scan test page.
const prefs = load(PHONE_KEY, {});
$("phone").value = prefs.phone ?? "";
$("phone").onchange = () => save(PHONE_KEY, { ...load(PHONE_KEY, {}), phone: $("phone").value.trim() });

// ---------- IndexedDB ----------
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("pickups", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function countPickups() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("pickups").objectStore("pickups").count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function savePickups(n) {
  const db = await openDb();
  const tx = db.transaction("pickups", "readwrite");
  const store = tx.objectStore("pickups");
  const base = Date.now();
  for (let i = 0; i < n; i++) {
    // Same shape a real offline pickup would have. Fake codes only.
    store.put({
      id: `${base}-${i}`,
      householdCode: `AL-TEST-${String(i + 1).padStart(4, "0")}`,
      roundId: "test-round",
      recordedAt: new Date(base + i).toISOString(),
      synced: false,
    });
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function clearPickups() {
  const db = await openDb();
  const tx = db.transaction("pickups", "readwrite");
  tx.objectStore("pickups").clear();
  return new Promise((resolve) => (tx.oncomplete = resolve));
}

// ---------- status ----------
async function status() {
  const s = {
    online: navigator.onLine,
    secureContext: window.isSecureContext,
    serviceWorkerSupported: "serviceWorker" in navigator,
    serviceWorkerActive: !!navigator.serviceWorker?.controller,
    indexedDbAvailable: "indexedDB" in window,
    savedPickups: null,
    storagePersisted: null,
    storageUsedKB: null,
    storageQuotaMB: null,
  };
  try {
    s.savedPickups = await countPickups();
  } catch (e) {
    s.savedPickups = "error: " + (e?.message ?? e);
  }
  try {
    s.storagePersisted = await navigator.storage?.persisted?.();
    const est = await navigator.storage?.estimate?.();
    if (est) {
      s.storageUsedKB = Math.round(est.usage / 1024);
      s.storageQuotaMB = Math.round(est.quota / 1024 / 1024);
    }
  } catch {}
  return s;
}

async function renderStatus() {
  const s = await status();
  const row = (label, value, good) =>
    `<tr><td>${label}</td><td class="${good === undefined ? "" : good ? "good" : "bad"}"><b>${esc(value)}</b></td></tr>`;
  $("status").innerHTML = `<table>
    ${row("Signal", s.online ? "Online" : "Offline (no signal)")}
    ${row("Offline cache (service worker)", s.serviceWorkerActive ? "Active" : s.serviceWorkerSupported ? "Not active yet" : "Not supported", s.serviceWorkerActive)}
    ${row("Database (IndexedDB)", s.indexedDbAvailable ? "Available" : "Missing", s.indexedDbAvailable)}
    ${row("Test pickups saved", s.savedPickups ?? "–", s.savedPickups === 50)}
    ${row("Chrome keeps data (persisted)", s.storagePersisted === null ? "Unknown" : s.storagePersisted ? "Yes" : "No (may be cleared if space is low)")}
    ${row("Storage used / available", s.storageUsedKB === null ? "Unknown" : `${s.storageUsedKB} KB / ${s.storageQuotaMB} MB`)}
  </table>`;
  $("loadedFrom").textContent = s.online
    ? "Page loaded with signal."
    : "You're offline and this page still opened, so the offline cache works.";
  return s;
}

// ---------- results log ----------
let log = load(LOG_KEY, []);

async function record(check, extra = "") {
  const s = await renderStatus();
  const pass =
    check === "saved"
      ? s.savedPickups === 50
      : check === "after-lock" || check === "after-restart"
        ? s.savedPickups === 50
        : check === "while-offline"
          ? !s.online && s.savedPickups === 50
          : true;
  log.push({
    time: new Date().toISOString(),
    phone: $("phone").value.trim() || "unnamed phone",
    check,
    pass,
    online: s.online,
    serviceWorkerActive: s.serviceWorkerActive,
    savedPickups: s.savedPickups,
    storagePersisted: s.storagePersisted,
    storageQuotaMB: s.storageQuotaMB,
    details: extra,
    userAgent: navigator.userAgent,
  });
  save(LOG_KEY, log);
  renderLog();
}

function renderLog() {
  $("log").innerHTML = log.length
    ? `<div class="scroll"><table><thead><tr><th>Check</th><th>Result</th><th>Pickups</th><th>Offline cache</th><th>Details</th></tr></thead><tbody>${log
        .map(
          (r) => `<tr><td>${esc(r.check)}</td><td class="${r.pass ? "good" : "bad"}">${r.pass ? "✓ pass" : "✗ fail"}</td><td>${esc(
            r.savedPickups
          )}</td><td>${r.serviceWorkerActive ? "active" : "not active"}</td><td>${esc(r.details)}</td></tr>`
        )
        .join("")}</tbody></table></div>`
    : '<p class="hint">No checks yet.</p>';
}

function toCsv() {
  const cols = ["time", "phone", "check", "pass", "online", "serviceWorkerActive", "savedPickups", "storagePersisted", "storageQuotaMB", "details", "userAgent"];
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...log.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

// ---------- buttons ----------
$("swBtn").onclick = async () => {
  if (!("serviceWorker" in navigator)) return record("offline-cache-on", "service workers not supported");
  try {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    // The page is controlled after the next load; reload once so the check is real.
    if (!navigator.serviceWorker.controller) {
      save("mr09-sw-reload", true);
      location.reload();
      return;
    }
    record("offline-cache-on", "registered");
  } catch (err) {
    // Expected on a self-signed certificate: Chrome refuses service workers there.
    record("offline-cache-on", "FAILED: " + (err?.message ?? err));
  }
};

$("saveBtn").onclick = async () => {
  await clearPickups();
  await savePickups(50);
  record("saved", "50 test pickups written");
};
$("afterLockBtn").onclick = () => record("after-lock");
$("afterOfflineBtn").onclick = () => record("while-offline");
$("afterRestartBtn").onclick = () => record("after-restart");

$("persistBtn").onclick = async () => {
  const granted = await navigator.storage?.persist?.();
  record("persist-request", granted ? "granted" : "not granted");
};

$("sendBtn").onclick = async () => {
  if (!log.length) return alert("No checks recorded yet.");
  try {
    const res = await fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "offline-" + ($("phone").value.trim() || "phone"), csv: toCsv() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.status);
    $("sendBtn").textContent = `✓ Sent ${data.rows} checks`;
  } catch (err) {
    alert("Could not send (are you back online?): " + (err?.message ?? err) + "\nUse Download CSV instead.");
  }
};

$("downloadBtn").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([toCsv()], { type: "text/csv" }));
  a.download = `mr09-offline-${($("phone").value.trim() || "phone").replace(/\W+/g, "-")}.csv`;
  a.click();
};

$("resetBtn").onclick = async () => {
  if (!confirm("Delete the 50 test pickups and the results on this phone?")) return;
  await clearPickups();
  log = [];
  save(LOG_KEY, log);
  renderLog();
  renderStatus();
};

window.addEventListener("online", renderStatus);
window.addEventListener("offline", renderStatus);

// ---------- start ----------
renderLog();
renderStatus().then(() => {
  if (load("mr09-sw-reload", false)) {
    save("mr09-sw-reload", false);
    record("offline-cache-on", navigator.serviceWorker?.controller ? "registered" : "registered but not controlling the page");
  }
});
