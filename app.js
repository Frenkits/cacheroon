// app.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://gvlwrwcbcbsdjiauzxuq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g'
const supabase = createClient(supabaseUrl, supabaseKey)

const map = L.map('map', {
  center: [41.9, 12.5],
  zoom: 13,
  maxZoom: 19
});
map.doubleClickZoom.disable();

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

let userMarker = null, accuracyCircle = null, userPosition = null;

// --- Geolocalizzazione ---
if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(position => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = position.coords.accuracy;
    userPosition = [lat,lng];
    localStorage.setItem("lastUserPosition", JSON.stringify(userPosition));

    if(!userMarker){
      userMarker = L.circleMarker([lat,lng],{ radius:8, color:"#007bff", fillColor:"#007bff", fillOpacity:1 }).addTo(map);
      accuracyCircle = L.circle([lat,lng],{ radius: accuracy, color:"#007bff", fillColor:"#007bff", fillOpacity:0.15, weight:1 }).addTo(map);
      map.setView([lat,lng],16);
    } else {
      userMarker.setLatLng([lat,lng]);
      accuracyCircle.setLatLng([lat,lng]);
      accuracyCircle.setRadius(accuracy);
    }
  }, err => {
    console.log("GPS errore:",err);
    const savedPos = localStorage.getItem("lastUserPosition");
    if(savedPos){
      userPosition = JSON.parse(savedPos);
      map.setView(userPosition,16);
    }
  },{
    enableHighAccuracy:true, maximumAge:1000, timeout:10000
  });
}

// --- Chat e dettagli ---
const markers = {}, allReports = {}, chat = document.getElementById("chat"), details = document.getElementById("details")
const activeCountEl = document.getElementById("active-count")
const deletedCountEl = document.getElementById("deleted-count")
const totalCountEl = document.getElementById("total-count")
let activeCount = 0, deletedCount = 0

function updateStats(){
  activeCountEl.textContent = `Attive: ${activeCount}`
  deletedCountEl.textContent = `Eliminate: ${deletedCount}`
  totalCountEl.textContent = `Totali: ${activeCount + deletedCount}`
}

function addChat(message, reportId=null){
  const entry = document.createElement("div")
  entry.className = "chat-entry"
  entry.textContent = message
  if(reportId){
    entry.style.cursor = "pointer"
    entry.addEventListener("click", ()=>{ 
      const report = allReports[reportId]
      if(report){
        const created = new Date(report.created_at).toLocaleString()
        const deleted = report.deleted_at ? new Date(report.deleted_at).toLocaleString() : "Ancora presente"
        details.innerHTML = `<strong>ID:</strong>${reportId}<br><strong>Creato:</strong>${created}<br><strong>Rimosso:</strong>${deleted}<br><strong>Via:</strong>${report.street}<br><strong>Descrizione:</strong>${report.description || "Nessuna"}`
      }
    })
  }
  chat.appendChild(entry)
  if(chat.children.length>50) chat.removeChild(chat.firstChild)
  chat.scrollTop = chat.scrollHeight
}

// --- Carica report ---
async function loadReports(){
  const { data, error } = await supabase.from('reports').select('*')
  if(error){ console.error(error); return }
  data.forEach(p=>{
    const marker = L.marker([p.latitude,p.longitude],{ icon: poopIcon })
    clusterGroup.addLayer(marker)
    const date = new Date(p.created_at)
    marker.bindTooltip(`Aggiunta il: ${date.toLocaleString()}\n${p.street}`, {direction:"top"})
    markers[p.id] = { marker, street:p.street, created_at:p.created_at, description:p.description }
    allReports[p.id] = { street:p.street, created_at:p.created_at, description:p.description, deleted_at:p.deleted_at }
    if(!p.deleted_at) activeCount++ else deletedCount++
    enableRemove(marker,p.id)
  })
  updateStats()
}
loadReports()

// --- Aggiungi report ---
async function addReport(lat, lng, description=null){
  // Chiamata insert
  const { data, error } = await supabase.from('reports').insert([{ latitude: lat, longitude: lng, description }]).select()
  if(error){ console.error(error); return }
  const report = data[0]
  allReports[report.id] = { street: report.street, created_at: report.created_at, description: report.description }
  addChat(`✅ Cacca segnalata il ${new Date(report.created_at).toLocaleString()} in ${report.street}`, report.id)
  activeCount++
  updateStats()
  // Evento
  await supabase.from('events').insert([{ report_id: report.id, type:'add' }])
  // Aggiungi marker sulla mappa
  const marker = L.marker([lat,lng],{ icon: poopIcon })
  clusterGroup.addLayer(marker)
  markers[report.id] = { marker, street: report.street, created_at: report.created_at, description: report.description }
  enableRemove(marker, report.id)
}

// --- Cancella report ---
async function deleteReport(id){
  const { error } = await supabase.from('reports').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if(error){ console.error(error); return }
  const markerData = markers[id]
  if(markerData){
    clusterGroup.removeLayer(markerData.marker)
    delete markers[id]
  }
  allReports[id].deleted_at = new Date().toISOString()
  addChat(`❌ Cacca rimossa il ${new Date().toLocaleString()} in ${allReports[id].street}`, id)
  activeCount--; deletedCount++; updateStats()
  await supabase.from('events').insert([{ report_id: id, type:'delete' }])
}

// --- Click mappa ---
map.on("click", e => {
  const description = prompt("Descrizione della cacca (facoltativo)")
  addReport(e.latlng.lat, e.latlng.lng, description)
})

// --- Enable remove ---
function enableRemove(marker, id){
  marker.on("click", e=>{
    L.DomEvent.stopPropagation(e)
    const report = allReports[id]
    if(report){
      const created = new Date(report.created_at).toLocaleString()
      const deleted = report.deleted_at ? new Date(report.deleted_at).toLocaleString() : "Ancora presente"
      details.innerHTML = `<strong>ID:</strong>${id}<br><strong>Creato:</strong>${created}<br><strong>Rimosso:</strong>${deleted}<br><strong>Via:</strong>${report.street}<br><strong>Descrizione:</strong>${report.description || "Nessuna"}`
    }
  })
  marker.on("dblclick", e=>{
    L.DomEvent.stopPropagation(e)
    deleteReport(id)
  })
}

// --- Mappa ---
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
