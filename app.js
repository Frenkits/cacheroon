import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm"

// SUPABASE
const SUPABASE_URL = "https://gvlwrwcbcbsdjiauzxuq.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g"
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)


// app.js
const map = L.map('map', {
  center: [41.9, 12.5],
  zoom: 13,
  maxZoom: 19
})
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


// POSIZIONE UTENTE
let userMarker = null
let accuracyCircle = null
let userPosition = null

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

  });

}


const markers = {}
const allReports = {}
const chat = document.getElementById("chat")

// CONTATORI
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

const details = document.getElementById("details")


// CHAT
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

  if(chat.children.length > 50){
    chat.removeChild(chat.firstChild)
  }

  chat.scrollTop = chat.scrollHeight
}


// CARICA EVENTI
async function loadEvents(){

  const {data} = await supabase
  .from("poop_events")
  .select("*")
  .order("timestamp",{ascending:true})

  data.forEach(ev=>{
    const formatted = new Date(ev.timestamp).toLocaleString()
    const street = ev.street || "Via sconosciuta"
    const description = ev.description || null

    if(ev.type==="add"){
      addChat(`✅ Cacca segnalata il ${formatted} in ${street}`, ev.report_id)
      allReports[ev.report_id] = { street, created_at: ev.timestamp, description }
    }

    if(ev.type==="delete"){
      addChat(`❌ Cacca rimossa il ${formatted} in ${street}`, ev.report_id)
      if(allReports[ev.report_id]){
        allReports[ev.report_id].deleted_at = ev.timestamp
      }
    }
  })

}


// LAYER MAPPA
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)


// CARICA REPORT
async function loadReports(){

  const {data} = await supabase
  .from("poop_reports")
  .select("*")

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

    activeCount++
  })

  updateStats()

}

async function getStreetName(lat,lng){

  try{

    const url=`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`

    const res = await fetch(url)

    const data = await res.json()

    if(data.address.road){
      return data.address.road
    }

    if(data.display_name){
      return data.display_name.split(",")[0]
    }

  }catch(e){
    console.log("errore geocoding",e)
  }

  return "Via sconosciuta"

}


// AGGIUNGI REPORT
async function addReport(lat,lng,description){

  const street = await getStreetName(lat,lng)

  const {data} = await supabase
  .from("poop_reports")
  .insert({
    latitude:lat,
    longitude:lng,
    street,
    description
  })
  .select()
  .single()

  // AGGIUNGE SUBITO MARKER (senza aspettare realtime)

  const marker = L.marker([data.latitude,data.longitude],{
    icon:poopIcon
  })

  clusterGroup.addLayer(marker)

  const date = new Date(data.created_at)
  const formatted = date.toLocaleString()

  marker.bindTooltip(`Aggiunta il: ${formatted}\n${street}`,{direction:"top"})

  markers[data.id] = { marker, street, created_at:data.created_at, description }
  allReports[data.id] = { street, created_at:data.created_at, description }

  enableRemove(marker,data.id)

  addChat(`✅ Cacca aggiunta il ${formatted} in ${street}`,data.id)

  activeCount++
  updateStats()

  await supabase.from("poop_events").insert({
    report_id:data.id,
    type:"add",
    street,
    description
  })

}


// DELETE
async function deleteReport(id){

  await supabase.from("poop_reports").delete().eq("id",id)

  await supabase.from("poop_events").insert({
    report_id:id,
    type:"delete",
    street:markers[id].street
  })

}


// REALTIME
supabase
.channel("poop-live")
.on(
'postgres_changes',
{event:'INSERT',schema:'public',table:'poop_reports'},
payload=>{

const p = payload.new

if(!markers[p.id]){

const marker = L.marker([p.latitude,p.longitude],{
icon:poopIcon
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

})
.subscribe()



// CLICK MAPPA
map.on("click", function(e){

  const description = prompt("Inserisci una descrizione della cacca (facoltativo)")

  addReport(
    e.latlng.lat,
    e.latlng.lng,
    description
  )

})


// CANCELLA
function enableRemove(marker,id){

marker.on("click", function(e){

L.DomEvent.stopPropagation(e)

const report = allReports[id]

if(report){

const created = new Date(report.created_at).toLocaleString()

details.innerHTML = `
<strong>Segnalazione ID:</strong> ${id}<br>
<strong>Data inserimento:</strong> ${created}<br>
<strong>Via:</strong> ${report.street}<br>
<strong>Descrizione:</strong> ${report.description || "Nessuna"}
`

}

})

marker.on("dblclick", function(e){

L.DomEvent.stopPropagation(e)

deleteReport(id)

clusterGroup.removeLayer(markers[id].marker)

delete markers[id]

activeCount--
deletedCount++

updateStats()

})

}


// BOTTONI
const locateControl = L.control({position:"topleft"})

locateControl.onAdd = function(){

const btn = L.DomUtil.create("button")

btn.innerHTML = "📍"
btn.style.background = "white"
btn.style.border = "1px solid #ccc"
btn.style.padding = "6px"
btn.style.cursor = "pointer"
btn.style.fontSize = "18px"

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



const poopControl = L.control({position:"topleft"})

poopControl.onAdd = function(){

const btn = L.DomUtil.create("button")

btn.innerHTML = "💩"
btn.style.background = "white"
btn.style.border = "1px solid #ccc"
btn.style.padding = "6px"
btn.style.cursor = "pointer"
btn.style.fontSize = "18px"
btn.style.marginTop = "5px"

L.DomEvent.disableClickPropagation(btn)

btn.onclick = function(e){

L.DomEvent.stopPropagation(e)

if(!userPosition){
alert("Posizione GPS non ancora disponibile")
return
}

const description = prompt("Descrizione della cacca (facoltativa)")

addReport(
userPosition[0],
userPosition[1],
description
)

}

return btn

}

poopControl.addTo(map)



// START
loadReports()
loadEvents()
