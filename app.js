// app.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// --- CONFIGURAZIONE SUPABASE ---
const supabaseUrl = 'https://gvlwrwcbcbsdjiauzxuq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g'
const supabase = createClient(supabaseUrl, supabaseKey)

// --- MAPPA ---
const map = L.map('map', { center: [41.9,12.5], zoom:13, maxZoom:19 })
map.doubleClickZoom.disable()

const clusterGroup = L.markerClusterGroup({
  iconCreateFunction: cluster => {
    const count = cluster.getChildCount()
    return L.divIcon({ html:`💩<br>${count}`, className:'poop-cluster', iconSize:[40,40], iconAnchor:[20,20] })
  }
})
map.addLayer(clusterGroup)

const poopIcon = L.divIcon({ html:'💩', className:'poop-marker', iconSize:[30,30], iconAnchor:[15,15] })

let userMarker=null, accuracyCircle=null, userPosition=null

// --- GEOLOCALIZZAZIONE ---
if('geolocation' in navigator){
  navigator.geolocation.watchPosition(pos=>{
    const lat=pos.coords.latitude, lng=pos.coords.longitude, accuracy=pos.coords.accuracy
    userPosition=[lat,lng]
    localStorage.setItem("lastUserPosition", JSON.stringify(userPosition))

    if(!userMarker){
      userMarker=L.circleMarker([lat,lng],{radius:8,color:"#007bff",fillColor:"#007bff",fillOpacity:1}).addTo(map)
      accuracyCircle=L.circle([lat,lng],{radius:accuracy,color:"#007bff",fillColor:"#007bff",fillOpacity:0.15,weight:1}).addTo(map)
      map.setView([lat,lng],16)
    } else {
      userMarker.setLatLng([lat,lng])
      accuracyCircle.setLatLng([lat,lng])
      accuracyCircle.setRadius(accuracy)
    }
  },err=>{
    const saved = localStorage.getItem("lastUserPosition")
    if(saved){ userPosition=JSON.parse(saved); map.setView(userPosition,16) }
  },{ enableHighAccuracy:true, maximumAge:1000, timeout:10000 })
} else {
  const saved = localStorage.getItem("lastUserPosition")
  if(saved){ userPosition=JSON.parse(saved); map.setView(userPosition,16) }
}

const markers = {}, allReports = {}, chat = document.getElementById("chat")
const details = document.getElementById("details")

const activeCountEl = document.getElementById("active-count")
const deletedCountEl = document.getElementById("deleted-count")
const totalCountEl = document.getElementById("total-count")
let activeCount=0, deletedCount=0
function updateStats(){ activeCountEl.textContent=`Attive: ${activeCount}`; deletedCountEl.textContent=`Eliminate: ${deletedCount}`; totalCountEl.textContent=`Totali: ${activeCount+deletedCount}` }

// --- FUNZIONE CHAT ---
function addChat(msg,id=null){
  const e = document.createElement("div"); e.className="chat-entry"; e.textContent=msg
  if(id){ e.addEventListener("click", ()=>{
    const r = allReports[id]
    if(r){
      const c = new Date(r.created_at).toLocaleString()
      const d = r.deleted_at ? new Date(r.deleted_at).toLocaleString() : "Ancora presente"
      details.innerHTML=`<strong>Segnalazione ID:</strong> ${id}<br><strong>Data inserimento:</strong> ${c}<br><strong>Data rimozione:</strong> ${d}<br><strong>Via:</strong> ${r.street}<br><strong>Descrizione:</strong> ${r.description||"Nessuna"}`
    }
  })}
  chat.appendChild(e)
  if(chat.children.length>50) chat.removeChild(chat.firstChild)
  chat.scrollTop=chat.scrollHeight
}

// --- CARICA REPORT DA SUPABASE ---
async function loadReports(){
  const { data, error } = await supabase.from('reports').select('*').order('created_at', {ascending:true})
  if(error){ console.error(error); return }
  data.forEach(p=>{
    const marker=L.marker([p.latitude,p.longitude],{icon:poopIcon})
    clusterGroup.addLayer(marker)
    marker.bindTooltip(`Aggiunta il: ${new Date(p.created_at).toLocaleString()}\n${p.street}`,{direction:"top"})
    markers[p.id]={marker, street:p.street, created_at:p.created_at, description:p.description}
    allReports[p.id]=p
    enableRemove(marker,p.id)
  })
  activeCount = data.filter(r=>!r.deleted_at).length
  deletedCount = data.filter(r=>r.deleted_at).length
  updateStats()
}
loadReports()

// --- AGGIUNTA REPORT ---
async function addReport(lat,lng,description){
  // reverse geocoding
  let street = "Via sconosciuta"
  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`)
    const js = await res.json()
    street = js.address?.road||js.address?.pedestrian||"Via sconosciuta"
  }catch(e){ console.error("Geocoding fallito",e) }

  const { data, error } = await supabase.from('reports').insert([{latitude:lat,longitude:lng,street,description}]).select()
  if(data && data[0]){
    const p = data[0]
    const marker=L.marker([p.latitude,p.longitude],{icon:poopIcon})
    clusterGroup.addLayer(marker)
    enableRemove(marker,p.id)
    allReports[p.id]=p
    addChat(`✅ Cacca aggiunta il ${new Date(p.created_at).toLocaleString()} in ${street}`, p.id)
    activeCount++; updateStats()
  }
}

// --- RIMOZIONE REPORT ---
async function removeReport(id){
  const { data, error } = await supabase.from('reports').update({deleted_at:new Date().toISOString()}).eq('id',id)
  if(!error){
    const m=markers[id]; if(m) clusterGroup.removeLayer(m.marker)
    addChat(`❌ Cacca rimossa il ${new Date().toLocaleString()} in ${allReports[id].street}`,id)
    activeCount--; deletedCount++; updateStats()
  }
}

// --- CLICK MAPPA ---
map.on("click", e=>{
  const desc = prompt("Inserisci una descrizione della cacca (facoltativo)")
  addReport(e.latlng.lat,e.latlng.lng,desc)
})

// --- ABILITA RIMOZIONE MARKER ---
function enableRemove(marker,id){
  marker.on("click", e=>{
    L.DomEvent.stopPropagation(e)
    const r = allReports[id]
    if(r){
      const c=new Date(r.created_at).toLocaleString()
      const d=r.deleted_at?new Date(r.deleted_at).toLocaleString():"Ancora presente"
      details.innerHTML=`<strong>Segnalazione ID:</strong> ${id}<br><strong>Data inserimento:</strong> ${c}<br><strong>Data rimozione:</strong> ${d}<br><strong>Via:</strong> ${r.street}<br><strong>Descrizione:</strong> ${r.description||"Nessuna"}`
    }
  })
  marker.on("dblclick", e=>{ L.DomEvent.stopPropagation(e); removeReport(id) })
}

// --- BOTTONE CENTRA SU DI ME ---
const locateControl=L.control({position:"topleft"})
locateControl.onAdd=()=>{
  const btn=L.DomUtil.create("button"); btn.innerHTML="📍"; btn.title="Vai alla tua posizione"
  btn.style.cssText="background:white;border:1px solid #ccc;padding:6px;cursor:pointer;font-size:18px;"
  L.DomEvent.disableClickPropagation(btn)
  btn.onclick=()=>{ if(userPosition) map.setView(userPosition,17) }
  return btn
}
locateControl.addTo(map)

// --- BOTTONE SEGNALA CACCA QUI ---
const poopControl=L.control({position:"topleft"})
poopControl.onAdd=()=>{
  const btn=L.DomUtil.create("button"); btn.innerHTML="💩"; btn.title="Segnala cacca qui"
  btn.style.cssText="background:white;border:1px solid #ccc;padding:6px;cursor:pointer;font-size:18px;margin-top:5px;"
  L.DomEvent.disableClickPropagation(btn)
  btn.onclick=()=>{
    if(!userPosition){ alert("Posizione GPS non ancora disponibile"); return }
    const desc = prompt("Descrizione della cacca (facoltativa)")
    addReport(userPosition[0],userPosition[1],desc)
  }
  return btn
}
poopControl.addTo(map)

// --- SUPABASE REALTIME ---
supabase.channel('public:reports')
  .on('postgres_changes',{event:'*',schema:'public',table:'reports'}, payload=>{
    const p = payload.new
    if(payload.eventType==='INSERT' && !markers[p.id]){
      const marker=L.marker([p.latitude,p.longitude],{icon:poopIcon})
      clusterGroup.addLayer(marker)
      enableRemove(marker,p.id)
      allReports[p.id]=p
      addChat(`✅ Cacca aggiunta il ${new Date(p.created_at).toLocaleString()} in ${p.street}`, p.id)
      markers[p.id]={marker, ...p}
      activeCount++; updateStats()
    }
    if(payload.eventType==='UPDATE' && p.deleted_at){
      const data=markers[p.id]
      if(data){ clusterGroup.removeLayer(data.marker); addChat(`❌ Cacca rimossa il ${new Date().toLocaleString()} in ${p.street}`,p.id); activeCount--; deletedCount++; updateStats() }
    }
  }).subscribe()
