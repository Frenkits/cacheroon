// app.js
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

// carica statistiche dal server
fetch("/stats")
.then(r=>r.json())
.then(data=>{
  activeCount = data.active;
  deletedCount = data.deleted;
  updateStats();
});

// --- Funzioni utili ---
function addChat(message, reportId=null){
  const entry = document.createElement("div");
  entry.className = "chat-entry";
  entry.textContent = message;

  if(reportId){
    entry.style.cursor = "pointer";
    entry.addEventListener("click", ()=>showDetails(reportId));
  }

  chat.appendChild(entry);

  if(chat.children.length > 50) chat.removeChild(chat.firstChild);
  chat.scrollTop = chat.scrollHeight;
}

function showDetails(id){
  const report = allReports[id];
  if(!report) return;

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
  if(btn){
    btn.onclick = () => {
      // evita decremento doppio
      if(!report.deleted_at){
        fetch(`/report/${id}`, { method: "DELETE" })
          .then(()=>{
            if(markers[id]) clusterGroup.removeLayer(markers[id].marker);
            delete markers[id];

            report.deleted_at = new Date().toISOString();
            activeCount = Math.max(0, activeCount - 1);
            deletedCount++;
            updateStats();

            details.innerHTML = "<em>Segnalazione eliminata!</em>";
          })
          .catch(err => {
            console.error("Errore eliminazione:", err);
            alert("Errore durante l'eliminazione.");
          });
      }
    };
  }
}

// --- Abilita click/tap sui marker ---
function enableRemove(marker,id){
  // click/tap = mostra dettagli
  marker.on("click", e=>{
    L.DomEvent.stopPropagation(e);
    showDetails(id);
  });

  // dblclick = cancella solo desktop
  marker.on("dblclick", e=>{
    L.DomEvent.stopPropagation(e);
    const report = allReports[id];
    if(report && !report.deleted_at){
      fetch(`/report/${id}`, { method:"DELETE" })
        .then(()=>{
          if(markers[id]) clusterGroup.removeLayer(markers[id].marker);
          delete markers[id];

          report.deleted_at = new Date().toISOString();
          activeCount = Math.max(0, activeCount - 1);
          deletedCount++;
          updateStats();
        })
        .catch(err => console.error(err));
    }
  });
}

// --- Caricamento dati iniziali ---
fetch("/events").then(r=>r.json()).then(data=>{
  data.forEach(ev=>{
    const formatted = new Date(ev.timestamp).toLocaleString();
    const street = ev.street || "Via sconosciuta";
    const description = ev.description || null;
    if(ev.type==="add"){
      addChat(`✅ Cacca segnalata il ${formatted} in ${street}`, ev.report_id);
      allReports[ev.report_id] = { street, created_at: ev.timestamp, description };
    }
    if(ev.type==="delete"){
      addChat(`❌ Cacca rimossa il ${formatted} in ${street}`, ev.report_id);
      if(allReports[ev.report_id]) allReports[ev.report_id].deleted_at = ev.timestamp;
    }
  });
});

fetch("/reports").then(r=>r.json()).then(data=>{
  data.forEach(p=>{
    const marker = L.marker([p.latitude,p.longitude],{ icon: poopIcon });
    clusterGroup.addLayer(marker);

    marker.bindTooltip(`Aggiunta il: ${new Date(p.created_at).toLocaleString()}\n${p.street}`, {direction:"top"});

    markers[p.id] = { marker: marker, street: p.street, created_at: p.created_at, description: p.description };
    allReports[p.id] = { street: p.street, created_at: p.created_at, description: p.description };

    enableRemove(marker,p.id);
  });
});

// click sulla mappa per aggiungere nuove cacche
map.on("click", e=>{
  const description = prompt("Inserisci una descrizione della cacca (facoltativo)");
  fetch("/report",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ lat:e.latlng.lat, lng:e.latlng.lng, description })
  });
});

// --- WebSocket ---
const socket = new WebSocket(`ws://${window.location.hostname}:3000`);
socket.onmessage = event=>{
  const msg = JSON.parse(event.data);

  if(msg.type==="new"){
    const p = msg.data;
    if(!markers[p.id]){
      const marker = L.marker([p.latitude,p.longitude],{ icon: poopIcon });
      clusterGroup.addLayer(marker);

      marker.bindTooltip(`Aggiunta il: ${new Date(p.created_at).toLocaleString()}\n${p.street}`, {direction:"top"});

      markers[p.id] = { marker, street: p.street, created_at: p.created_at, description: p.description };
      allReports[p.id] = { street: p.street, created_at: p.created_at, description: p.description };
      enableRemove(marker,p.id);
      addChat(`✅ Cacca aggiunta il ${new Date(p.created_at).toLocaleString()} in ${p.street}`, p.id);

      activeCount++;
      updateStats();
    }
  }

  if(msg.type==="delete"){
    const data = markers[msg.id];
    const report = allReports[msg.id];
    if(data && report && !report.deleted_at){
      clusterGroup.removeLayer(data.marker);
      delete markers[msg.id];

      report.deleted_at = new Date().toISOString();
      activeCount = Math.max(0, activeCount - 1);
      deletedCount++;
      updateStats();

      addChat(`❌ Cacca rimossa il ${new Date().toLocaleString()} in ${data.street}`, msg.id);
    }
  }
};

// --- CONTROLLI MAPPA: CENTRA E SEGNALA ---
function addMapControls(){
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
    btn.onclick = e=>{ if(userPosition) map.setView(userPosition,17); };
    return btn;
  };
  locateControl.addTo(map);

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
    btn.onclick = e=>{
      if(!userPosition){ alert("Posizione GPS non disponibile"); return; }
      const description = prompt("Descrizione della cacca (facoltativa)");
      fetch("/report", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ lat:userPosition[0], lng:userPosition[1], description }) });
    };
    return btn;
  };
  poopControl.addTo(map);
}
addMapControls();
