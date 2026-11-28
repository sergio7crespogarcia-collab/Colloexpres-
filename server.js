// COLLOEXPRES AI backend. Keep OPENAI_API_KEY on the server; never expose it in browser code.
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({ limit: "9mb" }));
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


app.post("/api/analyze-product", async (req, res) => {
  try {
    const image = req.body?.image;
    const mimeType = req.body?.mimeType;
    if (typeof image !== "string" || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      return res.status(400).json({ error: "Haz una foto en formato JPG, PNG o WEBP." });
    }
    if (image.length > 8_000_000) return res.status(413).json({ error: "La foto pesa demasiado. Inténtalo con una imagen más pequeña." });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "El análisis automático aún no está activado: falta configurar OPENAI_API_KEY en el servidor." });

    const visionModel = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
    const upstream = await fetch(API_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: visionModel,
        instructions: `Analizas fotografías de alimentos y productos de supermercado para COLLOEXPRES (España y Portugal). Sé prudente: una imagen NO permite certificar seguridad, frescura interna ni ausencia de bacterias. Evalúa solo señales visibles. No inventes datos ilegibles. Si no se ve bien, usa "no_determinado". Devuelve SOLO JSON con esta estructura: {"product":"nombre identificado o No identificado","brand":"marca visible o No visible","condition":"aparentemente_bien | señales_de_alerta | no_determinado","visible_signs":["señales observables concretas"],"advice":"consejo breve y prudente","price_status":"no_disponible","price_message":"Precio no disponible: todavía no hay un precio real verificado para este producto."}. Señales de alerta posibles: moho visible, envase hinchado, fuga, rotura, deterioro visible. No infieras estado interno por apariencia exterior.`,
        input: [{ role: "user", content: [
          { type: "input_text", text: "Analiza este producto. Identifica alimento y marca si son visibles y revisa únicamente señales externas visibles de deterioro o daños." },
          { type: "input_image", image_url: `data:${mimeType};base64,${image}`, detail: "high" }
        ]}],
        text: { format: { type: "json_object" } },
        max_output_tokens: 500
      })
    });
    const payload = await upstream.json();
    if (!upstream.ok) return res.status(502).json({ error: payload?.error?.message || "No se pudo analizar la foto." });
    const outputText = (payload.output || []).flatMap(part => part.content || []).filter(part => part.type === "output_text").map(part => part.text).join("\n");
    if (!outputText) return res.status(502).json({ error: "El análisis no devolvió un resultado." });
    const parsed = JSON.parse(outputText);
    return res.json({
      product: String(parsed.product || "No identificado"),
      brand: String(parsed.brand || "No visible"),
      condition: ["aparentemente_bien", "señales_de_alerta", "no_determinado"].includes(parsed.condition) ? parsed.condition : "no_determinado",
      visible_signs: Array.isArray(parsed.visible_signs) ? parsed.visible_signs.slice(0, 6).map(String) : [],
      advice: String(parsed.advice || "No se puede confirmar la seguridad del alimento mediante una foto."),
      price_status: "no_disponible",
      price_message: "Precio no disponible: todavía no hay un precio real verificado para este producto."
    });
  } catch (err) {
    console.error("Product photo analysis failed:", err.message);
    return res.status(500).json({ error: "No se pudo analizar la foto. Inténtalo de nuevo." });
  }
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


app.post("/api/generate-menu", async (req, res) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt || prompt.length > 2000) return res.status(400).json({ error: "Describe el menú en un máximo de 2.000 caracteres." });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "Falta configurar OPENAI_API_KEY en Render." });
    const instructions = `Eres el planificador de comidas de COLLOEXPRES para hogares de España y Portugal.
Crea un menú semanal de lunes a domingo con comida y cena. Adapta recetas, presupuesto, personas, alergias y preferencias indicadas por el usuario. Si faltan datos, propone platos sencillos, variados y económicos. No afirmes que un plato es apto para alergias si no puedes garantizarlo; indica que hay que revisar etiquetas y contaminación cruzada.
Devuelve exclusivamente JSON con esta forma:
{"summary":"resumen breve","days":[{"day":"Lunes","lunch":"plato","dinner":"plato"}],"shopping_list":[{"name":"producto","quantity":"cantidad aproximada"}]}
Incluye siete días y una lista de compra consolidada. No incluyas precios ni marcas.`;
    const upstream = await fetch(API_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, instructions,
        input: `Responde en formato JSON. Necesidades para el menú: ${prompt}`,
        text: { format: { type: "json_object" } }, max_output_tokens: 2200
      })
    });
    const payload = await upstream.json();
    if (!upstream.ok) return res.status(502).json({ error: payload?.error?.message || "El proveedor de IA devolvió un error." });
    const outputText = (payload.output || []).flatMap(part => part.content || []).filter(part => part.type === "output_text").map(part => part.text).join("\\n");
    if (!outputText) return res.status(502).json({ error: "La IA no devolvió un menú utilizable." });
    const parsed = JSON.parse(outputText);
    const days = Array.isArray(parsed.days) ? parsed.days.slice(0, 7) : [];
    const shopping_list = Array.isArray(parsed.shopping_list) ? parsed.shopping_list.slice(0, 60).filter(x => x && typeof x.name === "string" && x.name.trim()) : [];
    return res.json({ summary: String(parsed.summary || "Menú semanal preparado."), days, shopping_list });
  } catch (err) {
    console.error("Menu generation failed:", err.message);
    return res.status(500).json({ error: "No se pudo generar el menú. Inténtalo de nuevo." });
  }
});

const port = Number(process.env.PORT || 10000);
app.listen(port, "0.0.0.0", () => console.log(`COLLOEXPRES listening on port ${port}`));
