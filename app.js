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


/* Book-style navigation: one screen per section, with page controls and swipe */
(function setupBookNavigation(){
  const home=document.getElementById("inicio");
  const workspace=document.querySelector(".workspace");
  const hero=document.querySelector(".hero");
  const how=document.querySelector(".how");
  if(!home||!workspace)return;
  const pages=[];
  function makePage(title,subtitle){
    const page=document.createElement("section");
    page.className="book-page";
    page.innerHTML='<div class="book-page-heading"><span class="book-kicker">COLLOEXPRES</span><h2>'+title+'</h2><p>'+subtitle+'</p></div>';
    return page;
  }
  const menuPage=makePage("Hacer menú","Prepara ideas de comidas y cenas con ayuda de la IA.");
  const weeklyPage=makePage("Menú semanal","Aquí aparecerá tu planificación semanal generada.");
  const comparePage=makePage("Comparación de supermercados","DIA · Eroski · Gadis · Familia y más.");
  const basketPage=makePage("Cesta de la compra","Añade productos y organiza tu lista.");
  menuPage.append(document.getElementById("hacer-menu"));
  weeklyPage.append(document.getElementById("menuResults"));
  comparePage.append(document.getElementById("supermercados"),document.getElementById("results"));
  basketPage.append(document.querySelector(".add-panel"),document.querySelector(".ai-panel"),document.querySelector(".list-area"),document.querySelector(".compare-row"));
  pages.push(home,menuPage,weeklyPage,comparePage,basketPage);
  const book=document.createElement("div");book.className="book-view";
  const frame=document.createElement("div");frame.className="book-frame";
  pages.forEach((page,i)=>{page.classList.add("book-page");page.dataset.page=String(i);frame.append(page);});
  book.append(frame);
  const controls=document.createElement("div");controls.className="book-controls";
  controls.innerHTML='<button type="button" class="book-prev" aria-label="Página anterior">‹</button><span class="book-page-count" aria-live="polite">1 / 5</span><button type="button" class="book-next" aria-label="Página siguiente">›</button>';
  book.append(controls);
  document.querySelector("main").replaceChildren(book);
  let current=0;
  function show(index){
    current=Math.max(0,Math.min(pages.length-1,index));
    pages.forEach((page,i)=>{page.classList.toggle("active-page",i===current);page.setAttribute("aria-hidden",i===current?"false":"true");});
    controls.querySelector(".book-page-count").textContent=(current+1)+" / "+pages.length;
    controls.querySelector(".book-prev").disabled=current===0;
    controls.querySelector(".book-next").disabled=current===pages.length-1;
    frame.style.setProperty("--page-index",current);
    history.replaceState(null,"",current===0?"#inicio":"#pagina-"+(current+1));
  }
  const destinations={"#hacer-menu":1,"#menuResults":2,"#supermercados":3,"#lista":4,"#comparar":4,"#results":3};
  document.addEventListener("click",e=>{
    const link=e.target.closest('a[href^="#"]');
    if(!link)return;
    const target=link.getAttribute("href");
    if(destinations[target]!==undefined){e.preventDefault();show(destinations[target]);}
  });
  controls.querySelector(".book-prev").addEventListener("click",()=>show(current-1));
  controls.querySelector(".book-next").addEventListener("click",()=>show(current+1));
  let startX=0,startY=0;
  frame.addEventListener("touchstart",e=>{startX=e.changedTouches[0].clientX;startY=e.changedTouches[0].clientY;},{passive:true});
  frame.addEventListener("touchend",e=>{
    const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;
    if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.25)show(current+(dx<0?1:-1));
  },{passive:true});
  document.addEventListener("keydown",e=>{if(e.key==="ArrowRight")show(current+1);if(e.key==="ArrowLeft")show(current-1);});
  show(0);
})();
