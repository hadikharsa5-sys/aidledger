import QRCode from "qrcode";

const $ = (id) => document.getElementById(id);

// Crockford-style alphabet: no I, L, O, U, so codes are easy to read aloud
// and type into the search fallback.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => ALPHABET[b % 32]).join("");
  return `AL-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

let codes = [];

function makeCodes() {
  codes = Array.from({ length: Number($("count").value) }, randomCode);
}

async function render() {
  const sizeMm = Number($("size").value) / 10;
  document.documentElement.style.setProperty("--qr", `${sizeMm}cm`);
  const cards = await Promise.all(
    codes.map(async (code, i) => {
      const svg = await QRCode.toString(code, {
        type: "svg",
        errorCorrectionLevel: $("ecc").value,
        margin: 2,
      });
      return `<div class="card">
        <div class="qr">${svg}</div>
        <div class="meta">
          <strong>AidLedger</strong>
          <span>TEST CARD ${i + 1}</span>
          <code>${code}</code>
          <small>ECC ${$("ecc").value} · ${sizeMm} cm</small>
        </div>
      </div>`;
    })
  );
  $("sheet").innerHTML = cards.join("");
}

$("count").onchange = () => { makeCodes(); render(); };
$("size").onchange = render;
$("ecc").onchange = render;
$("regen").onclick = () => { makeCodes(); render(); };
$("print").onclick = () => window.print();

makeCodes();
render();
