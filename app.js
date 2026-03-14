// --- CONFIGURAZIONE SUPABASE ---
const SUPABASE_URL = "https://gvlwrwcbcbsdjiauzxuq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g";

const supabaseClient = Supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- MAPPA ---
const map = L.map('map', { center: [41.9,12.5], zoom: 13, maxZoom: 19 });
map.doubleClickZoom.disable();

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// --- CLUSTER ---
const clusterGroup = L.markerClusterGroup({
  iconCreateFunction: cluster => L.divIcon({
    html: `💩<br>${cluster.getChildCount()}`,
    className: 'poop-cluster',
    iconSize: [40,40],
    iconAnchor: [20,20]
  })
});
map.addLayer(clusterGroup);

// --- MARKER ICON ---
const poopIcon = L.divIcon({ html:"💩", className:"poop-marker", iconSize:[30,30], iconAnchor:[15,15] });

// --- POSIZIONE UTENTE ---
let userMarker = null, accuracyCircle = null, userPosition = null;
if("geolocation" in navigator){
  navigator.geolocation.watchPosition(pos=>{
    const lat = pos.coords.latitude, lng = pos.coords.longitude, acc = pos.coords.accuracy;
    userPosition = [lat,lng];
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
    const saved = localStorage.getItem("lastUserPosition");
    if(saved){ userPosition = JSON.parse(saved); map.setView(userPosition,16); }
  }, { enableHighAccuracy:true, maximumAge:1000, timeout:10000 });
} else {
  const saved = localStorage.getItem("lastUserPosition");
  if(saved){ userPosition = JSON.parse(saved); map.setView(userPosition,16); }
}

// --- CONTATORI ---
const activeCountEl = document.getElementById("active-count");
const deletedCountEl = document.getElementById("deleted-count");
const totalCountEl = document.getElementById("total-count");
let activeCount = 0, deletedCount = 0;
function updateStats(){ 
  activeCountEl.textContent=`Attive: ${activeCount}`; 
  deletedCountEl.textContent=`Eliminate: ${deletedCount}`; 
  totalCountEl.textContent=`Totali: ${activeCount+deletedCount}`; 
}

// --- CHAT ---
const chat = document.getElementById("chat");
const details = document.getElementById("details");
const allReports = {};
const markers = {};

function addChat(message, reportId=null){
  const entry = document.createElement("div");
  entry.className="chat-entry"; 
  entry.textContent=message;
  if(reportId){
    entry.style.cursor="pointer";
    entry.addEventListener("click", ()=>{
      const report = allReports[reportId];
      if(report){
        const created = new Date(report.created_at).toLocaleString();
        const deleted = report.deleted_at ? new Date(report.deleted_at).toLocaleString() : "Ancora presente";
        details.innerHTML = `<strong>Segnalazione ID:</strong> ${reportId}<br>
          <strong>Data inserimento:</strong> ${created}<br>
          <strong>Data rimozione:</strong> ${deleted}<br>
          <strong>Via:</strong> ${report.street}<br>
          <strong>Descrizione:</strong> ${report.description || "Nessuna"}`;
      }
    });
  }
  chat.appendChild(entry);
  if(chat.children.length>50) chat.removeChild(chat.firstChild);
  chat.scrollTop = chat.scrollHeight;
}

// --- FUNZIONI MARKER ---
function enableRemove(marker,id){
  marker.on("click", e=>{
    L.DomEvent.stopPropagation(e);
    const report = allReports[id];
    if(report){
      const created = new Date(report.created_at).toLocaleString();
      const deleted = report.deleted_at ? new Date(report.deleted_at).toLocaleString() : "Ancora presente";
      details.innerHTML = `<strong>Segnalazione ID:</strong> ${id}<br>
        <strong>Data inserimento:</strong> ${created}<br>
        <strong>Data rimozione:</strong> ${deleted}<br>
        <strong>Via:</strong> ${report.street}<br>
        <strong>Descrizione:</strong> ${report.description || "Nessuna"}`;
    }
  });
  marker.on("dblclick", async e=>{
    L.DomEvent.stopPropagation(e);
    await supabaseClient.from("poop_reports").delete().eq("id", id);
  });
}

// --- LOAD REPORTS ---
async function loadReports(){
  const { data: reports } = await supabaseClient.from("poop_reports").select("*");
  reports.forEach(p=>{
    const marker = L.marker([p.latitude,p.longitude], { icon:poopIcon });
    clusterGroup.addLayer(marker);
    marker.bindTooltip(`Aggiunta il: ${new Date(p.created_at).toLocaleString()}\n${p.street}`, {direction:"top"});
    markers[p.id] = { marker, street:p.street, created_at:p.created_at, description:p.description };
    allReports[p.id] = { street:p.street, created_at:p.created_at, description:p.description };
    enableRemove(marker,p.id);
  });
  activeCount = reports.length;
  updateStats();
}
loadReports();

// --- LOAD EVENTS ---
async function loadEvents(){
  const { data: events } = await supabaseClient.from("events").select("*").order("timestamp",{ascending:true});
  events.forEach(ev=>{
    const formatted = new Date(ev.timestamp).toLocaleString();
    const street = ev.street || "Via sconosciuta";
    const description = ev.description || null;
    if(ev.type==="add"){ addChat(`✅ Cacca segnalata il ${formatted} in ${street}`, ev.report_id); if(!allReports[ev.report_id]) allReports[ev.report_id]={street,created_at:ev.timestamp,description}; }
    if(ev.type==="delete"){ addChat(`❌ Cacca rimossa il ${formatted} in ${street}`, ev.report_id); if(allReports[ev.report_id]) allReports[ev.report_id].deleted_at=ev.timestamp; deletedCount++; activeCount--; updateStats(); }
  });
}
loadEvents();

// --- SUPABASE REALTIME ---
supabaseClient.channel("realtime-poop")
  .on("postgres_changes", { event:"INSERT", schema:"public", table:"poop_reports" }, payload=>{
    const p = payload.new;
    const marker = L.marker([p.latitude,p.longitude], { icon:poopIcon });
    clusterGroup.addLayer(marker);
    marker.bindTooltip(`Aggiunta il: ${new Date(p.created_at).toLocaleString()}\n${p.street}`, {direction:"top"});
    markers[p.id]={marker,street:p.street,created_at:p.created_at,description:p.description};
    allReports[p.id]={street:p.street,created_at:p.created_at,description:p.description};
    enableRemove(marker,p.id);
    addChat(`✅ Cacca aggiunta il ${new Date(p.created_at).toLocaleString()} in ${p.street}`, p.id);
    activeCount++; updateStats();
  })
  .on("postgres_changes", { event:"DELETE", schema:"public", table:"poop_reports" }, payload=>{
    const data = markers[payload.old.id];
    if(data){ 
      clusterGroup.removeLayer(data.marker); 
      delete markers[payload.old.id]; 
      addChat(`❌ Cacca rimossa il ${new Date().toLocaleString()} in ${data.street}`, payload.old.id); 
      if(allReports[payload.old.id]) allReports[payload.old.id].deleted_at=new Date().toISOString(); 
      activeCount--; deletedCount++; updateStats(); 
    }
  })
  .subscribe();

// --- CLICK MAP PER AGGIUNGERE CACCA ---
map.on("click", async function(e){
  if(!userPosition){ alert("Posizione GPS non ancora disponibile"); return; }
  const description = prompt("Inserisci una descrizione della cacca (facoltativo)");
  const lat = e.latlng.lat, lng = e.latlng.lng;
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, { headers:{ "User-Agent":"CacheroonApp" }});
  const streetData = await res.json();
  const street = streetData.address?.road || "Via sconosciuta";
  await supabaseClient.from("poop_reports").insert({ latitude:lat, longitude:lng, street, description });
});

// --- CONTROLLO LOCALIZZAZIONE UTENTE ---
const locateControl = L.control({position:"topleft"});
locateControl.onAdd = ()=>{
  const btn = L.DomUtil.create("button"); 
  btn.innerHTML="📍"; btn.title="Vai alla tua posizione"; 
  btn.style.background="white"; btn.style.border="1px solid #ccc"; btn.style.padding="6px"; 
  btn.style.cursor="pointer"; btn.style.fontSize="18px"; 
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick = e=>{ if(userPosition) map.setView(userPosition,17); };
  return btn;
};
locateControl.addTo(map);

// --- CONTROLLO SEGNALA CACCA ---
const poopControl = L.control({position:"topleft"});
poopControl.onAdd = ()=>{
  const btn = L.DomUtil.create("button"); 
  btn.innerHTML="💩"; btn.title="Segnala cacca qui"; 
  btn.style.background="white"; btn.style.border="1px solid #ccc"; 
  btn.style.padding="6px"; btn.style.cursor="pointer"; btn.style.fontSize="18px"; 
  btn.style.marginTop="5px"; 
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick = async e=>{
    if(!userPosition){ alert("Posizione GPS non ancora disponibile"); return; }
    const description = prompt("Descrizione della cacca (facoltativa)");
    const lat = userPosition[0], lng = userPosition[1];
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, { headers:{ "User-Agent":"CacheroonApp" }});
    const streetData = await res.json();
    const street = streetData.address?.road || "Via sconosciuta";
    await supabaseClient.from("poop_reports").insert({ latitude:lat, longitude:lng, street, description });
  };
  return btn;
};
poopControl.addTo(map);
