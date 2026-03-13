// app.js - Supabase JS 2.x + Realtime corretto

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// --- CONFIGURAZIONE SUPABASE ---
const SUPABASE_URL = "https://gvlwrwcbcbsdjiauzxuq.supabase.co"; // sostituisci con il tuo URL
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g";                // sostituisci con la tua anon key
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
let userMarker = null, accuracyCircle = null, userPosition = null;

if ("geolocation" in navigator){
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
  }, err=>{
    console.log("GPS errore:",err);
    const savedPos = localStorage.getItem("lastUserPosition");
    if(savedPos){ userPosition = JSON.parse(savedPos); map.setView(userPosition,16); }
  }, { enableHighAccuracy:true, maximumAge:1000, timeout:10000 });
} else {
  const savedPos = localStorage.getItem("lastUserPosition");
  if(savedPos){ userPosition = JSON.parse(savedPos); map.setView(userPosition,16); }
}

// --- CHAT E CONTATORI ---
const markers = {}, allReports = {}, chat = document.getElementById("chat"), details = document.getElementById("details");
const activeCountEl = document.getElementById("active-count"), deletedCountEl = document.getElementById("deleted-count"), totalCountEl = document.getElementById("total-count");
let activeCount=0, deletedCount=0;

function updateStats(){
  activeCountEl.textContent=`Attive: ${activeCount}`;
  deletedCountEl.textContent=`Eliminate: ${deletedCount}`;
  totalCountEl.textContent=`Totali: ${activeCount+deletedCount}`;
}

function addChat(message, reportId=null){
  const entry = document.createElement("div"); entry.className = "chat-entry"; entry.textContent = message;
  if(reportId){
    entry.style.cursor="pointer";
    entry.addEventListener("click", ()=>{
      const r = allReports[reportId];
      if(r){
        const created = new Date(r.created_at).toLocaleString();
        const deleted = r.deleted_at ? new Date(r.deleted_at).toLocaleString() : "Ancora presente";
        details.innerHTML = `<strong>Segnalazione ID:</strong> ${reportId}<br><strong>Data inserimento:</strong> ${created}<br><strong>Data rimozione:</strong> ${deleted}<br><strong>Via:</strong> ${r.street}<br><strong>Descrizione:</strong> ${r.description||"Nessuna"}`;
      }
    });
  }
  chat.appendChild(entry);
  if(chat.children.length>50) chat.removeChild(chat.firstChild);
  chat.scrollTop = chat.scrollHeight;
}

// --- FUNZIONI SUPABASE ---
async function loadReports(){
  const { data, error } = await supabase.from("poop_reports").select("*").order("created_at",{ascending:true});
  if(error) console.error(error);
  return data || [];
}

async function addReport(lat,lng,street,description){
  const { data, error } = await supabase.from("poop_reports").insert({ latitude:lat, longitude:lng, street, description }).select();
  if(error) console.error(error);
  return data[0];
}

async function deleteReport(id){
  const { error } = await supabase.from("poop_reports").delete().eq("id",id);
  if(error) console.error(error);
}

// --- CARICAMENTO INIZIALE ---
loadReports().then(data=>{
  data.forEach(p=>{
    const marker = L.marker([p.latitude,p.longitude],{icon:poopIcon});
    clusterGroup.addLayer(marker);
    markers[p.id] = { marker, street:p.street, created_at:p.created_at, description:p.description };
    allReports[p.id] = { street:p.street, created_at:p.created_at, description:p.description };
    enableRemove(marker,p.id);
    addChat(`✅ Cacca presente in ${p.street}`, p.id);
    activeCount++;
  });
  updateStats();
});

// --- REALTIME SUPABASE ---
const realtimeChannel = supabase
  .channel('poop_reports_channel')
  .on('postgres_changes', { event:'*', schema:'public', table:'poop_reports' }, payload=>{
    const p = payload.new;
    if(payload.eventType === 'INSERT' && !markers[p.id]){
      const marker = L.marker([p.latitude,p.longitude],{icon:poopIcon});
      clusterGroup.addLayer(marker);
      markers[p.id] = { marker, street:p.street, created_at:p.created_at, description:p.description };
      allReports[p.id] = { street:p.street, created_at:p.created_at, description:p.description };
      enableRemove(marker,p.id);
      addChat(`✅ Cacca aggiunta in ${p.street}`, p.id);
      activeCount++; updateStats();
    }
    if(payload.eventType === 'DELETE'){
      if(markers[p.id]){
        clusterGroup.removeLayer(markers[p.id].marker);
        addChat(`❌ Cacca rimossa`, p.id);
        delete markers[p.id];
        activeCount--; deletedCount++; updateStats();
        if(allReports[p.id]) allReports[p.id].deleted_at = new Date().toISOString();
      }
    }
  })
  .subscribe();

// --- CLICK MAPPA PER NUOVA CACCA ---
map.on("click", async e=>{
  const desc = prompt("Inserisci una descrizione della cacca (facoltativo)");
  if(!userPosition){ alert("Posizione GPS non disponibile"); return; }
  const street = "Via sconosciuta";
  await addReport(e.latlng.lat, e.latlng.lng, street, desc);
});

// --- FUNZIONE CANCELLA / DETTAGLI ---
function enableRemove(marker,id){
  marker.on("click",()=>{
    const r = allReports[id];
    if(r){
      const created = new Date(r.created_at).toLocaleString();
      const deleted = r.deleted_at ? new Date(r.deleted_at).toLocaleString() : "Ancora presente";
      details.innerHTML = `<strong>Segnalazione ID:</strong> ${id}<br><strong>Data inserimento:</strong> ${created}<br><strong>Data rimozione:</strong> ${deleted}<br><strong>Via:</strong> ${r.street}<br><strong>Descrizione:</strong> ${r.description||"Nessuna"}`;
    }
  });
  marker.on("dblclick", async ()=>{
    await deleteReport(id);
    clusterGroup.removeLayer(markers[id].marker);
    addChat(`❌ Cacca rimossa`, id);
    delete markers[id];
    activeCount--; deletedCount++; updateStats();
    if(allReports[id]) allReports[id].deleted_at = new Date().toISOString();
  });
}

// --- LAYER MAPPA ---
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// --- BOTTONE CENTRA SU DI ME ---
const locateControl = L.control({position:"topleft"});
locateControl.onAdd = ()=>{
  const btn=L.DomUtil.create("button");
  btn.innerHTML="📍"; btn.title="Vai alla tua posizione";
  btn.style.cssText="background:white;border:1px solid #ccc;padding:6px;cursor:pointer;font-size:18px;";
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick=()=>{ if(userPosition) map.setView(userPosition,17); };
  return btn;
};
locateControl.addTo(map);

// --- BOTTONE SEGNALA CACCA QUI ---
const poopControl = L.control({position:"topleft"});
poopControl.onAdd = ()=>{
  const btn=L.DomUtil.create("button");
  btn.innerHTML="💩"; btn.title="Segnala cacca qui";
  btn.style.cssText="background:white;border:1px solid #ccc;padding:6px;cursor:pointer;font-size:18px;margin-top:5px;";
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick=async ()=>{
    if(!userPosition){ alert("Posizione GPS non ancora disponibile"); return; }
    const desc = prompt("Descrizione della cacca (facoltativa)");
    const street = "Via sconosciuta";
    await addReport(userPosition[0], userPosition[1], street, desc);
  };
  return btn;
};
poopControl.addTo(map);
