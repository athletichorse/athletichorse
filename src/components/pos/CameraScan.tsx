"use client";

import { useEffect, useRef, useState } from "react";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

/** Scan a barcode with the device camera (browsers with BarcodeDetector: Chrome/Edge on Android and desktop). */
export function CameraScan({ label, unsupported, onCode }: { label: string; unsupported: string; onCode: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      if (!BD || !navigator.mediaDevices?.getUserMedia) { setMsg(unsupported); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const det = new BD({ formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39", "qr_code"] });
        while (!stop) {
          const found = await det.detect(video.current).catch(() => []);
          if (found[0]?.rawValue) { onCode(found[0].rawValue); setOpen(false); break; }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch { setMsg(unsupported); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [open, onCode, unsupported]);
  return (
    <>
      <button type="button" className="btn-ghost px-3" aria-label={label} title={label} onClick={() => { setMsg(""); setOpen(true); }}>📷</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-3" onClick={(e) => e.stopPropagation()}>
            {msg ? <p className="p-4 text-sm text-gray-700">{msg}</p> : <video ref={video} className="w-full rounded-lg bg-black" playsInline muted />}
            <button type="button" className="btn-ghost mt-2 w-full" onClick={() => setOpen(false)}>×</button>
          </div>
        </div>
      )}
    </>
  );
}
