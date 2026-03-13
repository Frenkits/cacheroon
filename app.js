// --- INIZIALIZZAZIONE SUPABASE ---
const supabase = createClient(
  "https://gvlwrwcbcbsdjiauzxuq.supabase.co",  // il tuo URL Supabase
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g" // la tua chiave anon
);

// --- MAPPA ---
const map = L.map('map', {
  center: [41.9, 12.5],
  zoom: 13,
  maxZoom: 19
});
map.doubleClickZoom.disable();

// cluster cacche
const clusterGroup = L.markerClusterGroup({
  iconCreateFunction: function(cluster) {
    const count = cluster.getChildCount();
    return L.divIcon({
      html: `💩<br>${count}`,
      className: 'poop-cluster',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
  }
});
map.addLayer(clusterGroup);

const poopIcon = L.divIcon({
  html: "💩",
  className: "poop-marker",
  iconSize: [30,30],
  iconAnchor: [15,15]
});

// --- POSIZIONE UTENTE ---
let userMarker = null;
let accuracyCircle = null;
let userPosition = null;

if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(position => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = position.coords.accuracy;

    userPosition = [lat,lng];
    localStorage.setItem("lastUserPosition", JSON.stringify(userPosition));

    if(!userMarker){
      userMarker = L.circleMarker([lat,lng],{
        radius:8,
        color:"#007bff",
        fillColor:"#007bff",
        fillOpacity:1
      }).addTo(map);

      accuracyCircle = L.circle([lat,lng],{
        radius: accuracy,
        color:"#007bff",
        fillColor:"#007bff",
        fillOpacity:0.15,
        weight:1
      }).addTo(map);

      map.setView([lat,lng],16);
    } else {
      userMarker.setLatLng([lat,lng]);
      accuracyCircle.setLatLng([lat,lng]);
      accuracyCircle.setRadius(accuracy);
    }

  }, err=>{
    console.log("GPS errore:",err);
    const savedPos = localStorage.getItem("lastUserPosition");
    if(savedPos){
      const pos = JSON.parse(savedPos);
      userPosition = pos;
      map.setView(pos,16);
    }
  },{
    enableHighAccuracy:true,
    maximumAge:1000,
    timeout:10000
  });
} else {
  const savedPos = localStorage.getItem("lastUserPosition");
  if(savedPos){
    const pos = JSON.parse(savedPos);
    userPosition = pos;
    map.setView(pos,16);
  }
}

const markers = {};
const allReports = {}; // contiene tutti i report, anche cancellati
const chat = document.getElementById("chat");

// --- CONTATORI FOOTER ---
const activeCountEl = document.getElementById("active-count");
const deletedCountEl = document.getElementById("deleted-count");
const totalCountEl = document.getElementById("total-count");
let activeCount = 0;
let deletedCount = 0;

function updateStats(){
  activeCountEl.textContent = `Attive: ${activeCount}`;
  deletedCountEl.textContent = `Eliminate: ${deletedCount}`;
  totalCountEl.textContent = `Totali: ${activeCount + deletedCount}`;
}

// carica statistiche dal server (Supabase)
async function loadStats(){
  const { data: activeData, error: activeError } = await supabase
    .from('poop_reports')
    .select('id', { count: 'exact' });
  const { data: deletedData, error: deletedError } = await supabase
    .from('events')
    .select('id', { count: 'exact' })
    .eq('type','delete');

  activeCount = activeData?.length || 0;
  deletedCount = deletedData?.length || 0;
  updateStats();
}
loadStats();

// Pannello dettagli
const details = document.getElementById("details");

// Funzione per chat
function addChat(message, reportId=null){
  const entry = document.createElement("div");
  entry.className = "chat-entry";
  entry.textContent = message;

  if(reportId){
    entry.style.cursor = "pointer";
    entry.addEventListener("click", ()=>{
      const report = allReports[reportId];
      if(report){
        const created = new Date(report.created_at).toLocaleString();
        const deleted = report.deleted_at ? new Date(report.deleted_at).toLocaleString() : "Ancora presente";
        details.innerHTML = `
          <strong>Segnalazione ID:</strong> ${reportId}<br>
          <strong>Data inserimento:</strong> ${created}<br>
          <strong>Data rimozione:</strong> ${deleted}<br>
          <strong>Via:</strong> ${report.street}<br>
          <strong>Descrizione:</strong> ${report.description || "Nessuna"}
        `;
      }
    });
  }

  chat.appendChild(entry);
  if(chat.children.length > 50) chat.removeChild(chat.firstChild);
  chat.scrollTop = chat.scrollHeight;
}

// Carica eventi preesistenti
async function loadEvents(){
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(50);

  data?.reverse().forEach(ev=>{
    const formatted = new Date(ev.timestamp).toLocaleString();
    const street = ev.street || "Via sconosciuta";
    const description = ev.description || null;

    if(ev.type==="add"){
      addChat(`✅ Cacca segnalata il ${formatted} in ${street}`, ev.report_id);
      allReports[ev.report_id] = { street, created_at: ev.timestamp, description };
    }
    if(ev.type==="delete"){
      addChat(`❌ Cacca rimossa il ${formatted} in ${street}`, ev.report_id);
      if(allReports[ev.report_id]){
        allReports[ev.report_id].deleted_at = ev.timestamp;
      }
    }
  });
}
loadEvents();

// Layer mappa
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Carica i marker già presenti
async function loadReports(){
  const { data, error } = await supabase.from('poop_reports').select('*');
  data?.forEach(p=>{
    const marker = L.marker([p.latitude,p.longitude],{ icon: poopIcon });
    clusterGroup.addLayer(marker);

    const date = new Date(p.created_at);
    const formatted = date.toLocaleString();
    marker.bindTooltip(`Aggiunta il: ${formatted}\n${p.street}`, {direction:"top"});

    markers[p.id] = { marker: marker, street: p.street, created_at: p.created_at, description: p.description };
    allReports[p.id] = { street: p.street, created_at: p.created_at, description: p.description };

    enableRemove(marker,p.id);
  });
}
loadReports();

// Click mappa
map.on("click", async function(e){
  const description = prompt("Inserisci una descrizione della cacca (facoltativo)");
  const { data, error } = await supabase
    .from('poop_reports')
    .insert([{ latitude:e.latlng.lat, longitude:e.latlng.lng, street:null, description }])
    .select()
  if(data?.length){
    const report = data[0];
    addChat(`✅ Cacca aggiunta in ${report.street || "Via sconosciuta"}`, report.id);
    allReports[report.id] = report;

    const marker = L.marker([report.latitude, report.longitude], { icon: poopIcon });
    clusterGroup.addLayer(marker);
    markers[report.id] = { marker, street: report.street, created_at: report.created_at, description: report.description };
    enableRemove(marker, report.id);
    activeCount++;
    updateStats();
  }
});

// --- BOTTONE CENTRA SU DI ME ---
const locateControl = L.control({position:"topleft"});
locateControl.onAdd = function(){
  const btn = L.DomUtil.create("button");
  btn.innerHTML = "📍";
  btn.title = "Vai alla tua posizione";
  btn.style.background = "white";
  btn.style.border = "1px solid #ccc";
  btn.style.padding = "6px";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "18px";
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick = function(e){
    L.DomEvent.stopPropagation(e);
    if(userPosition) map.setView(userPosition,17);
  };
  return btn;
}
locateControl.addTo(map);

// --- BOTTONE SEGNALA CACCA ---
const poopControl = L.control({position:"topleft"});
poopControl.onAdd = function(){
  const btn = L.DomUtil.create("button");
  btn.innerHTML = "💩";
  btn.title = "Segnala cacca qui";
  btn.style.background = "white";
  btn.style.border = "1px solid #ccc";
  btn.style.padding = "6px";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "18px";
  btn.style.marginTop = "5px";
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick = async function(e){
    L.DomEvent.stopPropagation(e);
    if(!userPosition){
      alert("Posizione GPS non ancora disponibile");
      return;
    }
    const description = prompt("Descrizione della cacca (facoltativa)");
    const { data, error } = await supabase
      .from('poop_reports')
      .insert([{ latitude:userPosition[0], longitude:userPosition[1], street:null, description }])
      .select();
    if(data?.length){
      const report = data[0];
      addChat(`✅ Cacca aggiunta in ${report.street || "Via sconosciuta"}`, report.id);
      allReports[report.id] = report;

      const marker = L.marker([report.latitude, report.longitude], { icon: poopIcon });
      clusterGroup.addLayer(marker);
      markers[report.id] = { marker, street: report.street, created_at: report.created_at, description: report.description };
      enableRemove(marker, report.id);
      activeCount++;
      updateStats();
    }
  };
  return btn;
}
poopControl.addTo(map);

// --- FUNZIONE ENABLE REMOVE ---
function enableRemove(marker,id){
  marker.on("click", function(e){
    L.DomEvent.stopPropagation(e);
    const report = allReports[id];
    if(report){
      const created = new Date(report.created_at).toLocaleString();
      const deleted = report.deleted_at ? new Date(report.deleted_at).toLocaleString() : "Ancora presente";
      details.innerHTML = `
        <strong>Segnalazione ID:</strong> ${id}<br>
        <strong>Data inserimento:</strong> ${created}<br>
        <strong>Data rimozione:</strong> ${deleted}<br>
        <strong>Via:</strong> ${report.street}<br>
        <strong>Descrizione:</strong> ${report.description || "Nessuna"}
      `;
    }
  });

  marker.on("dblclick", async function(e){
    L.DomEvent.stopPropagation(e);
    const { error } = await supabase.from('poop_reports').delete().eq('id', id);
    clusterGroup.removeLayer(markers[id].marker);
    delete markers[id];
    addChat(`❌ Cacca rimossa`, id);
    activeCount--;
    deletedCount++;
    updateStats();
  });
}
