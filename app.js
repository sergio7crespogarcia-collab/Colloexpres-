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
  cameraPage.insertAdjacentHTML("beforeend","<section class=\"camera-panel\" id=\"cameraPanel\"><div class=\"camera-intro\"><span class=\"camera-emoji\">📸🍎</span><div><h3>Escáner de compra</h3><p>Fotografía productos y compara marca, tamaño y precio.</p></div></div><label class=\"camera-pick\" for=\"productPhoto\">📷 Abrir cámara o elegir foto</label><input id=\"productPhoto\" type=\"file\" accept=\"image/*\" capture=\"environment\" class=\"camera-input\"><img id=\"photoPreview\" class=\"photo-preview hidden\" alt=\"Foto del producto\"><div class=\"camera-fields\"><label>Producto A — marca y formato<input id=\"brandA\" placeholder=\"Ej. Marca A, 500 g\"></label><label>Precio A (€)<input id=\"priceA\" type=\"number\" min=\"0\" step=\"0.01\" placeholder=\"2,50\"></label><label>Producto B — marca y formato<input id=\"brandB\" placeholder=\"Ej. Marca B, 750 g\"></label><label>Precio B (€)<input id=\"priceB\" type=\"number\" min=\"0\" step=\"0.01\" placeholder=\"3,20\"></label></div><button id=\"compareBrandsBtn\" class=\"primary-btn\" type=\"button\">Comparar productos</button><div id=\"brandResult\" class=\"camera-result\" aria-live=\"polite\">Introduce los precios y formatos de las etiquetas para compararlos.</div><div class=\"condition-check\"><h4>🧐 Revisa el estado del envase</h4><ul><li>Sin golpes, fugas ni hinchazón.</li><li>Precinto intacto.</li><li>Fecha legible y adecuada.</li><li>Refrigeración correcta.</li></ul><p class=\"safety-note\">Una foto no puede confirmar que el alimento sea seguro ni detectar bacterias. Si tienes dudas, no lo compres ni lo consumas.</p></div></section>");
  menuPage.append(menu);
  weekly.append(ai);
  basket.append(add,list,compare);
  comparePage.append(retailers,results);
  if(hero)hero.remove();
  workspace.remove();
  const pages=[home,menuPage,weekly,comparePage,basket,cameraPage];
  const book=document.createElement("div");book.className="book-view";
  const frame=document.createElement("div");frame.className="book-frame";
  pages.forEach((p,i)=>{p.classList.add("book-page");p.dataset.page=i;frame.append(p);});
  book.append(frame);
  const controls=document.createElement("nav");controls.className="book-controls";controls.setAttribute("aria-label","Navegación de páginas");
  controls.innerHTML='<button type="button" class="book-prev" aria-label="Página anterior">‹</button><span class="book-page-count">1 / 6</span><button type="button" class="book-next" aria-label="Página siguiente">›</button>';
  book.append(controls);main.replaceChildren(book);
  let current=0;
  function show(n){current=Math.max(0,Math.min(pages.length-1,n));pages.forEach((p,i)=>{p.classList.toggle("active-page",i===current);p.setAttribute("aria-hidden",i===current?"false":"true");});controls.querySelector(".book-page-count").textContent=(current+1)+" / "+pages.length;controls.querySelector(".book-prev").disabled=current===0;controls.querySelector(".book-next").disabled=current===pages.length-1;}
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
  controls.querySelector(".book-prev").addEventListener("click",()=>show(current-1));
  controls.querySelector(".book-next").addEventListener("click",()=>show(current+1));
  // También se puede pasar de hoja deslizando o tocando los bordes.
  let x=0,y=0;
  frame.addEventListener("touchstart",event=>{x=event.changedTouches[0].clientX;y=event.changedTouches[0].clientY;},{passive:true});
  frame.addEventListener("touchend",event=>{const dx=event.changedTouches[0].clientX-x,dy=event.changedTouches[0].clientY-y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.2)show(current+(dx<0?1:-1));},{passive:true});
  show(0);
  const photo=document.getElementById("productPhoto"),preview=document.getElementById("photoPreview");
  photo.addEventListener("change",()=>{const file=photo.files&&photo.files[0];if(!file)return;if(preview.dataset.url)URL.revokeObjectURL(preview.dataset.url);const url=URL.createObjectURL(file);preview.src=url;preview.dataset.url=url;preview.classList.remove("hidden");});
  document.getElementById("compareBrandsBtn").addEventListener("click",()=>{const pa=Number(document.getElementById("priceA").value),pb=Number(document.getElementById("priceB").value),out=document.getElementById("brandResult");if(!(pa>0&&pb>0)){out.textContent="Introduce los dos precios para compararlos.";return;}const aName=document.getElementById("brandA").value||"Producto A",bName=document.getElementById("brandB").value||"Producto B";out.textContent=aName+": "+pa.toFixed(2)+" €. "+bName+": "+pb.toFixed(2)+" €. Para comparar el coste real por kilo o litro, comprueba el peso o volumen de ambos envases. Esta versión no lee automáticamente las etiquetas de la foto.";});
})();