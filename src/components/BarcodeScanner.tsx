import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Camera, X, Zap, ZapOff, RotateCw } from "lucide-react";

type Props = {
  onDetected: (code: string) => void;
  onClose: () => void;
};

// Restrict to retail/product formats — faster + fewer false reads.
const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

export const BarcodeScanner = ({ onDetected, onClose }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIdx, setDeviceIdx] = useState(0);

  // Confidence buffer: require 2 consistent reads in a row before firing.
  const lastCodeRef = useRef<string>("");
  const confidenceRef = useRef<{ code: string; count: number }>({ code: "", count: 0 });
  const firedRef = useRef(false);

  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 80,
      delayBetweenScanSuccess: 300,
    });
    let cancelled = false;

    const start = async () => {
      try {
        // Get permission first so device labels populate.
        const tmp = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        tmp.getTracks().forEach((t) => t.stop());

        const all = (await BrowserMultiFormatReader.listVideoInputDevices()).filter(
          (d) => d.kind === "videoinput"
        );
        // Prefer back/rear/environment, then any others as fallbacks.
        const sorted = [
          ...all.filter((d) => /back|rear|environment/i.test(d.label)),
          ...all.filter((d) => !/back|rear|environment/i.test(d.label) && !/front|user|face/i.test(d.label)),
          ...all.filter((d) => /front|user|face/i.test(d.label)),
        ];
        if (cancelled) return;
        setDevices(sorted);
        if (!sorted.length) {
          setError("No camera detected.");
          return;
        }
        await openCamera(reader, sorted[0].deviceId);
      } catch (e: any) {
        setError(e?.message ?? "Unable to access camera.");
      }
    };

    const openCamera = async (
      reader: BrowserMultiFormatReader,
      deviceId: string
    ) => {
      controlsRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());

      // Request high-res stream so small/distant barcodes resolve.
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
          // @ts-expect-error - non-standard but supported on most mobile browsers
          focusMode: "continuous",
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Detect torch capability
      const track = stream.getVideoTracks()[0];
      const caps: any = track.getCapabilities?.() ?? {};
      setTorchSupported(!!caps.torch);
      setTorchOn(false);

      const controls = await reader.decodeFromStream(
        stream,
        videoRef.current!,
        (result) => {
          if (firedRef.current || !result) return;
          const code = result.getText().trim();
          if (!code) return;
          const buf = confidenceRef.current;
          if (buf.code === code) {
            buf.count += 1;
          } else {
            confidenceRef.current = { code, count: 1 };
          }
          if (confidenceRef.current.count >= 2 && code !== lastCodeRef.current) {
            firedRef.current = true;
            lastCodeRef.current = code;
            // Haptic + audio feedback
            if (navigator.vibrate) navigator.vibrate(60);
            onDetected(code);
          }
        }
      );
      controlsRef.current = controls;
    };

    start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // @ts-expect-error - torch is a non-standard MediaTrackConstraint
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(!torchOn);
    } catch {
      setTorchSupported(false);
    }
  };

  const switchCamera = async () => {
    if (devices.length < 2) return;
    const next = (deviceIdx + 1) % devices.length;
    setDeviceIdx(next);
    const reader = new BrowserMultiFormatReader(
      new Map([
        [DecodeHintType.POSSIBLE_FORMATS, FORMATS],
        [DecodeHintType.TRY_HARDER, true],
      ])
    );
    try {
      controlsRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: devices[next].deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      const controls = await reader.decodeFromStream(stream, videoRef.current!, (result) => {
        if (firedRef.current || !result) return;
        const code = result.getText().trim();
        const buf = confidenceRef.current;
        if (buf.code === code) buf.count += 1;
        else confidenceRef.current = { code, count: 1 };
        if (confidenceRef.current.count >= 2) {
          firedRef.current = true;
          if (navigator.vibrate) navigator.vibrate(60);
          onDetected(code);
        }
      });
      controlsRef.current = controls;
    } catch (e: any) {
      setError(e?.message ?? "Camera switch failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-2 font-display font-semibold">
          <Camera className="h-5 w-5" />
          Scanning…
        </div>
        <div className="flex items-center gap-1">
          {devices.length > 1 && (
            <Button size="icon" variant="ghost" onClick={switchCamera} className="text-white hover:bg-white/10">
              <RotateCw className="h-5 w-5" />
            </Button>
          )}
          {torchSupported && (
            <Button size="icon" variant="ghost" onClick={toggleTorch} className="text-white hover:bg-white/10">
              {torchOn ? <ZapOff className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onClose} className="text-white hover:bg-white/10">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
        {/* Reticle */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-44 w-72 rounded-2xl border-2 border-primary-glow shadow-glow">
            {/* Scan line */}
            <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-primary-glow/80" />
            {/* Corners */}
            {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((c) => (
              <span
                key={c}
                className={`absolute h-5 w-5 border-primary ${
                  c === "top-left" ? "left-0 top-0 border-l-4 border-t-4" :
                  c === "top-right" ? "right-0 top-0 border-r-4 border-t-4" :
                  c === "bottom-left" ? "bottom-0 left-0 border-b-4 border-l-4" :
                  "bottom-0 right-0 border-b-4 border-r-4"
                }`}
              />
            ))}
          </div>
        </div>
        {error && (
          <div className="absolute inset-x-4 bottom-24 rounded-lg bg-critical p-4 text-center text-sm text-critical-foreground">
            {error}
          </div>
        )}
        <p className="absolute bottom-8 left-0 right-0 text-center text-sm text-white/80">
          Hold steady · fill the frame with the barcode
        </p>
      </div>
    </div>
  );
};
