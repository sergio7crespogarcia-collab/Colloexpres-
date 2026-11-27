// COLLOEXPRES AI backend. Keep OPENAI_API_KEY on the server; never expose it in browser code.
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname)));

const requestWindows = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
app.use("/api", (req, res, next) => {
  if (req.path === "/health") return next();
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const current = requestWindows.get(ip);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(ip, { startedAt: now, count: 1 });
    return next();
  }
  current.count += 1;
  if (current.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: "Has enviado demasiadas solicitudes. Espera un minuto y vuelve a intentarlo." });
  }
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "COLLOEXPRES" }));

const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const API_URL = "https://api.openai.com/v1/responses";

app.post("/api/interpret-list", async (req, res) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt || prompt.length > 3000) {
      return res.status(400).json({ error: "Escribe una descripción de compra de hasta 3.000 caracteres." });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "La IA todavía no está activada: falta configurar OPENAI_API_KEY en el servidor." });
    }

    const instructions = `Eres el asistente de listas de compra de COLLOEXPRES para España y Portugal.
Convierte la petición del usuario en una lista práctica de productos. Interpreta cantidades y formatos solo cuando estén claros.
No inventes marcas, precios, supermercados, ofertas ni información nutricional. Si la cantidad no está especificada, usa una cantidad razonable para la necesidad descrita y marca quantity_inferred=true.
Devuelve exclusivamente un objeto JSON con esta forma:
{"summary":"resumen breve en español","items":[{"name":"nombre canónico del producto","quantity":"cantidad si procede","size":"formato/unidad si procede","category":"categoría","quantity_inferred":false}]}
Máximo 35 productos. No incluyas precios. Si la petición no trata de compra, devuelve items vacío y explica brevemente en summary.`;

    const upstream = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        instructions,
        input: `Responde en formato JSON. Solicitud del usuario: ${prompt}`,
        text: { format: { type: "json_object" } },
        max_output_tokens: 1200
      })
    });

    const payload = await upstream.json();
    if (!upstream.ok) {
      const message = payload?.error?.message || "El proveedor de IA devolvió un error.";
      return res.status(502).json({ error: message });
    }

    const outputText = (payload.output || [])
      .flatMap(part => part.content || [])
      .filter(part => part.type === "output_text")
      .map(part => part.text)
      .join("\n");
    if (!outputText) return res.status(502).json({ error: "La IA no devolvió una respuesta utilizable." });

    let parsed;
    try { parsed = JSON.parse(outputText); }
    catch { return res.status(502).json({ error: "La respuesta de IA no tenía un formato válido." }); }

    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 35).filter(x => x && typeof x.name === "string" && x.name.trim()) : [];
    return res.json({ summary: String(parsed.summary || "Lista organizada."), items });
  } catch (err) {
    console.error("AI request failed:", err.message);
    return res.status(500).json({ error: "No se pudo completar la petición de IA. Inténtalo de nuevo." });
  }
});

const port = Number(process.env.PORT || 10000);
app.listen(port, "0.0.0.0", () => console.log(`COLLOEXPRES listening on port ${port}`));
