"use client";

import { useEffect, useRef, useState } from "react";
import { ScanBarcode, X } from "lucide-react";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

/**
 * Barcode scanner for the phone browser (as the app's scanner): the camera reads an EAN / Code 128
 * and the catalog searches it. Only shown where the browser has BarcodeDetector (Chrome on Android);
 * elsewhere the button is hidden — typing the barcode into search works everywhere.
 */
export function ScanButton({ onCode }: { onCode: (code: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  // the latest callback without restarting the camera on every parent render
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current || stop) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = new Ctor({ formats: ["ean_13", "ean_8", "code_128", "upc_a", "upc_e"] });
        while (!stop) {
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) {
            if (navigator.vibrate) navigator.vibrate(60);
            onCodeRef.current(codes[0].rawValue);
            setOpen(false);
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setError("Нет доступа к камере. Разрешите его в настройках браузера.");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  if (!supported) return null;
  return (
    <>
      <button type="button" className="app-search__go" aria-label="Сканировать штрихкод" title="Сканировать штрихкод" onClick={() => { setError(""); setOpen(true); }}>
        <ScanBarcode size={22} />
      </button>
      {open ? (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4" role="dialog" aria-label="Сканер штрихкода">
          <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white" aria-label="Закрыть">
            <X size={24} />
          </button>
          {error ? (
            <p className="max-w-xs text-center text-white">{error}</p>
          ) : (
            <>
              <video ref={video} playsInline muted className="w-full max-w-md rounded-2xl" />
              <p className="mt-4 text-center text-sm text-white/80">Наведите камеру на штрихкод товара</p>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
