import { Bot, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/client.js";

const greeting = { role: "assistant", content: "Hola. Puedo ayudarte con stock, ventas, movimientos y el uso de la aplicación." };

export function AssistantChat({ businessId }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([greeting]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    setMessages([greeting]);
    setOpen(false);
  }, [businessId]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function submit(event) {
    event.preventDefault();
    const message = input.trim();
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

  return <div className="assistant-chat">
    {open && <section className="assistant-chat__panel" role="dialog" aria-label="Asistente de inventario">
      <header><div><Bot aria-hidden="true" /><strong>Asistente</strong></div><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar asistente"><X aria-hidden="true" /></button></header>
      <div className="assistant-chat__messages" aria-live="polite">
        {messages.map((item, index) => <p key={index} className={`assistant-chat__message assistant-chat__message--${item.role}`}>{item.content}</p>)}
        {pending && <p className="assistant-chat__message assistant-chat__message--assistant">Pensando…</p>}
        <span ref={endRef} />
      </div>
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="assistant-question">Pregunta al asistente</label>
        <input id="assistant-question" value={input} onChange={(event) => setInput(event.target.value)} maxLength={500} placeholder="Pregunta por stock o ventas…" disabled={pending} />
        <button type="submit" disabled={pending || !input.trim()} aria-label="Enviar pregunta"><Send aria-hidden="true" /></button>
      </form>
      <small>Solo consulta. No realiza cambios.</small>
    </section>}
    <button type="button" className="assistant-chat__launcher" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Cerrar asistente" : "Abrir asistente"}><Bot aria-hidden="true" /><span>Asistente</span></button>
  </div>;
}
