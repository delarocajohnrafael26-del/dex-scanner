import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";

type Props = {
  onDetected: (code: string) => void;
  onClose: () => void;
};

export const BarcodeScanner = ({ onDetected, onClose }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastCodeRef = useRef<string>("");

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const back = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];
        if (!back) {
          setError("No camera detected.");
          return;
        }
        if (cancelled) return;
        const controls = await reader.decodeFromVideoDevice(
          back.deviceId,
          videoRef.current!,
          (result) => {
            if (result) {
              const code = result.getText();
              if (code && code !== lastCodeRef.current) {
                lastCodeRef.current = code;
                onDetected(code);
              }
            }
          }
        );
        controlsRef.current = controls;
      } catch (e: any) {
        setError(e?.message ?? "Unable to access camera.");
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-2 font-display font-semibold">
          <Camera className="h-5 w-5" />
          Scanning…
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} className="text-white hover:bg-white/10">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {/* Reticle */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-44 w-72 rounded-2xl border-2 border-primary-glow shadow-glow" />
        </div>
        {error && (
          <div className="absolute inset-x-4 bottom-24 rounded-lg bg-critical p-4 text-center text-sm text-critical-foreground">
            {error}
          </div>
        )}
        <p className="absolute bottom-8 left-0 right-0 text-center text-sm text-white/80">
          Point the camera at a barcode
        </p>
      </div>
    </div>
  );
};
