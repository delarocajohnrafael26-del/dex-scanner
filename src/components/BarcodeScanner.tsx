import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Camera, X, Zap, ZapOff, RotateCw, Loader2 } from "lucide-react";

type Props = {
  onDetected: (code: string) => void;
  onClose: () => void;
};

const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
];

type Status = "starting" | "no-camera" | "ready" | "scanning" | "found" | "error";

export const BarcodeScanner = ({ onDetected, onClose }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const confidenceRef = useRef<{ code: string; count: number }>({ code: "", count: 0 });

  const [status, setStatus] = useState<Status>("starting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [engine, setEngine] = useState<"native" | "zxing" | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIdx, setDeviceIdx] = useState(0);
  const [fps, setFps] = useState(0);

  // Tap-to-focus
  const onTapVideo = async (e: React.MouseEvent) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // @ts-expect-error non-standard
      await track.applyConstraints({ advanced: [{ focusMode: "single-shot" }] });
      setTimeout(() => {
        // @ts-expect-error non-standard
        track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      }, 800);
    } catch {}
  };

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    zxingControlsRef.current?.stop();
    zxingControlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const fire = (code: string) => {
    if (firedRef.current) return;
    const buf = confidenceRef.current;
    if (buf.code === code) buf.count += 1;
    else confidenceRef.current = { code, count: 1 };
    // 12+ digit retail barcodes (EAN/UPC) have built-in checksums — 1 read is reliable.
    const threshold = code.length >= 12 ? 1 : 2;
    if (confidenceRef.current.count >= threshold) {
      firedRef.current = true;
      setStatus("found");
      console.log("[scanner] locked:", code);
      if (navigator.vibrate) navigator.vibrate([60, 30, 30]);
      setTimeout(() => onDetected(code), 120);
    }
  };

  const startStream = async (deviceId?: string) => {
    cleanup();
    const baseVideo: any = deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: { ideal: "environment" } };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { ...baseVideo, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: false,
      });
    } catch {
      console.warn("[scanner] HD failed, trying 1280x720");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { ...baseVideo, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        console.warn("[scanner] 720p failed, falling back to default");
        stream = await navigator.mediaDevices.getUserMedia({ video: baseVideo, audio: false });
      }
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.setAttribute("playsinline", "true");
      await videoRef.current.play().catch((e) => console.warn("[scanner] play() failed", e));
    }
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings?.() ?? {};
    console.log("[scanner] camera:", settings.width, "x", settings.height, "@", settings.frameRate, "fps");
    const caps: any = track.getCapabilities?.() ?? {};
    setTorchSupported(!!caps.torch);
    setTorchOn(false);
    try {
      // @ts-expect-error non-standard
      await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
    } catch {}
    return stream;
  };

  const startNative = async (Detector: any) => {
    const detector = new Detector({ formats: NATIVE_FORMATS });
    let lastTime = performance.now();
    let frames = 0;
    setStatus("scanning");
    const tick = async () => {
      if (firedRef.current || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        frames++;
        const now = performance.now();
        if (now - lastTime > 500) {
          setFps(Math.round((frames * 1000) / (now - lastTime)));
          frames = 0;
          lastTime = now;
        }
        if (codes && codes.length > 0) {
          const v = codes[0].rawValue?.trim();
          if (v) fire(v);
        }
      } catch {}
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const startZxing = async () => {
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints as any, {
      delayBetweenScanAttempts: 60,
      delayBetweenScanSuccess: 300,
    });
    setStatus("scanning");
    const controls = await reader.decodeFromStream(streamRef.current!, videoRef.current!, (result) => {
      if (firedRef.current || !result) return;
      const code = result.getText().trim();
      if (code) fire(code);
    });
    zxingControlsRef.current = controls;
    setFps(0);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Permission warm-up to get device labels
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          tmp.getTracks().forEach((t) => t.stop());
        } catch (e: any) {
          setStatus("error");
          setErrorMsg(e?.message ?? "Camera permission denied. Allow camera access in your browser settings.");
          return;
        }
        const all = (await BrowserMultiFormatReader.listVideoInputDevices()).filter((d) => d.kind === "videoinput");
        const sorted = [
          ...all.filter((d) => /back|rear|environment/i.test(d.label)),
          ...all.filter((d) => !/back|rear|environment|front|user|face/i.test(d.label)),
          ...all.filter((d) => /front|user|face/i.test(d.label)),
        ];
        if (cancelled) return;
        setDevices(sorted);
        if (!sorted.length) {
          setStatus("no-camera");
          return;
        }
        await startStream(sorted[0].deviceId);

        // Pick engine
        // @ts-expect-error - native BarcodeDetector is not in lib.dom yet
        const Detector = window.BarcodeDetector;
        if (Detector) {
          try {
            const supported: string[] = await Detector.getSupportedFormats?.() ?? NATIVE_FORMATS;
            // require at least one product format
            const ok = NATIVE_FORMATS.some((f) => supported.includes(f));
            if (ok) {
              setEngine("native");
              await startNative(Detector);
              return;
            }
          } catch {}
        }
        setEngine("zxing");
        await startZxing();
      } catch (e: any) {
        setStatus("error");
        setErrorMsg(e?.message ?? "Unable to start scanner.");
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // @ts-expect-error non-standard
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
    setStatus("starting");
    firedRef.current = false;
    confidenceRef.current = { code: "", count: 0 };
    await startStream(devices[next].deviceId);
    // @ts-expect-error
    const Detector = window.BarcodeDetector;
    if (engine === "native" && Detector) await startNative(Detector);
    else await startZxing();
  };

  const statusBadge = (() => {
    switch (status) {
      case "starting":
        return { color: "bg-white/20 text-white", text: "Starting camera…", pulse: true };
      case "scanning":
        return {
          color: "bg-primary/90 text-primary-foreground",
          text: `Scanning${engine === "native" ? " · native" : " · ZXing"}${fps ? ` · ${fps} fps` : ""}`,
          pulse: true,
        };
      case "found":
        return { color: "bg-safe text-safe-foreground", text: "Detected!", pulse: false };
      case "no-camera":
        return { color: "bg-critical text-critical-foreground", text: "No camera", pulse: false };
      case "error":
        return { color: "bg-critical text-critical-foreground", text: "Error", pulse: false };
      default:
        return { color: "bg-white/20 text-white", text: "Ready", pulse: false };
    }
  })();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusBadge.color}`}
          >
            {statusBadge.pulse && <Loader2 className="h-3 w-3 animate-spin" />}
            {statusBadge.text}
          </span>
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
        <video
          ref={videoRef}
          onClick={onTapVideo}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Reticle */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={`relative h-44 w-72 rounded-2xl border-2 transition-colors ${
              status === "found" ? "border-safe shadow-[0_0_40px_hsl(var(--safe))]" : "border-primary-glow shadow-glow"
            }`}
          >
            {/* Animated scan line */}
            {status === "scanning" && (
              <div className="absolute inset-x-3 top-0 h-0.5 animate-[scanline_1.4s_ease-in-out_infinite] bg-primary-glow shadow-[0_0_12px_hsl(var(--primary-glow))]" />
            )}
            {/* Corners */}
            {(["tl", "tr", "bl", "br"] as const).map((c) => (
              <span
                key={c}
                className={`absolute h-5 w-5 ${
                  status === "found" ? "border-safe" : "border-primary"
                } ${
                  c === "tl" ? "left-0 top-0 border-l-4 border-t-4" :
                  c === "tr" ? "right-0 top-0 border-r-4 border-t-4" :
                  c === "bl" ? "bottom-0 left-0 border-b-4 border-l-4" :
                  "bottom-0 right-0 border-b-4 border-r-4"
                }`}
              />
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="absolute inset-x-4 bottom-24 rounded-lg bg-critical p-4 text-center text-sm text-critical-foreground">
            {errorMsg}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs text-white/80">
          <p>Hold steady · fill the box with the barcode · tap screen to focus</p>
        </div>
      </div>

      <style>{`
        @keyframes scanline {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(160px); opacity: 1; }
        }
      `}</style>
    </div>
  );
};
