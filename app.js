// app.js

// --- CREA MAPPA ---
const map = L.map('map', {
  center: [41.9, 12.5],
  zoom: 13,
  maxZoom: 19
});
map.doubleClickZoom.disable();

// cluster cacche
const clusterGroup = L.markerClusterGroup({
  iconCreateFunction: cluster => {
    return L.divIcon({
      html: `💩<br>${cluster.getChildCount()}`,
      className: 'poop-cluster',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
  }
});
map.addLayer(clusterGroup);

// --- DIV DETTAGLI ---
const details = document.getElementById("details");

// --- ICONA CACCA ---
const poopIcon = L.divIcon({
  html: "💩",
  className: "poop-marker",
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

// --- POSIZIONE UTENTE ---
let userMarker = null;
let accuracyCircle = null;
let userPosition = null;

if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;

    userPosition = [lat, lng];
    localStorage.setItem("lastUserPosition", JSON.stringify(userPosition));

    if (!userMarker) {
      userMarker = L.circleMarker([lat, lng], { radius: 8, color: "#007bff", fillColor: "#007bff", fillOpacity: 1 }).addTo(map);
      accuracyCircle = L.circle([lat, lng], { radius: accuracy, color: "#007bff", fillColor: "#007bff", fillOpacity: 0.15, weight: 1 }).addTo(map);
      map.setView([lat, lng], 16);
    } else {
      userMarker.setLatLng([lat, lng]);
      accuracyCircle.setLatLng([lat, lng]);
      accuracyCircle.setRadius(accuracy);
    }
  }, err => {
    console.log("GPS errore:", err);
    const saved = localStorage.getItem("lastUserPosition");
    if (saved) {
      userPosition = JSON.parse(saved);
      map.setView(userPosition, 16);
    }
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
} else {
  const saved = localStorage.getItem("lastUserPosition");
  if (saved) { userPosition = JSON.parse(saved); map.setView(userPosition, 16); }
}

// --- MARKERS E REPORT ---
const markers = {};
const allReports = {};
const chat = document.getElementById("chat");

// --- CONTATORI ---
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

// carica statistiche dal server
fetch("/stats").then(r => r.json()).then(data => {
  activeCount = data.active;
  deletedCount = data.deleted;
  updateStats();
});

// --- FUNZIONI CHAT ---
function addChat(message, reportId = null) {
  const entry = document.createElement("div");
  entry.className = "chat-entry";
  entry.textContent = message;

  if (reportId) {
    entry.style.cursor = "pointer";
    entry.addEventListener("click", () => showDetails(reportId));
  }

  chat.appendChild(entry);
  if (chat.children.length > 50) chat.removeChild(chat.firstChild);
  chat.scrollTop = chat.scrollHeight;
}

// --- FUNZIONE MOSTRA DETTAGLI ---
function showDetails(id) {
  const report = allReports[id];
  if (!report) return;

  const created = new Date(report.created_at).toLocaleString();
  const deleted = report.deleted_at ? new Date(report.deleted_at).toLocaleString() : "Ancora presente";

  details.innerHTML = `
    <strong>Segnalazione ID:</strong> ${id}<br>
    <strong>Data inserimento:</strong> ${created}<br>
    <strong>Data rimozione:</strong> ${deleted}<br>
    <strong>Via:</strong> ${report.street}<br>
    <strong>Descrizione:</strong> ${report.description || "Nessuna"}<br><br>
    <button id="delete-btn">Elimina</button>
  `;

  const btn = document.getElementById("delete-btn");
  if (btn) {
    btn.onclick = () => deleteReport(id);
  }
}

// --- FUNZIONE ELIMINA REPORT ---
function deleteReport(id) {
  const report = allReports[id];
  if (!report || report.deleted_at) return; // già eliminato, esci

  fetch(`/report/${id}`, { method: "DELETE" })
    .then(() => {
      // rimuove marker dalla mappa
      if (markers[id]) {
        clusterGroup.removeLayer(markers[id].marker);
        delete markers[id];
      }

      // aggiorna lo stato del report
      report.deleted_at = new Date().toISOString();

      // aggiorna contatori
      activeCount = Math.max(0, activeCount - 1);
      deletedCount++;

      updateStats();

      // aggiorna il pannello dettagli se è aperto
      if (details.innerHTML.includes(`Segnalazione ID: ${id}`)) {
        details.innerHTML = "<em>Segnalazione eliminata!</em>";
      }
    })
    .catch(err => console.error("Errore eliminazione:", err));
}

// --- FUNZIONE ABILITA MARKER ---
function enableRemove(marker, id) {
  // click/tap = mostra dettagli
  marker.on("click", e => { L.DomEvent.stopPropagation(e); showDetails(id); });

  // doppio click desktop = cancella
  //marker.on("dblclick", e => { L.DomEvent.stopPropagation(e); deleteReport(id); });

  // long press mobile = cancella
  let pressTimer;
  marker.on("mousedown touchstart", e => {
    pressTimer = setTimeout(() => deleteReport(id), 600);
  });
  marker.on("mouseup touchend touchmove touchcancel", e => {
    clearTimeout(pressTimer);
  });
}

// --- CARICA EVENTI E REPORT ---
fetch("/events").then(r => r.json()).then(data => {
  data.forEach(ev => {
    const formatted = new Date(ev.timestamp).toLocaleString();
    const street = ev.street || "Via sconosciuta";
    const description = ev.description || null;

    if (ev.type === "add") {
      addChat(`✅ Cacca segnalata il ${formatted} in ${street}`, ev.report_id);
      allReports[ev.report_id] = { street, created_at: ev.timestamp, description };
    } else if (ev.type === "delete") {
      addChat(`❌ Cacca rimossa il ${formatted} in ${street}`, ev.report_id);
      if (allReports[ev.report_id]) allReports[ev.report_id].deleted_at = ev.timestamp;
    }
  });
});

fetch("/reports").then(r => r.json()).then(data => {
  data.forEach(p => {
    const marker = L.marker([p.latitude, p.longitude], { icon: poopIcon });
    clusterGroup.addLayer(marker);
    markers[p.id] = { marker, street: p.street, created_at: p.created_at, description: p.description };
    allReports[p.id] = { street: p.street, created_at: p.created_at, description: p.description };
    enableRemove(marker, p.id);
  });
});

// --- CLICK MAPPA PER NUOVA CACCA ---
map.on("click", e => {
  const description = prompt("Inserisci una descrizione della cacca (facoltativo)");
  fetch("/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: e.latlng.lat, lng: e.latlng.lng, description }) });
});

// --- WEBSOCKET ---
const socket = new WebSocket(`ws://${window.location.hostname}:3000`);
socket.onmessage = event => {
  const msg = JSON.parse(event.data);

  if (msg.type === "new") {
    const p = msg.data;
    if (!markers[p.id]) {
      const marker = L.marker([p.latitude, p.longitude], { icon: poopIcon });
      clusterGroup.addLayer(marker);
      markers[p.id] = { marker, street: p.street, created_at: p.created_at, description: p.description };
      allReports[p.id] = { street: p.street, created_at: p.created_at, description: p.description };
      enableRemove(marker, p.id);
      addChat(`✅ Cacca aggiunta il ${new Date(p.created_at).toLocaleString()} in ${p.street}`, p.id);
      activeCount++;
      updateStats();
    }
  } else if (msg.type === "delete") {
    const data = markers[msg.id];
    if (data) {
      clusterGroup.removeLayer(data.marker);
      delete markers[msg.id];
      if (allReports[msg.id]) allReports[msg.id].deleted_at = new Date().toISOString();
      activeCount = Math.max(0, activeCount - 1);
      deletedCount++;
      updateStats();
      addChat(`❌ Cacca rimossa!`, msg.id);
    }
  }
};

// --- TILE LAYER ---
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// --- CONTROLLI MAPPA ---
function addMapControls(){
  const locateControl = L.control({position:"topleft"});
  locateControl.onAdd = function(){
    const btn = L.DomUtil.create("button");
    btn.innerHTML="📍"; btn.title="Vai alla tua posizione";
    btn.style.cssText="background:white;border:1px solid #ccc;padding:6px;cursor:pointer;font-size:18px;";
    L.DomEvent.disableClickPropagation(btn);
    btn.onclick=e=>{ if(userPosition) map.setView(userPosition,17); };
    return btn;
  };
  locateControl.addTo(map);

  const poopControl = L.control({position:"topleft"});
  poopControl.onAdd = function(){
    const btn = L.DomUtil.create("button");
    btn.innerHTML="💩"; btn.title="Segnala cacca qui";
    btn.style.cssText="background:white;border:1px solid #ccc;padding:6px;cursor:pointer;font-size:18px;margin-top:5px;";
    L.DomEvent.disableClickPropagation(btn);
    btn.onclick=e=>{
      if(!userPosition){ alert("Posizione GPS non disponibile"); return; }
      const description = prompt("Descrizione della cacca (facoltativa)");
      fetch("/report",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ lat:userPosition[0], lng:userPosition[1], description }) });
    };
    return btn;
  };
  poopControl.addTo(map);
}
addMapControls();
