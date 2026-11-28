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



/* Pepa: asistente de COLLOEXPRES con acciones limitadas y confirmadas por el usuario */
app.post("/api/pepa", async (req, res) => {
  try {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message || message.length > 2000) return res.status(400).json({ error: "Escribe un mensaje de hasta 2.000 caracteres." });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "Pepa aún no está activada: falta configurar OPENAI_API_KEY en Render." });
    const contextItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 80).map(x => ({name:String(x.name||"").slice(0,100),done:!!x.done})) : [];
    const lastRecipe = typeof req.body?.last_recipe === "string" ? req.body.last_recipe.trim().slice(0,180) : "";
    const weeklyMenu = Array.isArray(req.body?.weekly_menu) ? req.body.weekly_menu.slice(0,14).map(d => ({day:String(d.day||"").slice(0,40),meals:Array.isArray(d.meals)?d.meals.slice(0,4).map(x=>String(x).slice(0,180)):[]})) : [];
    const page = String(req.body?.page || "0").slice(0,2);
    const instructions = `IDIOMA OBLIGATORIO: responde SIEMPRE en español, nunca en inglés ni en otro idioma, incluso si el mensaje del usuario contiene palabras en inglés. Usa español de España claro, natural y sencillo. Te llamas Pepa y eres una ayudante de confianza, cariñosa, resolutiva y con iniciativa para COLLOEXPRES. Tu carácter: como una abuelita amable y sensata, paciente, optimista y práctica; cercana sin infantilizar ni resultar pesada. No te limites a obedecer: cuando detectes una oportunidad útil, ofrece espontáneamente una recomendación concreta para mejorar el menú, ahorrar tiempo o dinero, aprovechar alimentos, equilibrar comidas o completar la lista. Da una recomendación breve y explica por qué ayuda. Si la persona pide consejo, mójate con una recomendación razonada y adapta la respuesta a sus preferencias y presupuesto. Si hay varias opciones, recomienda una como primera opción y menciona brevemente una alternativa. No inventes precios, disponibilidad, vídeos concretos, datos de supermercados ni información personal que no conozcas. No presupongas alergias, dieta ni presupuesto: pregunta si son importantes. Advierte con tacto cuando una propuesta pueda ser poco adecuada o cuando falte información; nunca presentes una suposición como un hecho. No repitas consejos en cada mensaje ni fuerces recomendaciones cuando no aporten valor. Ayuda con planificación de menús, ideas de recetas, listas y navegación. Para recetas de vídeo usa la acción show_youtube que abre resultados de YouTube. Puedes decidir una sola acción entre: navigate, add_items, generate_menu, show_youtube, show_list, amazon_search, none. Ejecuta acciones cuando la persona las pida claramente; si la acción implica añadir productos, hazlo solo cuando lo haya solicitado. No elimines ni marques productos como comprados. No prometas controlar otras apps ni enviar notificaciones nativas. Devuelve SOLO JSON: {"reply":"respuesta breve y útil, incluyendo una recomendación cuando sea pertinente","action":"none|navigate|add_items|generate_menu|show_youtube|show_list|amazon_search","parameters":{}}. navigate parameters.page debe ser uno de: inicio, hacer menú, menú semanal, comparación, cesta, cámara. add_items parameters.items es una lista de objetos {"name":"producto","quantity":"cantidad opcional"}. generate_menu parameters.prompt contiene las preferencias indicadas. show_youtube parameters.query contiene el plato. Si la persona dice que le gusta la receta que estaba viendo y last_recipe contiene el nombre del plato, interpreta que quiere prepararla: devuelve action add_items con una lista razonable de ingredientes habituales para esa receta (sin inventar marcas ni cantidades exactas si no son conocidas) y explica en reply que puede revisar la lista. Si no hay receta identificada, pregunta qué plato es y deja action none. No afirmes que has comparado precios reales: la comparación de supermercados de esta versión no dispone de conexión verificada a precios actuales; indícalo con claridad y ofrece organizar la lista para comparar cuando haya precios fiables. Si la persona dice que le gusta un menú para esta semana, y weekly_menu contiene platos visibles, prepara una lista consolidada de ingredientes habituales para los platos indicados usando action add_items; si dice todos, incluye todos los platos visibles. Evita duplicados y no inventes cantidades precisas. Si weekly_menu está vacío, pregunta qué menú o platos quiere guardar. Si pide abrir Amazon o buscar los productos, usa action amazon_search con parameters.query construido a partir de la lista de la compra pendiente; explica que abrirás Amazon España para que revise resultados y los añada manualmente a su cesta. No afirmes que puedes iniciar sesión, seleccionar variantes, comprar ni añadir artículos a la cesta de Amazon automáticamente. amazon_search parameters.query contiene los términos de búsqueda de los productos. Si faltan datos esenciales, pregunta en reply y deja action none. `;
    const upstream = await fetch(API_URL, {method:"POST",headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:MODEL,instructions:instructions+"\n\nLa respuesta debe ser un objeto json válido.",input:"Responde en formato json usando el esquema indicado. Mensaje y contexto del usuario: "+JSON.stringify({message,shopping_list:contextItems,current_page:page,last_recipe:lastRecipe,weekly_menu:weeklyMenu}),max_output_tokens:700})});
    const payload = await upstream.json();
    if (!upstream.ok) return res.status(502).json({error:payload?.error?.message||"Pepa no pudo conectarse con la IA."});
    const outputText=(payload.output||[]).flatMap(part=>part.content||[]).filter(part=>part.type==="output_text").map(part=>part.text).join("\n");
    const parsed=JSON.parse(outputText||"{}");
    const allowed=["navigate","add_items","generate_menu","show_youtube","show_list","amazon_search","none"];
    return res.json({reply:String(parsed.reply||"Estoy aquí para ayudarte."),action:allowed.includes(parsed.action)?parsed.action:"none",parameters:parsed.parameters&&typeof parsed.parameters==="object"?parsed.parameters:{}});
  } catch(err) {
    console.error("Pepa assistant failed:",err.message);
    return res.status(500).json({error:"No pude completar la petición. Inténtalo de nuevo."});
  }
});

const port = Number(process.env.PORT || 10000);
app.listen(port, "0.0.0.0", () => console.log(`COLLOEXPRES listening on port ${port}`));
