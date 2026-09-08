import { getAssistantBusinessContext } from "../db/assistantQueries.js";
import { generateAssistantReply } from "../services/assistantService.js";

function validHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).filter((item) =>
    item && ["user", "assistant"].includes(item.role)
    && typeof item.content === "string"
    && item.content.trim()
    && item.content.length <= 1000
  ).map((item) => ({ role: item.role, content: item.content.trim() }));
}

export async function assistantChat(req, res, next) {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 500) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Escribe una pregunta de hasta 500 caracteres.",
        fields: [{ field: "message", message: "La pregunta es obligatoria y debe tener hasta 500 caracteres." }]
      }
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const context = await getAssistantBusinessContext(req.business.id);
    const answer = await generateAssistantReply({
      message,
      history: validHistory(req.body?.history),
      context,
      role: req.membership.role,
      signal: controller.signal
    });
    return res.status(200).json({ data: answer });
  } catch (error) {
    if (error.name === "AbortError") {
      return res.status(504).json({ error: { code: "ASSISTANT_TIMEOUT", message: "El asistente tardó demasiado. Inténtalo nuevamente." } });
    }
    return next(error);
  } finally {
    clearTimeout(timeout);
  }
}
