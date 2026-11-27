const $ = (id) => document.getElementById(id);
let items = [];
const demoStores = [
  {name:"Mercadona", factor:1.00, note:"Ejemplo de cesta"},
  {name:"Carrefour", factor:1.08, note:"Ejemplo de cesta"},
  {name:"Alcampo", factor:.94, note:"Ejemplo de cesta"}
];
const basePrices = [
  {keys:["leche"], price:1.05},{keys:["huevo"],price:2.35},{keys:["arroz"],price:1.45},
  {keys:["aceite"],price:7.20},{keys:["pan"],price:1.30},{keys:["pollo"],price:6.50},
  {keys:["tomate"],price:2.10},{keys:["pasta","macarron","espagueti"],price:1.15},
  {keys:["yogur"],price:2.10},{keys:["platano","banana"],price:1.75}
];
function estimateItem(name){
  const n=name.toLowerCase();
  const match=basePrices.find(p=>p.keys.some(k=>n.includes(k)));
  return match ? match.price : 2.00;
}
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
  const active=items.filter(x=>!x.done);
  const base=active.reduce((sum,x)=>sum+estimateItem(x.name),0);
  const ranked=demoStores.map(s=>({...s,total:base*s.factor})).sort((a,b)=>a.total-b.total);
  $("storeResults").innerHTML="";
  ranked.forEach((store,i)=>{
    const card=document.createElement("article");card.className="store-card"+(i===0?" best":"");
    const top=document.createElement("div");top.className="store-top";
    const title=document.createElement("span");title.className="store-name";title.textContent=store.name;
    const label=document.createElement("span");label.className="store-label";label.textContent=i===0?"MENOR TOTAL":"DEMO";
    top.append(title,label);
    const price=document.createElement("div");price.className="store-price";price.textContent=store.total.toLocaleString("es-ES",{style:"currency",currency:"EUR"});
    const meta=document.createElement("div");meta.className="store-meta";meta.textContent=active.length+" productos · "+store.note;
    card.append(top,price,meta);$("storeResults").append(card);
  });
  const diff=Math.max(0,ranked[ranked.length-1].total-ranked[0].total);
  $("savingCard").innerHTML=`<div><strong>${diff.toLocaleString("es-ES",{style:"currency",currency:"EUR"})}</strong><p>Diferencia entre la cesta más cara y la más barata en esta simulación.</p></div><div aria-hidden="true" style="font-size:34px">↗</div>`;
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
