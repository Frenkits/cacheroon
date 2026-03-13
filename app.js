import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm"

// SUPABASE
const SUPABASE_URL = "https://gvlwrwcbcbsdjiauzxuq.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g"
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// MAPPA
const map = L.map('map',{
  center:[41.9,12.5],
  zoom:13,
  maxZoom:19
})
map.doubleClickZoom.disable()

// CLUSTER
const clusterGroup = L.markerClusterGroup({
  iconCreateFunction: cluster=>{
    const count = cluster.getChildCount()
    return L.divIcon({
      html:`💩<br>${count}`,
      className:'poop-cluster',
      iconSize:[40,40],
      iconAnchor:[20,20]
    })
  }
})

map.addLayer(clusterGroup)

const poopIcon = L.divIcon({
  html:"💩",
  className:"poop-marker",
  iconSize:[30,30],
  iconAnchor:[15,15]
})

// POSIZIONE UTENTE
let userMarker=null
let accuracyCircle=null
let userPosition=null

if("geolocation" in navigator){

navigator.geolocation.watchPosition(pos=>{

const lat=pos.coords.latitude
const lng=pos.coords.longitude
const acc=pos.coords.accuracy

userPosition=[lat,lng]

localStorage.setItem("lastUserPosition",JSON.stringify(userPosition))

if(!userMarker){

userMarker=L.circleMarker([lat,lng],{
radius:8,
color:"#007bff",
fillColor:"#007bff",
fillOpacity:1
}).addTo(map)

accuracyCircle=L.circle([lat,lng],{
radius:acc,
color:"#007bff",
fillColor:"#007bff",
fillOpacity:0.15,
weight:1
}).addTo(map)

map.setView([lat,lng],16)

}else{

userMarker.setLatLng([lat,lng])
accuracyCircle.setLatLng([lat,lng])
accuracyCircle.setRadius(acc)

}

})

}

// DATI
const markers={}
const allReports={}

const chat=document.getElementById("chat")
const details=document.getElementById("details")

// CONTATORI
const activeCountEl=document.getElementById("active-count")
const deletedCountEl=document.getElementById("deleted-count")
const totalCountEl=document.getElementById("total-count")

let activeCount=0
let deletedCount=0

function updateStats(){
activeCountEl.textContent=`Attive: ${activeCount}`
deletedCountEl.textContent=`Eliminate: ${deletedCount}`
totalCountEl.textContent=`Totali: ${activeCount+deletedCount}`
}

// CHAT
function addChat(message,id=null){

const entry=document.createElement("div")
entry.className="chat-entry"
entry.textContent=message

if(id){

entry.onclick=()=>{

const r=allReports[id]

if(r){

const created=new Date(r.created_at).toLocaleString()
const deleted=r.deleted_at?new Date(r.deleted_at).toLocaleString():"Ancora presente"

details.innerHTML=`
<strong>ID:</strong> ${id}<br>
<strong>Inserita:</strong> ${created}<br>
<strong>Rimossa:</strong> ${deleted}<br>
<strong>Via:</strong> ${r.street}<br>
<strong>Descrizione:</strong> ${r.description||"Nessuna"}
`

}

}

}

chat.appendChild(entry)

if(chat.children.length>50){
chat.removeChild(chat.firstChild)
}

chat.scrollTop=chat.scrollHeight

}

// CARICA EVENTI
async function loadEvents(){

const {data}=await supabase
.from("poop_events")
.select("*")
.order("timestamp",{ascending:true})
.limit(50)

data.forEach(ev=>{

const formatted=new Date(ev.timestamp).toLocaleString()

if(ev.type==="add"){
addChat(`✅ Cacca segnalata il ${formatted} in ${ev.street}`,ev.report_id)
}

if(ev.type==="delete"){
addChat(`❌ Cacca rimossa il ${formatted} in ${ev.street}`,ev.report_id)
}

})

}

// CARICA REPORT
async function loadReports(){

const {data}=await supabase
.from("poop_reports")
.select("*")

data.forEach(p=>{

const marker=L.marker([p.latitude,p.longitude],{icon:poopIcon})
clusterGroup.addLayer(marker)

markers[p.id]={marker,street:p.street,created_at:p.created_at,description:p.description}
allReports[p.id]={street:p.street,created_at:p.created_at,description:p.description}

enableRemove(marker,p.id)

activeCount++

})

updateStats()

}

// AGGIUNGI REPORT
async function addReport(lat,lng,description){

const street="Via sconosciuta"

const {data}=await supabase
.from("poop_reports")
.insert({
latitude:lat,
longitude:lng,
street,
description
})
.select()
.single()

await supabase.from("poop_events").insert({
report_id:data.id,
type:"add",
street,
description
})

}

// ELIMINA
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
.on("postgres_changes",{event:"INSERT",schema:"public",table:"poop_reports"},payload=>{

const p=payload.new

if(markers[p.id]) return

const marker=L.marker([p.latitude,p.longitude],{icon:poopIcon})
clusterGroup.addLayer(marker)

markers[p.id]={marker,street:p.street,created_at:p.created_at,description:p.description}
allReports[p.id]={street:p.street,created_at:p.created_at,description:p.description}

enableRemove(marker,p.id)

addChat(`✅ Cacca aggiunta in ${p.street}`,p.id)

activeCount++
updateStats()

})
.subscribe()

// CLICK MAPPA
map.on("click",e=>{

const description=prompt("Inserisci una descrizione della cacca")

addReport(e.latlng.lat,e.latlng.lng,description)

})

// CANCELLAZIONE
function enableRemove(marker,id){

marker.on("click",()=>{

const r=allReports[id]

const created=new Date(r.created_at).toLocaleString()

details.innerHTML=`
<strong>ID:</strong> ${id}<br>
<strong>Inserita:</strong> ${created}<br>
<strong>Via:</strong> ${r.street}<br>
<strong>Descrizione:</strong> ${r.description||"Nessuna"}
`

})

marker.on("dblclick",()=>{

deleteReport(id)

clusterGroup.removeLayer(markers[id].marker)

addChat(`❌ Cacca rimossa`,id)

delete markers[id]

activeCount--
deletedCount++

updateStats()

})

}

// TILE
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

// START
loadReports()
loadEvents()
