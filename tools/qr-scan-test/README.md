# MR-09 spike: QR scanning on low-end Android

Throwaway test app for Jira KAN-44 / MR-09. It compares three ways of reading a QR code
from the phone camera in the browser and times every scan:

| Scanner | What it is |
| --- | --- |
| `html5-qrcode` | The library named in the ticket. Pure JavaScript decoder (forced, so we measure the library itself). |
| `qr-scanner` | Smaller library, decodes in a web worker, and switches to the phone's built-in detector when it can. |
| `native` | Chrome's built-in `BarcodeDetector`. No library at all. Only shows up if the phone supports it. |

Not part of the Next.js app (separate `package.json`, run it from this folder). The winner gets used in MR-13 (scan screen).

## Run it

```bash
npm install
npm run dev
```

The terminal prints several `Network:` addresses. Use the one labelled **Wi-Fi**,
e.g. `https://192.168.10.188:5173`.

1. Put the phone on the **same Wi-Fi** as the laptop.
   University or café Wi-Fi often blocks devices from seeing each other. If the page
   won't load, turn on the phone's hotspot and connect the laptop to it instead.
2. If Windows asks whether Node.js may use the network, allow **Private networks**.
3. On the phone, open the `https://...:5173` address in **Chrome**.
4. Chrome warns the connection isn't private (the certificate is self-signed).
   Tap **Advanced → Proceed**. This is expected and only for this test.
5. Allow camera access when asked.

The camera only works over HTTPS on a phone, which is why the dev server uses a
self-signed certificate.

## Test cards

Open **Test cards** (`/cards.html`) on the laptop and print one sheet. Each card has a random
code like `AL-7K3M-Q9TX` and no personal data, the same way real cards should work.
You can also scan cards straight off the laptop screen, but record that as "On a screen".

## How to test (per phone)

1. Type the phone model and Android version in **Phone**.
2. For **each scanner**: open camera, then scan 20 cards in a row. With "Next scan starts
   by itself" on, the next timer starts 2 s after each read. Just move to the next card.
3. Repeat the best scanner in **Dim** light and **Outdoor sun** (10 scans each).
4. Try one crumpled card.
5. Tap **Share CSV** (or Download CSV) and send it to yourself on WhatsApp.

What counts as one scan: from the moment the status turns blue to the moment the code is
read. It includes aiming, like a real volunteer would. Anything over the "give up" time
counts as a failure.

Results are saved on the phone, so closing the tab doesn't lose them.
**Clear all** wipes them.

## Files

- `src/engines.js` – the three scanners behind one `start(container, onDecode)` shape
- `src/scan.js` – timing, results table, CSV export
- `src/cards.js` – printable test cards
- `MR-09-writeup.md` – the write-up to fill in and attach to the ticket
