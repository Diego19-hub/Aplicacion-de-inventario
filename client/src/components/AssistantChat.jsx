import { Bot, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/client.js";

const greeting = { role: "assistant", content: "Hola. Puedo ayudarte con stock, ventas, movimientos y el uso de la aplicación." };
const suggestions = [
  "¿Cuánto inventario tengo?",
  "¿Cómo van mis ventas?",
  "Últimos movimientos",
  "Ayuda con FIFO"
];

export function AssistantChat({ businessId }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([greeting]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    window.clearTimeout(closeTimerRef.current);
    setMessages([greeting]);
    setOpen(false);
    setClosing(false);
  }, [businessId]);

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open, pending]);

  async function sendMessage(value) {
    const message = value.trim();
    if (!message || pending) return;
    const history = messages.slice(-6);
    setMessages((current) => [...current, { role: "user", content: message }]);
    setInput("");
    setPending(true);
    try {
      const data = await apiRequest("/assistant/chat", { method: "POST", csrf: true, body: { message, history } });
      setMessages((current) => [...current, { role: "assistant", content: data.message }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: error.message || "No pude responder en este momento." }]);
    } finally {
      setPending(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    sendMessage(input);
  }

  const showSuggestions = messages.length === 1;

  function closePanel() {
    if (closing) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 140);
  }

  function togglePanel() {
    if (open) return closePanel();
    window.clearTimeout(closeTimerRef.current);
    setClosing(false);
    setOpen(true);
  }

  return <div className="assistant-chat">
    {open && <section id="assistant-chat-panel" className={`assistant-chat__panel${closing ? " assistant-chat__panel--closing" : ""}`} role="dialog" aria-labelledby="assistant-chat-title" aria-modal="false">
      <header className="assistant-chat__header">
        <div className="assistant-chat__identity">
          <span className="assistant-chat__icon"><Bot aria-hidden="true" /></span>
          <span><strong id="assistant-chat-title">Asistente de inventario</strong><small>Solo lectura</small></span>
        </div>
        <button type="button" className="assistant-chat__close" onClick={closePanel} aria-label="Cerrar asistente" title="Cerrar asistente"><X aria-hidden="true" /></button>
      </header>
      <div className="assistant-chat__messages" role="log" aria-live="polite" aria-relevant="additions text" aria-busy={pending}>
        {messages.map((item, index) => <p key={index} className={`assistant-chat__message assistant-chat__message--${item.role}`}>{item.content}</p>)}
        {pending && <p className="assistant-chat__message assistant-chat__message--assistant assistant-chat__thinking"><span>Pensando</span><i aria-hidden="true"><b /><b /><b /></i></p>}
        <span ref={endRef} />
      </div>
      {showSuggestions && <div className="assistant-chat__suggestions" aria-label="Preguntas rápidas">
        {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => sendMessage(suggestion)} disabled={pending}>{suggestion}</button>)}
      </div>}
      <form className="assistant-chat__form" onSubmit={submit}>
        <label className="sr-only" htmlFor="assistant-question">Pregunta al asistente</label>
        <input id="assistant-question" value={input} onChange={(event) => setInput(event.target.value)} maxLength={500} placeholder="Escribe tu pregunta…" disabled={pending} aria-describedby="assistant-chat-notice" />
        <button type="submit" disabled={pending || !input.trim()} aria-label="Enviar pregunta" title="Enviar pregunta"><Send aria-hidden="true" /></button>
      </form>
      <small id="assistant-chat-notice" className="assistant-chat__notice">El asistente consulta información, pero no realiza cambios.</small>
    </section>}
    <button type="button" className="assistant-chat__launcher" onClick={togglePanel} aria-expanded={open} aria-controls="assistant-chat-panel" aria-label={open ? "Cerrar asistente" : "Abrir asistente"}><Bot aria-hidden="true" /><span>Asistente</span></button>
  </div>;
}
