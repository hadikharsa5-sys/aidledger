// Three ways to read a QR code from the phone camera in the browser.
// Each engine has the same shape:
//   start(container, onDecode) -> Promise<{ stop(), settings() }>
// onDecode(text) may fire many times per second; the caller decides which
// decodes count.

import QrScanner from "qr-scanner";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const CAMERA = {
  facingMode: "environment",
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

function trackSettings(container) {
  const video = container.querySelector("video");
  const track = video?.srcObject?.getVideoTracks?.()[0];
  return track ? track.getSettings() : {};
}

function makeVideo(container) {
  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.muted = true;
  container.appendChild(video);
  return video;
}

export const ENGINES = {
  "html5-qrcode": {
    label: "html5-qrcode (pure JS decoder)",
    available: () => true,
    async start(container, onDecode) {
      const el = document.createElement("div");
      el.id = "h5q-" + Date.now();
      container.appendChild(el);
      const scanner = new Html5Qrcode(el.id, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        // Force its own JS decoder so we measure the library, not Chrome.
        experimentalFeatures: { useBarCodeDetectorIfSupported: false },
      });
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => onDecode(text),
        () => {}
      );
      return {
        settings: () => trackSettings(container),
        async stop() {
          try {
            await scanner.stop();
          } catch {}
          scanner.clear();
        },
      };
    },
  },

  "qr-scanner": {
    label: "qr-scanner (web worker, uses native when available)",
    available: () => true,
    async start(container, onDecode) {
      const video = makeVideo(container);
      const scanner = new QrScanner(video, (r) => onDecode(r.data), {
        returnDetailedScanResult: true,
        preferredCamera: "environment",
        maxScansPerSecond: 10,
        highlightScanRegion: true,
      });
      await scanner.start();
      return {
        settings: () => trackSettings(container),
        async stop() {
          scanner.stop();
          scanner.destroy();
        },
      };
    },
  },

  native: {
    label: "Native BarcodeDetector (built into Chrome)",
    available: () => "BarcodeDetector" in window,
    async start(container, onDecode) {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (!formats.includes("qr_code")) {
        throw new Error("This browser's BarcodeDetector cannot read QR codes");
      }
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: CAMERA });
      const video = makeVideo(container);
      video.srcObject = stream;
      await video.play();

      let running = true;
      const loop = async () => {
        if (!running) return;
        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            if (codes.length) onDecode(codes[0].rawValue);
          }
        } catch {}
        setTimeout(loop, 100); // ~10 attempts per second, same as the others
      };
      loop();

      return {
        settings: () => trackSettings(container),
        async stop() {
          running = false;
          stream.getTracks().forEach((t) => t.stop());
          video.remove();
        },
      };
    },
  },
};
