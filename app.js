// app.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// --- CONFIGURAZIONE SUPABASE ---
const supabaseUrl = 'https://gvlwrwcbcbsdjiauzxuq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g'
const supabase = createClient(supabaseUrl, supabaseKey)

// --- MAPPA ---
const map = L.map('map', { center: [41.9, 12.5], zoom: 13, maxZoom: 19 });
map.doubleClickZoom.disable()

const clusterGroup = L.markerClusterGroup({
  iconCreateFunction: function(cluster){
    const count = cluster.getChildCount();
    return L.divIcon({ html: `💩<br>${count}`, className:'poop-cluster', iconSize:[40,40], iconAnchor:[20,20] })
  }
})
map.addLayer(clusterGroup)

const poopIcon = L.divIcon({ html:"💩", className:"poop-marker", iconSize:[30,30], iconAnchor:[15,15] })

let userMarker=null, accuracyCircle=null, userPosition=null

// --- GEOLOCALIZZAZIONE ---
if("geolocation" in navigator){
  navigator.geolocation.watchPosition(pos=>{
    const lat = pos.coords.latitude, lng = pos.coords.longitude, accuracy=pos.coords.accuracy
    userPosition = [lat,lng]
    localStorage.setItem("lastUserPosition", JSON.stringify(userPosition))

    if(!userMarker){
      userMarker = L.circleMarker([lat,lng],{ radius:8, color:"#007bff", fillColor:"#007bff", fillOpacity:1 }).addTo(map)
      accuracyCircle = L.circle([lat,lng],{ radius: accuracy, color:"#007bff", fillColor:"#007bff", fillOpacity:0.15, weight:1 }).addTo(map)
      map.setView([lat,lng],16)
    } else {
      userMarker.setLatLng([lat,lng])
      accuracyCircle.setLatLng([lat,lng])
      accuracyCircle.setRadius(accuracy)
    }
  }, err=>{
    const savedPos = localStorage.getItem("lastUserPosition")
    if(savedPos){ userPosition = JSON.parse(savedPos); map.setView(userPosition,16) }
  }, { enableHighAccuracy:true, maximumAge:1000, timeout:10000 })
} else {
  const savedPos = localStorage.getItem("lastUserPosition")
  if(savedPos){ userPosition = JSON.parse(savedPos); map.setView(userPosition,16) }
}

// --- CHAT E DETTAGLI ---
const markers = {}, allReports = {}, chat = document.getElementById("chat")
const details = document.getElementById("details")

const activeCountEl = document.getElementById("active-count")
const deletedCountEl = document.getElementById("deleted-count")
const totalCountEl = document.getElementById("total-count")
let activeCount=0, deletedCount=0
function updateStats(){ activeCountEl.textContent=`Attive: ${activeCount}`; deletedCountEl.textContent=`Eliminate: ${deletedCount}`; totalCountEl.textContent=`Totali: ${activeCount+deletedCount}` }

// --- FUNZIONE CHAT ---
function addChat(message, reportId=null){
  const entry = document.createElement("div"); entry.className="chat-entry"; entry.textContent=message
  if(reportId){
    entry.addEventListener("click", ()=>{
      const report = allReports[reportId]
      if(report){
        const created = new Date(report.created_at).toLocaleString()
        const deleted = report.deleted_at ? new Date(report.deleted_at).toLocaleString() : "Ancora presente"
        details.innerHTML=`<strong>Segnalazione ID:</strong> ${reportId}<br>
        <strong>Data inserimento:</strong> ${created}<br>
        <strong>Data rimozione:</strong> ${deleted}<br>
        <strong>Via:</strong> ${report.street}<br>
        <strong>Descrizione:</strong> ${report.description||"Nessuna"}`
      }
    })
  }
  chat.appendChild(entry)
  if(chat.children.length>50) chat.removeChild(chat.firstChild)
  chat.scrollTop = chat.scrollHeight
}

// --- TILE LAYER ---
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

// --- CARICAMENTO MARKER DA SUPABASE ---
async function loadReports(){
  let { data: reports, error } = await supabase.from('reports').select('*').order('created_at', {ascending:true})
  if(error){ console.error(error); return }
  reports.forEach(p=>{
    const marker = L.marker([p.latitude,p.longitude],{ icon: poopIcon })
    clusterGroup.addLayer(marker)
    const formatted = new Date(p.created_at).toLocaleString()
    marker.bindTooltip(`Aggiunta il: ${formatted}\n${p.street}`, {direction:"top"})
    markers[p.id] = { marker, street: p.street, created_at: p.created_at, description: p.description }
    allReports[p.id] = p
    enableRemove(marker,p.id)
  })
  activeCount = reports.filter(r=>!r.deleted_at).length
  deletedCount = reports.filter(r=>r.deleted_at).length
  updateStats()
}
loadReports()

// --- AGGIUNTA NUOVO REPORT ---
async function addReport(lat,lng,description){
  const { data, error } = await supabase.from('reports').insert([{ latitude:lat, longitude:lng, description }]).select()
  if(data && data[0]){
    const p = data[0]
    const marker = L.marker([p.latitude,p.longitude],{ icon: poopIcon })
    clusterGroup.addLayer(marker)
    enableRemove(marker,p.id)
    allReports[p.id] = p
    addChat(`✅ Cacca aggiunta il ${new Date(p.created_at).toLocaleString()}`, p.id)
    activeCount++
    updateStats()
  }
}

// --- RIMOZIONE REPORT ---
async function removeReport(id){
  const { data, error } = await supabase.from('reports').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if(!error){
    const markerData = markers[id]
    if(markerData){ clusterGroup.removeLayer(markerData.marker) }
    addChat(`❌ Cacca rimossa il ${new Date().toLocaleString()}`, id)
    activeCount--; deletedCount++; updateStats()
  }
}

// --- CLICK MAPPA PER AGGIUNTA ---
map.on("click", e=>{
  const description = prompt("Inserisci una descrizione della cacca (facoltativo)")
  addReport(e.latlng.lat,e.latlng.lng,description)
})

// --- FUNZIONE PER ABILITARE RIMOZIONE MARKER ---
function enableRemove(marker,id){
  marker.on("click", e=>{
    L.DomEvent.stopPropagation(e)
    const report = allReports[id]
    if(report){
      const created = new Date(report.created_at).toLocaleString()
      const deleted = report.deleted_at ? new Date(report.deleted_at).toLocaleString() : "Ancora presente"
      details.innerHTML=`<strong>Segnalazione ID:</strong> ${id}<br>
      <strong>Data inserimento:</strong> ${created}<br>
      <strong>Data rimozione:</strong> ${deleted}<br>
      <strong>Via:</strong> ${report.street}<br>
      <strong>Descrizione:</strong> ${report.description||"Nessuna"}`
    }
  })
  marker.on("dblclick", e=>{ L.DomEvent.stopPropagation(e); removeReport(id) })
}

// --- BOTTONE CENTRA SU DI ME ---
const locateControl = L.control({position:"topleft"})
locateControl.onAdd = function(){
  const btn = L.DomUtil.create("button"); btn.innerHTML="📍"; btn.title="Vai alla tua posizione"
  btn.style.cssText="background:white;border:1px solid #ccc;padding:6px;cursor:pointer;font-size:18px;"
  L.DomEvent.disableClickPropagation(btn)
  btn.onclick=function(){ if(userPosition) map.setView(userPosition,17) }
  return btn
}
locateControl.addTo(map)

// --- BOTTONE SEGNALA CACCA QUI ---
const poopControl = L.control({position:"topleft"})
poopControl.onAdd=function(){
  const btn=L.DomUtil.create("button"); btn.innerHTML="💩"; btn.title="Segnala cacca qui"
  btn.style.cssText="background:white;border:1px solid #ccc;padding:6px;cursor:pointer;font-size:18px;margin-top:5px;"
  L.DomEvent.disableClickPropagation(btn)
  btn.onclick=function(){
    if(!userPosition){ alert("Posizione GPS non ancora disponibile"); return }
    const description = prompt("Descrizione della cacca (facoltativa)")
    addReport(userPosition[0],userPosition[1],description)
  }
  return btn
}
poopControl.addTo(map)

// --- SUBSCRIBE REALTIME SUPABASE ---
supabase.channel('public:reports')
  .on('postgres_changes',{ event:'*', schema:'public', table:'reports'}, payload=>{
    const p = payload.new
    if(payload.eventType==='INSERT'){
      if(!markers[p.id]){
        const marker = L.marker([p.latitude,p.longitude],{ icon: poopIcon })
        clusterGroup.addLayer(marker)
        enableRemove(marker,p.id)
        allReports[p.id]=p
        addChat(`✅ Cacca aggiunta il ${new Date(p.created_at).toLocaleString()}`,p.id)
        activeCount++; updateStats()
      }
    }
    if(payload.eventType==='UPDATE'){
      if(p.deleted_at){
        const data = markers[p.id]
        if(data){ clusterGroup.removeLayer(data.marker) }
        addChat(`❌ Cacca rimossa il ${new Date().toLocaleString()}`,p.id)
        activeCount--; deletedCount++; updateStats()
      }
    }
  }).subscribe()
