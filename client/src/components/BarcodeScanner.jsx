import { Camera, CircleAlert, ScanLine, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const cameraConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 }
  }
};

function cameraErrorMessage(error) {
  if (!window.isSecureContext) return "La cámara requiere HTTPS. Abre la aplicación desde su sitio seguro para escanear.";

  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permiso de cámara denegado. Actívalo en los ajustes del navegador o introduce el código manualmente.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No encontramos una cámara disponible en este dispositivo.";
    case "NotReadableError":
    case "TrackStartError":
      return "La cámara está siendo usada por otra aplicación. Ciérrala e inténtalo nuevamente.";
    case "OverconstrainedError":
      return "No se pudo usar la cámara trasera solicitada. Intenta de nuevo o introduce el código manualmente.";
    case "AbortError":
      return "La cámara se cerró antes de iniciar. Intenta abrir el escáner nuevamente.";
    default:
      return "No se pudo acceder a la cámara. Introduce el código manualmente.";
  }
}

export function BarcodeScanner({ onDetected, label = "Código de barras", className = "", idPrefix }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const detectionTimeoutRef = useRef(null);
  const lastRef = useRef({ code: "", at: 0 });
  const onDetectedRef = useRef(onDetected);
  const detectedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stopCamera = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (detectionTimeoutRef.current) {
      clearTimeout(detectionTimeoutRef.current);
      detectionTimeoutRef.current = null;
    }
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const emitCode = useCallback((value, source) => {
    const code = value.trim();
    if (!code) return false;

    const now = Date.now();
    if (lastRef.current.code === code && now - lastRef.current.at < 1200) {
      setStatus({ type: "info", text: "Este código ya fue detectado. Confírmalo o busca otro código." });
      return false;
    }

    lastRef.current = { code, at: now };
    setManual(code);
    onDetectedRef.current(code);
    setStatus({ type: "success", text: source === "camera" ? "Código detectado correctamente." : "Código enviado para buscar." });
    return true;
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    detectedRef.current = false;
    setCameraActive(false);

    async function startCamera() {
      if (!window.isSecureContext) {
        setStatus({ type: "error", text: "La cámara requiere HTTPS. Abre la aplicación desde su sitio seguro para escanear." });
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus({ type: "error", text: "Este navegador es incompatible con el acceso a la cámara. Introduce el código manualmente." });
        return;
      }

      setStatus({ type: "info", text: "Solicitando acceso a la cámara…" });
      try {
        const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        setCameraActive(true);

        setStatus({ type: "info", text: "Cámara activa. Coloca el código dentro del encuadre." });
        detectionTimeoutRef.current = setTimeout(() => {
          if (!cancelled && !detectedRef.current) {
            setStatus({ type: "info", text: "No se detectó un código todavía. Acércalo, mejora la iluminación o introdúcelo manualmente." });
          }
        }, 10000);

        const handleCameraCode = (value) => {
          const code = value?.trim();
          if (!code || cancelled || detectedRef.current) return false;

          detectedRef.current = true;
          if (emitCode(code, "camera")) {
            stopCamera();
            setCameraActive(false);
            setOpen(false);
            return true;
          }
          detectedRef.current = false;
          return false;
        };

        if (typeof window.BarcodeDetector !== "undefined") {
          const detector = new window.BarcodeDetector();
          const scan = async () => {
            if (cancelled || detectedRef.current || !videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (handleCameraCode(codes[0]?.rawValue)) return;
            } catch {
              // Algunos navegadores no entregan un fotograma válido durante el arranque.
            }
            frameRef.current = requestAnimationFrame(scan);
          };
          frameRef.current = requestAnimationFrame(scan);
          return;
        }

        const reader = new BrowserMultiFormatReader();
        scannerControlsRef.current = await reader.decodeFromStream(stream, video, (result) => {
          if (result) {
            handleCameraCode(result.getText());
          }
        });
        if (cancelled) {
          scannerControlsRef.current?.stop();
          scannerControlsRef.current = null;
        }
      } catch (error) {
        if (!cancelled) setStatus({ type: "error", text: cameraErrorMessage(error) });
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [emitCode, open, stopCamera]);

  function submit(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (emitCode(manual, "manual")) {
      stopCamera();
      setCameraActive(false);
      setOpen(false);
    }
  }

  function handleManualKeyDown(event) {
    if (event.key !== "Enter") return;
    submit(event);
  }

  function openCamera() {
    setCameraActive(false);
    setStatus(null);
    setOpen(true);
  }

  function closeCamera() {
    stopCamera();
    setCameraActive(false);
    setOpen(false);
    setStatus({ type: "info", text: "Cámara cerrada. Puedes introducir el código manualmente." });
  }

  const inputId = `${idPrefix || label.replace(/\W+/g, "-").toLowerCase()}-manual`;
  const statusClass = status?.type === "error" ? "field__error" : status?.type === "success" ? "barcode-scanner__success" : "field-help";

  return <div className={`barcode-scanner ${className}`.trim()}>
    <div className="barcode-scanner__manual">
      <label htmlFor={inputId}>{label}</label>
      <div className="barcode-scanner__manual-form" role="search">
        <input id={inputId} type="text" value={manual} onChange={(event) => setManual(event.target.value)} onKeyDown={handleManualKeyDown} inputMode="numeric" autoComplete="off" placeholder="Escribe o escanea el código" />
        <button type="button" className="button button--secondary" onClick={submit}><ScanLine aria-hidden="true" />Buscar</button>
      </div>
      {open ? <button type="button" className="button button--secondary" onClick={closeCamera}><X aria-hidden="true" />Cerrar cámara</button> : <button type="button" className="button button--secondary" onClick={openCamera}><Camera aria-hidden="true" />Escanear código</button>}
    </div>
    {open && <div className="barcode-scanner__camera">
      <div className="barcode-scanner__camera-heading">{cameraActive && <span className="barcode-scanner__camera-indicator" aria-hidden="true" />}<strong>{cameraActive ? "Cámara activa" : "Preparando cámara"}</strong></div>
      <video ref={videoRef} muted playsInline aria-label="Vista de cámara para escanear código" />
      {status && <p className={statusClass} role={status.type === "error" ? "alert" : "status"}>{status.type === "error" && <CircleAlert aria-hidden="true" />}{status.text}</p>}
    </div>}
    {!open && status && <p className={statusClass} role={status.type === "error" ? "alert" : "status"}>{status.type === "error" && <CircleAlert aria-hidden="true" />}{status.text}</p>}
  </div>;
}
