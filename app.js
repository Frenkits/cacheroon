import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// --- CONFIGURAZIONE SUPABASE ---
const SUPABASE_URL = "https://gvlwrwcbcbsdjiauzxuq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpZVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2zZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- MAPPA LEAFLET ---
const map = L.map('map', { center: [41.9, 12.5], zoom: 13, maxZoom: 19 });
map.doubleClickZoom.disable();

const clusterGroup = L.markerClusterGroup({
  iconCreateFunction: cluster => {
    const count = cluster.getChildCount();
    return L.divIcon({ html: `💩<br>${count}`, className:'poop-cluster', iconSize:[40,40], iconAnchor:[20,20] });
  }
});
map.addLayer(clusterGroup);

const poopIcon = L.divIcon({ html: "💩", className: "poop-marker", iconSize:[30,30], iconAnchor:[15,15] });

// --- POSIZIONE UTENTE ---
let userMarker=null, accuracyCircle=null, userPosition=null;
if("geolocation" in navigator){
  navigator.geolocation.watchPosition(pos=>{
    const lat=pos.coords.latitude, lng=pos.coords.longitude, acc=pos.coords.accuracy;
    userPosition=[lat,lng];
    localStorage.setItem("lastUserPosition", JSON.stringify(userPosition));

    if(!userMarker){
      userMarker = L.circleMarker([lat,lng], { radius:8, color:"#007bff", fillColor:"#007bff", fillOpacity:1 }).addTo(map);
      accuracyCircle = L.circle([lat,lng], { radius:acc, color:"#007bff", fillColor:"#007bff", fillOpacity:0.15, weight:1 }).addTo(map);
      map.setView([lat,lng],16);
    } else {
      userMarker.setLatLng([lat,lng]);
      accuracyCircle.setLatLng([lat,lng]);
      accuracyCircle.setRadius(acc);
    }
  });
}

// --- CONTENITORI DATI ---
const markers = {}, allReports = {};
const chat = document.getElementById("chat");
const details = document.getElementById("details");

// --- CONTATORI FOOTER ---
const activeCountEl = document.getElementById("active-count");
const deletedCountEl = document.getElementById("deleted-count");
const totalCountEl = document.getElementById("total-count");
let activeCount=0, deletedCount=0;
function updateStats(){ activeCountEl.textContent=`Attive: ${activeCount}`; deletedCountEl.textContent=`Eliminate: ${deletedCount}`; totalCountEl.textContent=`Totali: ${activeCount+deletedCount}`; }

// --- CHAT ---
function addChat(message, reportId=null){
  const entry = document.createElement("div");
  entry.className = "chat-entry";
  entry.textContent = message;

  if(reportId){
    entry.style.cursor="pointer";
    entry.addEventListener("click", ()=>{
      const r=allReports[reportId];
      if(r){
        const created=new Date(r.created_at).toLocaleString();
        const deleted=r.deleted_at?r.deleted_at:"Ancora presente";
        details.innerHTML=`<strong>Segnalazione ID:</strong> ${reportId}<br>
          <strong>Data inserimento:</strong> ${created}<br>
          <strong>Data rimozione:</strong> ${deleted}<br>
          <strong>Via:</strong> ${r.street}<br>
          <strong>Descrizione:</strong> ${r.description||"Nessuna"}`;
      }
    });
  }

  chat.appendChild(entry);
  if(chat.children.length>50) chat.removeChild(chat.firstChild);
  chat.scrollTop = chat.scrollHeight;
}

// --- FUNZIONI SUPABASE ---
async function getStreetName(lat,lng){
  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    return data.address?.road || data.display_name?.split(",")[0] || "Via sconosciuta";
  }catch(e){ console.log("errore geocoding",e); return "Via sconosciuta"; }
}

async function addReport(lat,lng,description){
  const street = await getStreetName(lat,lng);
  const {data} = await supabase.from("poop_reports").insert({latitude:lat, longitude:lng, street, description}).select().single();

  // aggiungi subito marker e chat
  const marker=L.marker([data.latitude,data.longitude],{icon:poopIcon});
  clusterGroup.addLayer(marker);
  const formatted=new Date(data.created_at).toLocaleString();
  marker.bindTooltip(`Aggiunta il: ${formatted}\n${street}`,{direction:"top"});
  markers[data.id]={marker, street, created_at:data.created_at, description};
  allReports[data.id]={street, created_at:data.created_at, description};
  enableRemove(marker,data.id);
  addChat(`✅ Cacca aggiunta il ${formatted} in ${street}`, data.id);
  activeCount++; updateStats();

  await supabase.from("poop_events").insert({report_id:data.id,type:"add",street,description});
}

async function deleteReport(id){
  const street = markers[id]?.street || "Via sconosciuta";
  await supabase.from("poop_reports").delete().eq("id",id);
  await supabase.from("poop_events").insert({report_id:id,type:"delete",street});
}

// --- CARICA REPORT E EVENTI INIZIALI ---
async function loadReports(){
  const {data} = await supabase.from("poop_reports").select("*").order("created_at",{ascending:true});
  data.forEach(p=>{
    const marker=L.marker([p.latitude,p.longitude],{icon:poopIcon});
    clusterGroup.addLayer(marker);
    const formatted=new Date(p.created_at).toLocaleString();
    marker.bindTooltip(`Aggiunta il: ${formatted}\n${p.street}`,{direction:"top"});
    markers[p.id]={marker, street:p.street, created_at:p.created_at, description:p.description};
    allReports[p.id]={street:p.street, created_at:p.created_at, description:p.description};
    enableRemove(marker,p.id);
    addChat(`✅ Cacca presente in ${p.street}`, p.id);
    activeCount++;
  });
  updateStats();
}

async function loadEvents(){
  const {data} = await supabase.from("poop_events").select("*").order("timestamp",{ascending:true});
  data.forEach(ev=>{
    const formatted = new Date(ev.timestamp).toLocaleString();
    const street = ev.street || "Via sconosciuta";
    const description = ev.description || null;

    if(ev.type==="add"){
      allReports[ev.report_id] = allReports[ev.report_id] || {street, created_at:ev.timestamp, description};
    }
    if(ev.type==="delete"){
      if(allReports[ev.report_id]) allReports[ev.report_id].deleted_at=ev.timestamp;
      addChat(`❌ Cacca rimossa in ${street}`, ev.report_id);
    }
  });
}

// --- ENABLE REMOVE MARKER ---
function enableRemove(marker,id){
  marker.on("click", e=>{
    L.DomEvent.stopPropagation(e);
    const r = allReports[id];
    if(r){
      const created=new Date(r.created_at).toLocaleString();
      const deleted=r.deleted_at?r.deleted_at:"Ancora presente";
      details.innerHTML=`<strong>Segnalazione ID:</strong> ${id}<br>
        <strong>Data inserimento:</strong> ${created}<br>
        <strong>Via:</strong> ${r.street}<br>
        <strong>Descrizione:</strong> ${r.description||"Nessuna"}`;
    }
  });

  marker.on("dblclick", async e=>{
    L.DomEvent.stopPropagation(e);
    if(!markers[id]) return;
    const street = markers[id].street;
    await deleteReport(id);
    clusterGroup.removeLayer(markers[id].marker);
    delete markers[id];
    if(allReports[id]) allReports[id].deleted_at = new Date().toISOString();
    addChat(`❌ Cacca rimossa in ${street}`, id);
    activeCount--; deletedCount++; updateStats();
  });
}

// --- CLICK MAPPA ---
map.on("click", async e=>{
  const description = prompt("Inserisci una descrizione della cacca (facoltativo)");
  await addReport(e.latlng.lat, e.latlng.lng, description);
});

// --- BOTTONI MAPPA ---
const locateControl = L.control({position:"topleft"});
locateControl.onAdd = ()=>{
  const btn=L.DomUtil.create("button"); btn.innerHTML="📍"; btn.title="Vai alla tua posizione";
  btn.style.cssText="background:white;border:1px solid #ccc;padding:6px;cursor:pointer;font-size:18px;";
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick=()=>{ if(userPosition) map.setView(userPosition,17); };
  return btn;
};
locateControl.addTo(map);

const poopControl = L.control({position:"topleft"});
poopControl.onAdd = ()=>{
  const btn=L.DomUtil.create("button"); btn.innerHTML="💩"; btn.title="Segnala cacca qui";
  btn.style.cssText="background:white;border:1px solid #ccc;padding:6px;cursor:pointer;font-size:18px;margin-top:5px;";
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick=async ()=>{
    if(!userPosition){ alert("Posizione GPS non disponibile"); return; }
    const description = prompt("Descrizione della cacca (facoltativa)");
    await addReport(userPosition[0], userPosition[1], description);
  };
  return btn;
};
poopControl.addTo(map);

// --- LAYER MAPPA ---
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// --- REALTIME SUPABASE ---
supabase.channel("poop-live")
  .on('postgres_changes', {event:'INSERT',schema:'public',table:'poop_reports'}, payload=>{
    const p = payload.new;
    if(!markers[p.id]){
      const marker=L.marker([p.latitude,p.longitude],{icon:poopIcon});
      clusterGroup.addLayer(marker);
      const formatted=new Date(p.created_at).toLocaleString();
      marker.bindTooltip(`Aggiunta il: ${formatted}\n${p.street}`,{direction:"top"});
      markers[p.id]={marker, street:p.street, created_at:p.created_at, description:p.description};
      allReports[p.id]={street:p.street, created_at:p.created_at, description:p.description};
      enableRemove(marker,p.id);
      addChat(`✅ Cacca aggiunta il ${formatted} in ${p.street}`, p.id);
      activeCount++; updateStats();
    }
  })
  .on('postgres_changes', {event:'DELETE',schema:'public',table:'poop_reports'}, payload=>{
    const id = payload.old.id;
    const street = payload.old.street || "Via sconosciuta";
    if(markers[id]){
      clusterGroup.removeLayer(markers[id].marker);
      delete markers[id];
      if(allReports[id]) allReports[id].deleted_at = new Date().toISOString();
      addChat(`❌ Cacca rimossa in ${street}`, id);
      activeCount--; deletedCount++; updateStats();
    }
  })
  .subscribe();

// --- START ---
loadReports();
loadEvents();
