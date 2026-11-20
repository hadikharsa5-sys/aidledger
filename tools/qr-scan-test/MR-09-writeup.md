# MR-09 – QR scanning on low-end Android (write-up)

**Ticket:** KAN-44 / MR-09 · **Owner:** Mahmoud · **Sprint 2**
**Acceptance criteria:** short write-up with chosen library and scan times; fallback plan if scanning is slow.

> Fill in the `___` parts after testing. Delete this line before posting.

## 1. What we tested

Three ways to scan a QR code in the phone's browser (no app install):

1. **html5-qrcode** – the library suggested in the ticket (pure JavaScript decoder)
2. **qr-scanner** – smaller library, decodes off the main thread, uses the built-in detector when available
3. **Native BarcodeDetector** – built into Chrome on Android, no library

Test app: `tools/qr-scan-test` in the repo. Cards: random codes like `AL-7K3M-Q9TX`, QR ___ cm, error correction ___, printed on plain paper.

## 2. Phones

| | Phone 1 | Phone 2 |
| --- | --- | --- |
| Model | ___ | ___ |
| Android / Chrome version | ___ | ___ |
| RAM / cores (from "This device") | ___ | ___ |
| Native detector available? | ___ | ___ |
| Camera resolution used | ___ | ___ |

## 3. Results (indoor, printed card, 20 scans each)

"Median" = typical scan. "Slowest 10%" = how bad the bad scans get. Failure = not read within 10 s.

| Scanner | Phone 1 median | Phone 1 slowest 10% | Phone 1 failed | Phone 2 median | Phone 2 slowest 10% | Phone 2 failed | Camera start |
| --- | --- | --- | --- | --- | --- | --- | --- |
| html5-qrcode | ___ | ___ | ___ | ___ | ___ | ___ | ___ |
| qr-scanner | ___ | ___ | ___ | ___ | ___ | ___ | ___ |
| Native | ___ | ___ | ___ | ___ | ___ | ___ | ___ |

**Harder conditions (best scanner only, 10 scans each):**

| Condition | Phone 1 median / failed | Phone 2 median / failed |
| --- | --- | --- |
| Dim light | ___ | ___ |
| Outdoor sun | ___ | ___ |
| Crumpled card | ___ | ___ |

Raw CSVs: attached to the ticket.

## 4. Decision

**Chosen:** ___

How we decided: the brief's target is a full pickup in **under 20 seconds**, so the scan
itself should take about 2 s or less. Among scanners with ≤ 5% failures on both phones, pick
the lowest median. If two are close, prefer the smaller download (qr-scanner is far lighter than html5-qrcode).

Reason in one or two sentences: ___

## 5. Fallback plan if scanning is slow or fails

In order of what the volunteer does at the table:

1. **Search instead of scan.** One tap opens search by name, phone, or card code. This is MR-13's
   fallback anyway, and it must answer in under 1 second.
2. **Type the code.** Codes use only easy characters (no I, L, O, U) and are split
   `AL-XXXX-XXXX`, so they're quick to read aloud and type.
3. **Torch button** on the scan screen for dim halls, if the phone supports it.
4. **Bigger, simpler QR.** If small cards fail, print the QR at ___ cm and/or use error correction ___.
5. **Keep the camera open** between households. Opening the camera took ___ s on the slow
   phone, so the scan screen should not close and reopen it for every family.
6. If a phone is still too slow: **mark it "search only"** and use it for search while
   faster phones scan.

## 6. Notes for MR-13 (scan screen)

- Use ___ with `maxScansPerSecond` / `fps` ≈ 10.
- Camera needs HTTPS on phones, so the demo deployment must be HTTPS. Vercel is fine.
- Cards should hold only the random code, never names or phone numbers.
- ___
