const $ = (id) => document.getElementById(id);
let items = [];
function addItem(value){
  const name=value.trim();
  if(!name) return;
  items.push({id:crypto.randomUUID?.() || String(Date.now()+Math.random()),name,done:false});
  $("productInput").value="";
  render();
}
function render(){
  $("itemCount").textContent=items.length;
  const list=$("shoppingList");
  list.innerHTML="";
  if(!items.length){list.innerHTML='<li class="empty-state">Tu lista está vacía. Añade el primer producto para empezar.</li>';return;}
  items.forEach(item=>{
    const li=document.createElement("li");
    const check=document.createElement("input");check.type="checkbox";check.className="item-check";check.checked=item.done;
    check.addEventListener("change",()=>{item.done=check.checked;render();});
    const name=document.createElement("span");name.className="item-name"+(item.done?" done":"");name.textContent=item.name;
    const remove=document.createElement("button");remove.className="remove";remove.textContent="×";remove.setAttribute("aria-label","Eliminar "+item.name);
    remove.addEventListener("click",()=>{items=items.filter(x=>x.id!==item.id);render();});
    li.append(check,name,remove);list.append(li);
  });
}
function compare(){
  if(!items.length){$("productInput").focus();return;}
  const selected=[...document.querySelectorAll('input[name="retailer"]:checked')].map(x=>x.value);
  const stores=selected.length?selected:["DIA","Eroski","Gadis","Familia","Mercadona","Carrefour","Alcampo","Lidl","Aldi","Continente (PT)","Auchan (PT)"];
  $("storeResults").innerHTML="";
  stores.forEach(store=>{
    const card=document.createElement("article");card.className="store-card";
    const title=document.createElement("div");title.className="store-name";title.textContent=store;
    const status=document.createElement("div");status.className="store-price pending-price";status.textContent="Pendiente";
    const note=document.createElement("div");note.className="store-meta";note.textContent="Tienda seleccionada · falta conectar precios reales de tu zona";
    card.append(title,status,note);$("storeResults").append(card);
  });
  $("savingCard").innerHTML="<div><strong>Comparación en preparación</strong><p>Tu lista tiene "+items.filter(x=>!x.done).length+" productos. Aún no hay precios reales conectados para calcular el ahorro.</p></div>";
  $("results").classList.remove("hidden");
  $("results").scrollIntoView({behavior:"smooth",block:"start"});
}
$("addBtn").addEventListener("click",()=>addItem($("productInput").value));
$("productInput").addEventListener("keydown",e=>{if(e.key==="Enter")addItem($("productInput").value);});
document.querySelectorAll("[data-item]").forEach(b=>b.addEventListener("click",()=>addItem(b.dataset.item)));
$("clearBtn").addEventListener("click",()=>{items=[];render();$("results").classList.add("hidden");});
$("compareBtn").addEventListener("click",compare);
$("aiBtn").addEventListener("click", async () => {
  const prompt = $("aiPrompt").value.trim();
  const status = $("aiStatus");
  const button = $("aiBtn");
  if (!prompt) { status.textContent = "Escribe qué necesitas comprar."; $("aiPrompt").focus(); return; }
  button.disabled = true;
  status.textContent = "La IA está organizando tu lista…";
  try {
    const response = await fetch("/api/interpret-list", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({prompt})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo conectar con la IA.");
    const products = Array.isArray(data.items) ? data.items : [];
    if (!products.length) throw new Error("La IA no encontró productos. Prueba a describir la compra con más detalle.");
    products.forEach(item => {
      const name = typeof item === "string" ? item : [item.quantity, item.name, item.size].filter(Boolean).join(" ").trim();
      if (name) items.push({id: crypto.randomUUID?.() || String(Date.now()+Math.random()), name, done:false});
    });
    render();
    status.textContent = (data.summary || "Lista organizada por IA.") + " Se han añadido " + products.length + " productos.";
    $("aiPrompt").value = "";
  } catch (error) {
    status.textContent = error.message + " Comprueba que el servidor y la clave API estén configurados.";
  } finally {
    button.disabled = false;
  }
});
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
render();

$("menuBtn").addEventListener("click", async () => {
  const prompt=$("menuPrompt").value.trim(), button=$("menuBtn"), status=$("menuStatus"), output=$("menuResults");
  if(!prompt){status.textContent="Indica cuántas personas y tus preferencias.";return;}
  button.disabled=true;status.textContent="Preparando tu menú semanal…";output.classList.add("hidden");output.innerHTML="";
  try{
    const response=await fetch("/api/generate-menu",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||"No se pudo crear el menú.");
    const heading=document.createElement("p");heading.className="menu-summary";heading.textContent=data.summary||"Tu menú semanal";output.append(heading);
    (data.days||[]).forEach(day=>{
      const card=document.createElement("article");card.className="day-card";
      const h=document.createElement("h4");h.textContent=day.day||"Día";const lunch=document.createElement("p");lunch.textContent="Comida: "+(day.lunch||"Por definir");const dinner=document.createElement("p");dinner.textContent="Cena: "+(day.dinner||"Por definir");card.append(h,lunch,dinner);output.append(card);
    });
    const listTitle=document.createElement("h4");listTitle.textContent="Lista de ingredientes";output.append(listTitle);
    const ul=document.createElement("ul");
    (data.shopping_list||[]).forEach(product=>{
      const li=document.createElement("li");li.textContent=[product.quantity,product.name].filter(Boolean).join(" ");ul.append(li);
    });
    output.append(ul);
    const add=document.createElement("button");add.className="primary-btn";add.textContent="Añadir ingredientes a mi lista";
    add.addEventListener("click",()=>{(data.shopping_list||[]).forEach(product=>{const name=[product.quantity,product.name].filter(Boolean).join(" ");if(name)items.push({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),name,done:false});});render();status.textContent="Ingredientes añadidos a Mi lista.";});
    output.append(add);output.classList.remove("hidden");status.textContent="Menú creado. Revísalo y ajusta cantidades según tu hogar.";
  }catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
});


/* Book-style navigation: each section is a separate page */
(function setupBookNavigation(){
  const main=document.querySelector("main");
  const home=document.getElementById("inicio");
  const hero=document.querySelector(".hero");
  const workspace=document.querySelector(".workspace");
  if(!main||!home||!workspace)return;
  const add=workspace.querySelector(".add-panel");
  const ai=workspace.querySelector(".ai-panel");
  const menu=workspace.querySelector(".menu-panel");
  const retailers=workspace.querySelector(".retailers-panel");
  const list=workspace.querySelector(".list-area");
  const compare=workspace.querySelector(".compare-row");
  const results=document.getElementById("results");
  const page=(title,subtitle)=>{const el=document.createElement("section");el.className="book-page";el.innerHTML='<header class="book-page-heading"><span class="book-kicker">COLLOEXPRES</span><h2>'+title+'</h2><p>'+subtitle+'</p></header>';return el;};
  const weekly=page("Menú semanal","Planifica comidas y cenas para toda la semana.");
  const basket=page("Cesta de la compra","Añade productos y organiza tu lista.");
  const menuPage=page("Hacer menú","Crea ideas de comidas con ayuda de la IA.");
  const comparePage=page("Comparación de supermercados","DIA · Eroski · Gadis · Familia y más.");
  const cameraPage=page("Cámara y marcas","Fotografía productos y compara sus formatos y precios.");
  cameraPage.insertAdjacentHTML("beforeend",'<section class="camera-panel" id="cameraPanel"><div class="camera-intro"><span class="camera-emoji">📸🍎</span><div><h3>Foto del producto</h3><p>Saca una foto y COLLOEXPRES lo analizará automáticamente.</p></div></div><label class="camera-pick" for="productPhoto">📷 HACER FOTO DEL PRODUCTO</label><input id="productPhoto" type="file" accept="image/*" capture="environment" class="camera-input"><img id="photoPreview" class="photo-preview hidden" alt="Foto del producto"><div id="brandResult" class="camera-result" aria-live="polite">Haz una foto para empezar. No necesitas escribir nada.</div><p class="safety-note">La foto solo permite revisar señales visibles. No detecta bacterias ni puede garantizar que un alimento sea seguro. Si hay dudas, no lo consumas.</p></section>');
  menuPage.append(menu);
  weekly.append(ai);
  basket.append(add,list,compare);
  comparePage.append(retailers,results);
  if(hero)hero.remove();
  workspace.remove();
  const pages=[home,menuPage,weekly,comparePage,basket,cameraPage];
  const book=document.createElement("div");book.className="book-view";
  const frame=document.createElement("div");frame.className="book-frame";
  pages.forEach((p,i)=>{
    p.classList.add("book-page");p.dataset.page=i;
    if(i>0){
      const back=document.createElement("button");
      back.type="button";back.className="page-home-button";back.textContent="⌂ Volver al menú principal";
      back.addEventListener("click",()=>show(0));
      p.insertBefore(back,p.firstChild);
    }
    frame.append(p);
  });
  book.append(frame);
  const controls=document.createElement("nav");controls.className="book-controls";controls.setAttribute("aria-label","Navegación de páginas");
  controls.innerHTML='<button type="button" class="book-prev" aria-label="Página anterior">‹</button><button type="button" class="book-home" aria-label="Volver al menú principal">⌂ Inicio</button><span class="book-page-count">1 / 6</span><button type="button" class="book-next" aria-label="Página siguiente">›</button>';
  book.append(controls);main.replaceChildren(book);
  let current=0;
  function show(n){current=Math.max(0,Math.min(pages.length-1,n));pages.forEach((p,i)=>{p.classList.toggle("active-page",i===current);p.setAttribute("aria-hidden",i===current?"false":"true");});controls.querySelector(".book-page-count").textContent=(current+1)+" / "+pages.length;controls.querySelector(".book-prev").disabled=current===0;controls.querySelector(".book-next").disabled=current===pages.length-1;window.scrollTo({top:0,behavior:"smooth"});}
  // Enlaces directos para que cada tarjeta abra su página, también en Safari iPhone.
  const homeCards=home.querySelectorAll(".main-menu-card");
  const destinations=[1,2,3,4,5];
  homeCards.forEach((card,index)=>card.addEventListener("click",event=>{
    event.preventDefault();
    show(destinations[index] ?? 1);
  }));
  const targets={"#hacer-menu":1,"#menuResults":1,"#supermercados":3,"#lista":4,"#comparar":4,"#results":3};
  main.addEventListener("click",event=>{
    const link=event.target.closest('a[href^="#"]');
    if(!link)return;
    const target=link.getAttribute("href");
    if(target==="#hacer-menu"||target==="#supermercados"||target==="#lista"){
      event.preventDefault();
      show(targets[target]);
    }
  });
  controls.querySelector(".book-home").addEventListener("click",()=>show(0));
  // La barra inferior permanece visible y navega entre las páginas del libro.
  const bottomDestinations={"#inicio":0,"#hacer-menu":1,"#supermercados":3,"#lista":4,"#camera":5};
  document.querySelectorAll(".bottom-nav-link").forEach(link=>link.addEventListener("click",event=>{
    const destination=bottomDestinations[link.getAttribute("href")];
    if(destination===undefined)return;
    event.preventDefault();
    show(destination);
  }));
  controls.querySelector(".book-prev").addEventListener("click",()=>show(current-1));
  controls.querySelector(".book-next").addEventListener("click",()=>show(current+1));
  // También se puede pasar de hoja deslizando o tocando los bordes.
  let x=0,y=0;
  frame.addEventListener("touchstart",event=>{x=event.changedTouches[0].clientX;y=event.changedTouches[0].clientY;},{passive:true});
  frame.addEventListener("touchend",event=>{const dx=event.changedTouches[0].clientX-x,dy=event.changedTouches[0].clientY-y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.2)show(current+(dx<0?1:-1));},{passive:true});
  show(0);
  const photo=document.getElementById("productPhoto"),preview=document.getElementById("photoPreview"),brandResult=document.getElementById("brandResult");
  photo.addEventListener("change",async()=>{
    const file=photo.files&&photo.files[0];if(!file)return;
    brandResult.textContent="Preparando la foto…";
    try{
      const image=await createImageBitmap(file);
      const scale=Math.min(1,1600/Math.max(image.width,image.height));
      const canvas=document.createElement("canvas");canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
      canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.82));
      if(!blob)throw new Error("No se pudo preparar la foto.");
      const url=URL.createObjectURL(blob);if(preview.dataset.url)URL.revokeObjectURL(preview.dataset.url);preview.src=url;preview.dataset.url=url;preview.classList.remove("hidden");
      brandResult.textContent="Analizando el producto…";
      const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(new Error("No se pudo leer la foto."));reader.readAsDataURL(blob);});
      const response=await fetch("/api/analyze-product",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:base64,mimeType:"image/jpeg"})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"No se pudo analizar la foto.");
      const status=data.condition==="aparentemente_bien"?"Aparentemente bien (solo por fuera)":data.condition==="señales_de_alerta"?"Señales de alerta visibles":"No se puede determinar";
      brandResult.replaceChildren();
      const heading=document.createElement("h3");heading.textContent=status;brandResult.append(heading);
      const product=document.createElement("p");product.textContent="Producto: "+data.product+" · Marca: "+data.brand;brandResult.append(product);
      if(data.visible_signs&&data.visible_signs.length){const ul=document.createElement("ul");data.visible_signs.forEach(sign=>{const li=document.createElement("li");li.textContent=sign;ul.append(li);});brandResult.append(ul);}
      const advice=document.createElement("p");advice.textContent=data.advice;brandResult.append(advice);
      if(data.condition==="no_determinado"||data.condition==="señales_de_alerta"){
        const warning=document.createElement("p");warning.className="safety-warning";
        warning.textContent=data.condition==="no_determinado"?"⚠️ No estoy segura del estado de este producto. La foto no permite confirmarlo. Revisa la fecha, el envase y su conservación. Si tienes dudas, no lo compres ni lo consumas.":"⚠️ He detectado posibles señales de deterioro. No lo compres ni lo consumas si observas estos daños.";
        brandResult.append(warning);
      }
      const price=document.createElement("p");price.className="price-unavailable";price.textContent=data.price_message||"Precio no disponible";brandResult.append(price);
    }catch(error){brandResult.textContent=error.message;}
  });
})();

/* Planificador: calendario del móvil, recordatorio de compra y recetas en YouTube */
(function setupMenuPlanner(){
  const panel=document.querySelector(".menu-panel");
  const results=document.getElementById("menuResults");
  if(!panel||!results)return;
  const planner=document.createElement("section");
  planner.className="menu-planner";
  planner.innerHTML='<h3>🗓️ Organiza tu semana</h3><p>Elige cuándo empieza tu menú y cuándo quieres que el móvil te recuerde hacer la compra.</p><div class="planner-fields"><label>Primer día del menú<input id="menuStartDate" type="date"></label><label>Día para hacer la compra<input id="shoppingReminderDate" type="date"></label><label>Hora del aviso<input id="shoppingReminderTime" type="time" value="10:00"></label></div><div class="planner-actions"><button type="button" class="primary-btn" id="calendarMenuBtn">Añadir menú al calendario</button><button type="button" class="secondary-btn" id="calendarShoppingBtn">Avisarme para hacer la compra</button></div><p class="helper-status" id="calendarStatus" aria-live="polite">Se abrirá un archivo de calendario para añadir los eventos al calendario del móvil.</p>';
  const menuButton=document.getElementById("menuBtn");
  menuButton.insertAdjacentElement("afterend",planner);
  const today=new Date();
  const dateValue=d=>{const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,10);};
  const start=new Date(today);start.setDate(start.getDate()+((1-start.getDay()+7)%7));
  document.getElementById("menuStartDate").value=dateValue(start);
  document.getElementById("shoppingReminderDate").value=dateValue(start);
  let currentMenu=null;
  const pad=n=>String(n).padStart(2,"0");
  const toICSDate=d=>d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+"T"+pad(d.getHours())+pad(d.getMinutes())+"00";
  const escapeICS=s=>String(s||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
  function downloadCalendar(events,name){
    const stamp=toICSDate(new Date());
    const body=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//COLLOEXPRES//Planificador//ES","CALSCALE:GREGORIAN","METHOD:PUBLISH",...events.flatMap(e=>["BEGIN:VEVENT","UID:"+Date.now()+"-"+Math.random().toString(36).slice(2)+"@colloexpres","DTSTAMP:"+stamp,"DTSTART:"+toICSDate(e.start),"DTEND:"+toICSDate(e.end),"SUMMARY:"+escapeICS(e.title),"DESCRIPTION:"+escapeICS(e.description),"BEGIN:VALARM","TRIGGER:-PT30M","ACTION:DISPLAY","DESCRIPTION:"+escapeICS(e.title),"END:VALARM","END:VEVENT"]),"END:VCALENDAR"].join("\r\n");
    const blob=new Blob([body],{type:"text/calendar;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name+".ics";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function dayDate(index){const d=new Date(document.getElementById("menuStartDate").value+"T00:00:00");d.setDate(d.getDate()+index);return d;}
  function eventAt(date,hour,minute,title,description){const start=new Date(date);start.setHours(hour,minute,0,0);const end=new Date(start);end.setMinutes(end.getMinutes()+45);return {start,end,title,description};}
  document.getElementById("calendarMenuBtn").addEventListener("click",()=>{
    if(!currentMenu||!Array.isArray(currentMenu.days)||!currentMenu.days.length){document.getElementById("calendarStatus").textContent="Primero crea tu menú semanal con el botón de arriba.";return;}
    if(!document.getElementById("menuStartDate").value){document.getElementById("calendarStatus").textContent="Elige el primer día del menú.";return;}
    const events=[];
    currentMenu.days.forEach((day,index)=>{
      const date=dayDate(index);
      if(day.lunch)events.push(eventAt(date,13,30,"Comida: "+day.lunch,"Menú de COLLOEXPRES"));
      if(day.dinner)events.push(eventAt(date,20,30,"Cena: "+day.dinner,"Menú de COLLOEXPRES"));
    });
    if(!events.length){document.getElementById("calendarStatus").textContent="Este menú no contiene platos para añadir.";return;}
    downloadCalendar(events,"colloexpres-menu-semanal");
    document.getElementById("calendarStatus").textContent="Archivo creado. Ábrelo en tu iPhone y elige añadir los eventos al calendario. Cada comida tendrá un aviso 30 minutos antes.";
  });
  document.getElementById("calendarShoppingBtn").addEventListener("click",()=>{
    const date=document.getElementById("shoppingReminderDate").value,time=document.getElementById("shoppingReminderTime").value;
    if(!date||!time){document.getElementById("calendarStatus").textContent="Elige el día y la hora del recordatorio.";return;}
    const startAt=new Date(date+"T"+time+":00");
    if(Number.isNaN(startAt.getTime()))return;
    const end=new Date(startAt);end.setMinutes(end.getMinutes()+30);
    downloadCalendar([{start:startAt,end,title:"Hacer la compra · COLLOEXPRES",description:"Revisa tu lista de la compra en COLLOEXPRES."}],"colloexpres-recordatorio-compra");
    document.getElementById("calendarStatus").textContent="Recordatorio preparado. Abre el archivo y añádelo al calendario del móvil para recibir el aviso.";
  });
  window.addEventListener("colloexpres:menu-created",event=>{
    currentMenu=event.detail;
  });
  const originalMenuBtn=document.getElementById("menuBtn");
  originalMenuBtn.addEventListener("click",()=>{currentMenu=null;});
  const observer=new MutationObserver(()=>{
    if(results.classList.contains("hidden"))return;
    const days=results.querySelectorAll(".day-card");
    days.forEach(card=>{
      if(card.querySelector(".youtube-recipe-link"))return;
      const title=card.querySelector("h4")?.textContent||"";
      const mealTexts=[...card.querySelectorAll("p")].map(p=>p.textContent.replace(/^(Comida|Cena):\\s*/,""));
      mealTexts.forEach(meal=>{
        if(!meal||meal==="Por definir")return;
        const link=document.createElement("a");link.className="youtube-recipe-link";link.target="_blank";link.rel="noopener noreferrer";
        link.href="https://www.youtube.com/results?search_query="+encodeURIComponent(meal+" receta paso a paso");
        link.textContent="▶ Ver recetas en YouTube: "+meal;
        card.append(link);
      });
    });
  });
  observer.observe(results,{childList:true,subtree:true});
  const generate=document.getElementById("menuBtn");
  generate.addEventListener("click",()=>{
    const check=setInterval(()=>{
      if(!results.classList.contains("hidden")&&results.querySelector(".day-card")){
        currentMenu={days:[...results.querySelectorAll(".day-card")].map(card=>({day:card.querySelector("h4")?.textContent||"",lunch:card.querySelectorAll("p")[0]?.textContent.replace(/^Comida:\\s*/,"")||"",dinner:card.querySelectorAll("p")[1]?.textContent.replace(/^Cena:\\s*/,"")||""}))};
        clearInterval(check);
      }
    },250);
    setTimeout(()=>clearInterval(check),15000);
  });
})();


/* PEPA: asistente conversacional y acciones dentro de COLLOEXPRES */
(function setupPepa(){
  if(document.getElementById("pepaAssistant"))return;
  const panel=document.createElement("section");
  panel.id="pepaAssistant";panel.className="pepa-panel";
  panel.innerHTML='<button type="button" class="pepa-launcher" id="pepaLauncher" aria-expanded="false" aria-label="Hablar con Pepa"><span class="pepa-grandma"><img src="data:image/webp;base64,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" alt="Pepa"></span><span class="pepa-name">Pepa</span></button><div class="pepa-chat hidden" id="pepaChat"><header class="pepa-head"><span class="pepa-avatar"><img src="data:image/webp;base64,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" alt="Pepa"></span><div><strong>Pepa</strong><small>Tu ayudante de COLLOEXPRES</small></div><button type="button" id="pepaClose" aria-label="Cerrar Pepa">×</button></header><div class="pepa-voice-face" aria-hidden="true"><div class="pepa-avatar"><img src="data:image/webp;base64,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" alt="Pepa"></div><strong>Hola, cariño. ¿Qué hacemos hoy?</strong></div><div class="pepa-mode-choice" id="pepaModeChoice"><p>¿Cómo quieres hablar conmigo?</p><div><button type="button" id="pepaWriteMode">✍️ Escribir</button><button type="button" id="pepaVoiceMode">🎙️ Hablar</button></div></div><div class="pepa-messages" id="pepaMessages" aria-live="polite"><p class="pepa-bubble pepa-bot">¡Hola, cariño! Soy Pepa 😊 ¿Prefieres que hablemos o que me escribas?</p></div><form id="pepaForm" class="pepa-form hidden"><textarea id="pepaInput" rows="2" maxlength="2000" placeholder="Dime qué necesitas…" aria-label="Mensaje para Pepa"></textarea><button type="submit" id="pepaSend">Enviar</button><button type="button" id="pepaSpeakReplyText" disabled>🔊 Escuchar a Pepa</button><button type="button" id="pepaSwitchVoice">🎙️ Hablar</button></form><div class="pepa-voice-controls hidden" id="pepaVoiceControls"><button type="button" id="pepaListen">🎙️ Toca para hablar</button><button type="button" id="pepaSpeakReply" disabled>🔊 Escuchar a Pepa</button><button type="button" id="pepaStopVoice">Detener voz</button><button type="button" id="pepaSwitchWrite">✍️ Escribir</button></div><p class="pepa-voice-status" id="pepaVoiceStatus" aria-live="polite">Puedes cambiar entre escribir y hablar cuando quieras.</p><p class="pepa-hint">Pepa solo realizará acciones dentro de COLLOEXPRES que tú le pidas.</p></div>';
  const host=document.querySelector('.topbar');
  (host||document.body).append(panel);
  const launcher=document.getElementById("pepaLauncher"),chat=document.getElementById("pepaChat"),messages=document.getElementById("pepaMessages"),input=document.getElementById("pepaInput"),form=document.getElementById("pepaForm"),send=document.getElementById("pepaSend");
  const speakReplyTextBtn=document.getElementById("pepaSpeakReplyText");const switchVoice=document.getElementById("pepaSwitchVoice"),switchWrite=document.getElementById("pepaSwitchWrite");const modeChoice=document.getElementById("pepaModeChoice"),writeMode=document.getElementById("pepaWriteMode"),voiceMode=document.getElementById("pepaVoiceMode"),voiceControls=document.getElementById("pepaVoiceControls"),listenBtn=document.getElementById("pepaListen"),speakReplyBtn=document.getElementById("pepaSpeakReply"),stopVoiceBtn=document.getElementById("pepaStopVoice"),voiceStatus=document.getElementById("pepaVoiceStatus");
  let interactionMode="choose",recognition=null;
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  function chooseMode(mode){interactionMode=mode;chat.classList.toggle("pepa-voice-mode",mode==="voice");chat.classList.toggle("pepa-write-mode",mode==="write");modeChoice.classList.add("hidden");form.classList.toggle("hidden",mode!=="write");voiceControls.classList.toggle("hidden",mode!=="voice");messages.classList.toggle("hidden",mode==="voice");voiceStatus.textContent=mode==="voice"?(SpeechRecognition?"Pepa te escucha. Toca el micrófono y dile qué necesitas.":"Este navegador no permite dictado por voz. Puedes volver a Escribir."): "Escríbeme y pulsa Enviar.";if(mode==="write")input.focus();}
  function stopListening(){if(recognition){try{recognition.stop();}catch(_){}}listenBtn.disabled=false;listenBtn.textContent="🎙️ Toca para hablar";}
  let lastPepaReply="";
  function speakPepa(text,manual=false){
    lastPepaReply=String(text||"");
    if(!lastPepaReply){voiceStatus.textContent="Todavía no tengo una respuesta para leer.";return;}
    if(!("speechSynthesis" in window)||!("SpeechSynthesisUtterance" in window)){
      voiceStatus.textContent="Este navegador no ofrece lectura de voz. Prueba a abrir COLLOEXPRES en Safari.";
      return;
    }
    speakReplyBtn.disabled=false;if(speakReplyTextBtn)speakReplyTextBtn.disabled=false;
    const synth=window.speechSynthesis;
    try{synth.cancel();synth.resume();}catch(_){}
    const utterance=new SpeechSynthesisUtterance(lastPepaReply);
    utterance.lang="es-ES";utterance.rate=0.9;utterance.pitch=1;
    const voices=synth.getVoices();
    const spanish=voices.filter(v=>/^es([_-]|$)/i.test(v.lang));
    utterance.voice=spanish.find(v=>/españa|spain|peninsular/i.test(v.name+" "+v.lang))||spanish[0]||null;
    utterance.onstart=()=>{voiceStatus.textContent="Pepa te está hablando…";};
    utterance.onend=()=>{voiceStatus.textContent="Pepa terminó de hablar. Puedes volver a escucharla.";};
    utterance.onerror=(event)=>{voiceStatus.textContent="El iPhone no pudo reproducir la voz ("+(event.error||"error de audio")+"). Comprueba el volumen y vuelve a tocar Escuchar a Pepa.";};
    voiceStatus.textContent="Preparando la voz de Pepa…";
    try{synth.speak(utterance);synth.resume();}catch(error){voiceStatus.textContent="No se pudo iniciar el audio: "+error.message;}
  }
  speakReplyBtn.addEventListener("click",()=>speakPepa(lastPepaReply,true));
  if(speakReplyTextBtn)speakReplyTextBtn.addEventListener("click",()=>speakPepa(lastPepaReply,true));
  writeMode.addEventListener("click",()=>chooseMode("write"));voiceMode.addEventListener("click",()=>chooseMode("voice"));switchVoice.addEventListener("click",()=>chooseMode("voice"));switchWrite.addEventListener("click",()=>{stopListening();window.speechSynthesis?.cancel();chooseMode("write");});
  listenBtn.addEventListener("click",()=>{if(!SpeechRecognition){voiceStatus.textContent="Tu navegador no admite dictado por voz. Elige Escribir.";return;}stopListening();recognition=new SpeechRecognition();recognition.lang="es-ES";recognition.interimResults=false;recognition.maxAlternatives=1;recognition.onstart=()=>{listenBtn.disabled=true;listenBtn.textContent="👂 Te escucho…";voiceStatus.textContent="Te escucho, cariño. Habla ahora.";};recognition.onresult=e=>{const heard=e.results[0][0].transcript;voiceStatus.textContent="He entendido: "+heard;sendMessage(heard);};recognition.onerror=e=>{voiceStatus.textContent=e.error==="not-allowed"?"Necesitas permitir el micrófono en tu navegador.":"No he podido escucharte. Inténtalo otra vez.";stopListening();};recognition.onend=()=>{listenBtn.disabled=false;listenBtn.textContent="🎙️ Toca para hablar";};try{recognition.start();}catch(_){voiceStatus.textContent="No se pudo iniciar el micrófono. Vuelve a intentarlo.";}}); 
  stopVoiceBtn.addEventListener("click",()=>{window.speechSynthesis?.cancel();stopListening();voiceStatus.textContent="He detenido la voz.";});
  function sendMessage(prompt){if(!prompt.trim())return;send.disabled=true;send.textContent="…";say(prompt,"user");say("Déjame ayudarte, cariño…");const pending=messages.lastElementChild;
    fetch("/api/pepa",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:prompt,items:items.map(x=>({name:x.name,done:x.done})),page:document.querySelector(".book-page.active-page")?.dataset.page||"0",last_recipe:window.colloexpresLastRecipe||"",weekly_menu:[...document.querySelectorAll("#menuResults .day-card")].map(card=>({day:card.querySelector("h4")?.textContent||"",meals:[...card.querySelectorAll("p")].map(p=>p.textContent)}))})})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"No pude responder ahora.");const actionText=await handleAction(data);const answer=[data.reply,actionText].filter(Boolean).join(" ");pending.remove();say(answer);speakPepa(answer);})
      .catch(error=>{pending.remove();say(error.message);})
      .finally(()=>{send.disabled=false;send.textContent="Enviar";input.focus();});
  }
  const pages={"inicio":"inicio","portada":"inicio","hacer menú":"hacer-menu","menú":"hacer-menu","menú semanal":"hacer-menu","planificador":"hacer-menu","comparación":"supermercados","supermercados":"supermercados","cesta":"lista","lista":"lista","compra":"lista","cámara":"camera"};
  function say(text,who="bot"){const p=document.createElement("p");p.className="pepa-bubble "+(who==="user"?"pepa-user":"pepa-bot");p.textContent=text;messages.append(p);messages.scrollTop=messages.scrollHeight;}
  function goPage(destination){const bookPage=document.querySelector('.book-page[data-page="'+destination+'"]');if(bookPage){const n=Number(destination);document.querySelectorAll(".book-page").forEach((p,i)=>{p.classList.toggle("active-page",i===n);p.setAttribute("aria-hidden",i===n?"false":"true");});const count=document.querySelector(".book-page-count");if(count)count.textContent=(n+1)+" / "+document.querySelectorAll(".book-page").length;const prev=document.querySelector(".book-prev"),next=document.querySelector(".book-next");if(prev)prev.disabled=n===0;if(next)next.disabled=n===document.querySelectorAll(".book-page").length-1;return true;}const section=document.getElementById(String(destination));if(section){section.scrollIntoView({behavior:"smooth",block:"start"});return true;}return false;}
  function addProducts(products){let count=0;(products||[]).slice(0,35).forEach(item=>{const name=typeof item==="string"?item:[item.quantity,item.name,item.size].filter(Boolean).join(" ").trim();if(name){items.push({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),name,done:false});count++;}});render();return count;}
  async function handleAction(data){
    const action=data.action||"none",params=data.parameters||{};
    if(action==="navigate"){const key=String(params.page||"").toLowerCase();const destination=pages[key];if(!destination)return "No reconozco esa sección. Puedo abrir hacer menú, menú semanal, supermercados, cesta o cámara.";if(!goPage(destination))return "No encuentro esa sección en esta versión de la app.";return "Te he abierto "+key+".";}
    if(action==="add_items"){const count=addProducts(params.items||[]);goPage("lista");return count?"He añadido "+count+" productos a tu cesta.":"No recibí productos para añadir.";}
    if(action==="generate_menu"){const prompt=String(params.prompt||"");if(!prompt)return "Dime para cuántas personas y qué preferencias tienes.";goPage("hacer-menu");const field=document.getElementById("menuPrompt");if(field)field.value=prompt;const btn=document.getElementById("menuBtn");if(btn)btn.click();return "Estoy preparando tu menú. Lo verás en la sección Hacer menú.";}
    if(action==="show_youtube"){const query=String(params.query||"");if(!query)return "Dime qué receta quieres ver.";window.colloexpresLastRecipe=query;const url="https://www.youtube.com/results?search_query="+encodeURIComponent(query+" receta paso a paso");window.open(url,"_blank","noopener");return "Te abrí YouTube con recetas de "+query+". Si te gusta, di: Pepa, me gusta esta receta, y prepararé sus ingredientes para tu cesta.";}
    if(action==="amazon_search"){const query=String(params.query||items.filter(x=>!x.done).map(x=>x.name).join(" ")).trim();if(!query)return "La cesta está vacía. Primero preparemos la lista de productos.";const url="https://www.amazon.es/s?k="+encodeURIComponent(query);window.open(url,"_blank","noopener");return "He abierto Amazon España con la búsqueda de tu lista. Revisa cada producto y añádelo tú a la cesta de Amazon; no puedo incorporarlo automáticamente a tu cuenta.";}
    if(action==="show_list"){goPage("lista");return "Aquí tienes tu cesta. Tienes "+items.length+" productos.";}
    if(action==="none")return "";
    return "Puedo ayudarte con menús, listas, recetas de YouTube y las secciones de la app.";
  }
  launcher.addEventListener("click",()=>{const open=chat.classList.toggle("hidden")===false;launcher.setAttribute("aria-expanded",String(open));if(open){modeChoice.classList.remove("hidden");form.classList.add("hidden");voiceControls.classList.add("hidden");interactionMode="choose";}});
  document.getElementById("pepaClose").addEventListener("click",()=>{chat.classList.add("hidden");launcher.setAttribute("aria-expanded","false");stopListening();window.speechSynthesis?.cancel();});
  form.addEventListener("submit",event=>{event.preventDefault();const prompt=input.value.trim();input.value="";sendMessage(prompt);});
})();
