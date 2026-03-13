// --- CONFIGURAZIONE SUPABASE ---
const supabaseUrl = "https://gvlwrwcbcbsdjiauzxuq.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g"
const supabase = supabase.createClient(supabaseUrl, supabaseKey)

// --- MAPPA ---
const map = L.map('map', {
  center: [41.9, 12.5],
  zoom: 13,
  maxZoom: 19
});
map.doubleClickZoom.disable()

// --- CLUSTER CACCHETTE ---
const clusterGroup = L.markerClusterGroup({
  iconCreateFunction: cluster => {
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

    userPosition = [lat, lng];
    localStorage.setItem("lastUserPosition", JSON.stringify(userPosition));

    if(!userMarker){
      userMarker = L.circleMarker([lat,lng],{ radius:8, color:"#007bff", fillColor:"#007bff", fillOpacity:1 }).addTo(map);
      accuracyCircle = L.circle([lat,lng],{ radius:accuracy, color:"#007bff", fillColor:"#007bff", fillOpacity:0.15, weight:1 }).addTo(map);
      map.setView([lat,lng],16);
    } else {
      userMarker.setLatLng([lat,lng]);
      accuracyCircle.setLatLng([lat,lng]);
      accuracyCircle.setRadius(accuracy);
    }

  }, err=>{
    const savedPos = localStorage.getItem("lastUserPosition");
    if(savedPos){
      const pos = JSON.parse(savedPos);
      userPosition = pos;
      map.setView(pos,16);
    }
  }, { enableHighAccuracy:true, maximumAge:1000, timeout:10000 });
} else {
  const savedPos = localStorage.getItem("lastUserPosition");
  if(savedPos){
    const pos = JSON.parse(savedPos);
    userPosition = pos;
    map.setView(pos,16);
  }
}

// --- STATISTICHE ---
const markers = {};
const allReports = {};
const chat = document.getElementById("chat");
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

// Carica statistiche
async function loadStats(){
  const { data } = await supabase
    .from('poop_reports')
    .select('id', { count: 'exact' });
  activeCount = data.length;

  const { data: deletedData } = await supabase
    .from('events')
    .select('id', { count: 'exact' })
    .eq('type','delete');
  deletedCount = deletedData.length;

  updateStats();
}
loadStats();

// --- DETTAGLI ---
const details = document.getElementById("details");

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

// --- CARICA MARKER ESISTENTI ---
async function loadReports(){
  const { data } = await supabase.from('poop_reports').select('*');
  data.forEach(p => {
    const marker = L.marker([p.latitude,p.longitude],{ icon: poopIcon });
    clusterGroup.addLayer(marker);

    const date = new Date(p.created_at).toLocaleString();
    marker.bindTooltip(`Aggiunta il: ${date}\n${p.street}`, {direction:"top"});

    markers[p.id] = { marker, street:p.street, created_at:p.created_at, description:p.description };
    allReports[p.id] = { street:p.street, created_at:p.created_at, description:p.description };

    enableRemove(marker,p.id);
  });
}
loadReports();

// --- FUNZIONE AGGIUNGI CACCA ---
async function addReport(lat,lng,street,description){
  const { data, error } = await supabase
    .from('poop_reports')
    .insert([{ latitude: lat, longitude: lng, street: street, description: description }])
    .select()
    .single();

  return error ? null : data;
}

// --- CLICK SULLA MAPPA ---
map.on("click", async e => {
  const description = prompt("Descrizione cacca (facoltativa)");
  if(!userPosition) return alert("Posizione GPS non disponibile");

  const newReport = await addReport(e.latlng.lat, e.latlng.lng, "Via sconosciuta", description);
  if(newReport){
    const marker = L.marker([newReport.latitude,newReport.longitude],{ icon: poopIcon });
    clusterGroup.addLayer(marker);

    markers[newReport.id] = { marker, street:newReport.street, created_at:newReport.created_at, description:newReport.description };
    allReports[newReport.id] = { street:newReport.street, created_at:newReport.created_at, description:newReport.description };

    enableRemove(marker,newReport.id);
    addChat(`✅ Cacca aggiunta in ${newReport.street}`, newReport.id);

    activeCount++;
    updateStats();
  }
});

// --- SUPABASE REALTIME ---
supabase
  .channel('realtime-poop')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'poop_reports' }, payload => {
    const p = payload.new || payload.old;
    if(payload.eventType === 'INSERT'){
      if(!markers[p.id]){
        const marker = L.marker([p.latitude,p.longitude],{ icon: poopIcon });
        clusterGroup.addLayer(marker);

        markers[p.id] = { marker, street:p.street, created_at:p.created_at, description:p.description };
        allReports[p.id] = { street:p.street, created_at:p.created_at, description:p.description };

        enableRemove(marker,p.id);
        addChat(`✅ Cacca aggiunta in ${p.street}`, p.id);

        activeCount++;
        updateStats();
      }
    }
    if(payload.eventType === 'DELETE'){
      if(markers[p.id]){
        clusterGroup.removeLayer(markers[p.id].marker);
        delete markers[p.id];

        if(allReports[p.id]) allReports[p.id].deleted_at = new Date().toISOString();
        addChat(`❌ Cacca rimossa in ${p.street}`, p.id);

        activeCount--;
        deletedCount++;
        updateStats();
      }
    }
  })
  .subscribe();

// --- FUNZIONE ENABLE REMOVE ---
function enableRemove(marker,id){
  marker.on("click", e => {
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

  marker.on("dblclick", async e => {
    L.DomEvent.stopPropagation(e);
    await supabase.from('poop_reports').delete().eq('id', id);
  });
}

// --- BOTTONE CENTRA SU DI ME ---
const locateControl = L.control({position:"topleft"});
locateControl.onAdd = () => {
  const btn = L.DomUtil.create("button");
  btn.innerHTML = "📍"; btn.title = "Vai alla tua posizione";
  btn.style.background="white"; btn.style.border="1px solid #ccc"; btn.style.padding="6px"; btn.style.cursor="pointer"; btn.style.fontSize="18px";
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick = e => { if(userPosition) map.setView(userPosition,17); };
  return btn;
};
locateControl.addTo(map);

// --- BOTTONE SEGNALA CACCA ---
const poopControl = L.control({position:"topleft"});
poopControl.onAdd = () => {
  const btn = L.DomUtil.create("button");
  btn.innerHTML = "💩"; btn.title="Segnala cacca qui";
  btn.style.background="white"; btn.style.border="1px solid #ccc"; btn.style.padding="6px"; btn.style.cursor="pointer"; btn.style.fontSize="18px"; btn.style.marginTop="5px";
  L.DomEvent.disableClickPropagation(btn);
  btn.onclick = async ()=>{
    if(!userPosition) return alert("Posizione GPS non disponibile");
    const description = prompt("Descrizione della cacca (facoltativa)");
    const newReport = await addReport(userPosition[0], userPosition[1], "Via sconosciuta", description);
    if(newReport){
      const marker = L.marker([newReport.latitude,newReport.longitude],{ icon: poopIcon });
      clusterGroup.addLayer(marker);

      markers[newReport.id] = { marker, street:newReport.street, created_at:newReport.created_at, description:newReport.description };
      allReports[newReport.id] = { street:newReport.street, created_at:newReport.created_at, description:newReport.description };

      enableRemove(marker,newReport.id);
      addChat(`✅ Cacca aggiunta in ${newReport.street}`, newReport.id);

      activeCount++;
      updateStats();
    }
  };
  return btn;
};
poopControl.addTo(map);

// --- LAYER MAPPA ---
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
