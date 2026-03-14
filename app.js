// app.js
const map = L.map('map', {
  center: [41.9, 12.5],
  zoom: 13,
  maxZoom: 19   // <- importantissimo per MarkerCluster
});
map.doubleClickZoom.disable()

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
})

// --- POSIZIONE UTENTE ---

let userMarker = null
let accuracyCircle = null
let userPosition = null

if ("geolocation" in navigator) {

  navigator.geolocation.watchPosition(position => {

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = position.coords.accuracy;

    userPosition = [lat,lng];

    // Salva la posizione in localStorage
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
    // Se c'è posizione salvata, centra la mappa lì
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
  // Se geolocalizzazione non disponibile, prova posizione salvata
  const savedPos = localStorage.getItem("lastUserPosition");
  if(savedPos){
    const pos = JSON.parse(savedPos);
    userPosition = pos;
    map.setView(pos,16);
  }
}
const markers = {}
const allReports = {} // contiene tutti i report, anche cancellati
const chat = document.getElementById("chat")

// --- CONTATORI FOOTER ---

const activeCountEl = document.getElementById("active-count")
const deletedCountEl = document.getElementById("deleted-count")
const totalCountEl = document.getElementById("total-count")

let activeCount = 0
let deletedCount = 0

function updateStats(){
  activeCountEl.textContent = `Attive: ${activeCount}`
  deletedCountEl.textContent = `Eliminate: ${deletedCount}`
  totalCountEl.textContent = `Totali: ${activeCount + deletedCount}`
}

// carica statistiche dal server
fetch("/stats")
.then(r=>r.json())
.then(data=>{
  activeCount = data.active
  deletedCount = data.deleted
  updateStats()
})

// Pannello dettagli a destra della mappa
// const details = document.createElement("div")
// details.id = "details"
// details.style.width = "250px"
// details.style.borderLeft = "1px solid #ccc"
// details.style.padding = "10px"
// details.style.overflowY = "auto"
// details.style.background = "#f0f0f0"
// details.style.boxSizing = "border-box"
// document.body.appendChild(details)
const details = document.getElementById("details") // usa il div già presente

// Funzione per aggiungere messaggi in chat
function addChat(message, reportId=null){
  const entry = document.createElement("div")
  entry.className = "chat-entry"
  entry.textContent = message

  // click sulla chat per mostrare dettagli
  if(reportId){
    entry.style.cursor = "pointer"
    entry.addEventListener("click", ()=>{
      const report = allReports[reportId]
      if(report){
        const created = new Date(report.created_at).toLocaleString()
        const deleted = report.deleted_at ? new Date(report.deleted_at).toLocaleString() : "Ancora presente"
        details.innerHTML = `
          <strong>Segnalazione ID:</strong> ${reportId}<br>
          <strong>Data inserimento:</strong> ${created}<br>
          <strong>Data rimozione:</strong> ${deleted}<br>
          <strong>Via:</strong> ${report.street}<br>
          <strong>Descrizione:</strong> ${report.description || "Nessuna"}
        `
      }
    })
  }

  chat.appendChild(entry)

  // limite massimo messaggi
  if(chat.children.length > 50){
    chat.removeChild(chat.firstChild)
  }

  chat.scrollTop = chat.scrollHeight
}

// Carica eventi preesistenti e popola la chat
fetch("/events")
.then(r=>r.json())
.then(data=>{
  data.forEach(ev=>{
    const formatted = new Date(ev.timestamp).toLocaleString()
    const street = ev.street || "Via sconosciuta"
    const description = ev.description || null
    if(ev.type==="add"){
      addChat(`✅ Cacca segnalata il ${formatted} in ${street}`, ev.report_id)
      allReports[ev.report_id] = { street, created_at: ev.timestamp, description }    }
    if(ev.type==="delete"){
      addChat(`❌ Cacca rimossa il ${formatted} in ${street}`, ev.report_id)
      if(allReports[ev.report_id]){
        allReports[ev.report_id].deleted_at = ev.timestamp
      }
    }
  })
})

// Layer mappa
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

// Carica i marker già presenti
fetch("/reports")
.then(r=>r.json())
.then(data=>{
  data.forEach(p=>{
    const marker = L.marker([p.latitude,p.longitude],{
      icon: poopIcon
    })
    clusterGroup.addLayer(marker)

    const date = new Date(p.created_at)
    const formatted = date.toLocaleString()

    marker.bindTooltip(`Aggiunta il: ${formatted}\n${p.street}`, {direction:"top"})

    markers[p.id] = { marker: marker, street: p.street, created_at: p.created_at, description: p.description }
    allReports[p.id] = { street: p.street, created_at: p.created_at, description: p.description }

    enableRemove(marker,p.id)
  })
})

// Click sulla mappa per aggiungere nuove cacche
map.on("click", function(e){

  const description = prompt("Inserisci una descrizione della cacca (facoltativo)")

  fetch("/report",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      lat:e.latlng.lat,
      lng:e.latlng.lng,
      description:description
    })
  })

})

// WebSocket per aggiornamenti in tempo reale
const socket = new WebSocket("ws://localhost:3000")

socket.onmessage = event=>{
  const msg = JSON.parse(event.data)

  if(msg.type==="new"){
    const p = msg.data
    if(!markers[p.id]){
      const marker = L.marker([p.latitude,p.longitude],{
        icon: poopIcon
      })
      clusterGroup.addLayer(marker)

      const date = new Date(p.created_at)
      const formatted = date.toLocaleString()

      marker.bindTooltip(`Aggiunta il: ${formatted}\n${p.street}`, {direction:"top"})

      markers[p.id] = { marker: marker, street: p.street, created_at: p.created_at, description: p.description }
      allReports[p.id] = { street: p.street, created_at: p.created_at, description: p.description }
      enableRemove(marker,p.id)
      addChat(`✅ Cacca aggiunta il ${formatted} in ${p.street}`, p.id)

      activeCount++
      updateStats()
    }
  }

  if(msg.type==="delete"){
    const data = markers[msg.id]
    if(data){
      clusterGroup.removeLayer(data.marker)
      delete markers[msg.id]

      const formatted = new Date().toLocaleString()
      addChat(`❌ Cacca rimossa il ${formatted} in ${data.street}`, msg.id)

      if(allReports[msg.id]){
        allReports[msg.id].deleted_at = new Date().toISOString()
      }
      activeCount--
      deletedCount++
      updateStats()
    }
  }
}

// Funzione per cancellare i marker con click
function enableRemove(marker,id){

  // CLICK = mostra dettagli
  marker.on("click", function(e){

    L.DomEvent.stopPropagation(e)

    const report = allReports[id]

    if(report){

      const created = new Date(report.created_at).toLocaleString()
      const deleted = report.deleted_at
        ? new Date(report.deleted_at).toLocaleString()
        : "Ancora presente"

      details.innerHTML = `
        <strong>Segnalazione ID:</strong> ${id}<br>
        <strong>Data inserimento:</strong> ${created}<br>
        <strong>Data rimozione:</strong> ${deleted}<br>
        <strong>Via:</strong> ${report.street}<br>
        <strong>Descrizione:</strong> ${report.description || "Nessuna"}
      `
    }

  })

  // DOPPIO CLICK = cancella
  marker.on("dblclick", function(e){

    L.DomEvent.stopPropagation(e)

    fetch(`/report/${id}`,{
      method:"DELETE"
    })

  })

}

// --- BOTTONE CENTRA SU DI ME ---

const locateControl = L.control({position:"topleft"})

locateControl.onAdd = function(){

  const btn = L.DomUtil.create("button")

  btn.innerHTML = "📍"
  btn.title = "Vai alla tua posizione"

  btn.style.background = "white"
  btn.style.border = "1px solid #ccc"
  btn.style.padding = "6px"
  btn.style.cursor = "pointer"
  btn.style.fontSize = "18px"

  // BLOCCA propagazione alla mappa
  L.DomEvent.disableClickPropagation(btn)

  btn.onclick = function(e){
    L.DomEvent.stopPropagation(e)

    if(userPosition){
      map.setView(userPosition,17)
    }
  }

  return btn
}

locateControl.addTo(map)

// --- BOTTONE SEGNALA CACCA QUI ---

const poopControl = L.control({position:"topleft"})

poopControl.onAdd = function(){

  const btn = L.DomUtil.create("button")

  btn.innerHTML = "💩"
  btn.title = "Segnala cacca qui"

  btn.style.background = "white"
  btn.style.border = "1px solid #ccc"
  btn.style.padding = "6px"
  btn.style.cursor = "pointer"
  btn.style.fontSize = "18px"
  btn.style.marginTop = "5px"

  // evita che il click passi alla mappa
  L.DomEvent.disableClickPropagation(btn)

  btn.onclick = function(e){

    L.DomEvent.stopPropagation(e)

    if(!userPosition){
      alert("Posizione GPS non ancora disponibile")
      return
    }

    const description = prompt("Descrizione della cacca (facoltativa)")

    fetch("/report",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        lat:userPosition[0],
        lng:userPosition[1],
        description:description
      })
    })

  }

  return btn
}

poopControl.addTo(map)

