import { Camera, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function BarcodeScanner({ onDetected, label = "Código de barras", className = "", idPrefix }) {
  const videoRef = useRef(null); const streamRef = useRef(null); const frameRef = useRef(null); const lastRef = useRef({ code: "", at: 0 });
  const [open, setOpen] = useState(false); const [manual, setManual] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()); if (frameRef.current) cancelAnimationFrame(frameRef.current); }, []);
  useEffect(() => {
    if (!open || !videoRef.current) return undefined;
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) { setMessage("La cámara no está disponible. Introduce el código manualmente."); return undefined; }
    let active = true;
    const detector = new window.BarcodeDetector();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }).then((stream) => {
      if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream; videoRef.current.srcObject = stream; return videoRef.current.play();
    }).then(() => {
      const scan = async () => { if (!active || !videoRef.current) return; try { const codes = await detector.detect(videoRef.current); const code = codes[0]?.rawValue?.trim(); if (code && (lastRef.current.code !== code || Date.now() - lastRef.current.at > 1200)) { lastRef.current = { code, at: Date.now() }; onDetected(code); setManual(code); setMessage("Código detectado correctamente."); } } catch { /* La cámara puede no entregar un fotograma válido todavía. */ } frameRef.current = requestAnimationFrame(scan); }; scan();
    }).catch(() => setMessage("No se pudo acceder a la cámara. Introduce el código manualmente."));
    return () => { active = false; streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [open, onDetected]);
  function submit(event) { event.preventDefault(); const code = manual.trim(); if (!code) return; lastRef.current = { code, at: Date.now() }; onDetected(code); setMessage("Código enviado para buscar."); }
  function handleManualKeyDown(event) { if (event.key !== "Enter") return; submit(event); }
  const inputId = `${idPrefix || label.replace(/\W+/g, "-").toLowerCase()}-manual`;
  return <div className={`barcode-scanner ${className}`.trim()}><div className="barcode-scanner__manual"><label htmlFor={inputId}>{label}</label><div className="barcode-scanner__manual-form" role="search"><input id={inputId} value={manual} onChange={(event) => setManual(event.target.value)} onKeyDown={handleManualKeyDown} inputMode="numeric" autoComplete="off" placeholder="Escribe o escanea el código" /><button type="button" className="button button--secondary" onClick={submit}><ScanLine aria-hidden="true" />Buscar</button></div><button type="button" className="button button--secondary" onClick={() => { setOpen((value) => !value); setMessage(""); }}>{open ? <><X aria-hidden="true" />Cerrar cámara</> : <><Camera aria-hidden="true" />Escanear código</>}</button></div>{open && <div className="barcode-scanner__camera"><video ref={videoRef} muted playsInline aria-label="Vista de cámara para escanear código" />{message && <p role="status">{message}</p>}</div>}{!open && message && <p className="field-help" role="status">{message}</p>}</div>;
}
