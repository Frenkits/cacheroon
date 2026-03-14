// SUPABASE

const SUPABASE_URL = "https://gvlwrwcbcbsdjiauzxuq.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g"

const supabase = window.supabase.createClient(
SUPABASE_URL,
SUPABASE_KEY
)


// MAPPA

const map = L.map('map',{
center:[41.9,12.5],
zoom:13,
maxZoom:19
})

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
.addTo(map)

map.doubleClickZoom.disable()

const clusterGroup = L.markerClusterGroup()

map.addLayer(clusterGroup)

const poopIcon = L.divIcon({
html:"💩",
className:"poop-marker",
iconSize:[30,30],
iconAnchor:[15,15]
})

const markers = {}
const allReports = {}

const chat = document.getElementById("chat")
const details = document.getElementById("details")


// CHAT

function addChat(message){

const entry=document.createElement("div")

entry.className="chat-entry"

entry.textContent=message

chat.appendChild(entry)

if(chat.children.length>50)
chat.removeChild(chat.firstChild)

chat.scrollTop=chat.scrollHeight

}


// CARICA REPORT

async function loadReports(){

const {data,error}=await supabase
.from("poop_reports")
.select("*")

data.forEach(p=>{

const marker=L.marker(
[p.latitude,p.longitude],
{icon:poopIcon}
)

clusterGroup.addLayer(marker)

markers[p.id]=marker

enableRemove(marker,p.id)

})

}

loadReports()



// AGGIUNGI REPORT

async function createReport(lat,lng,description){

const street=await getStreet(lat,lng)

const {data,error}=await supabase
.from("poop_reports")
.insert({
latitude:lat,
longitude:lng,
street:street,
description:description
})
.select()

}


// ELIMINA

async function deleteReport(id){

await supabase
.from("poop_reports")
.delete()
.eq("id",id)

}


// CLICK MAPPA

map.on("click",function(e){

const description=prompt("Descrizione")

createReport(
e.latlng.lat,
e.latlng.lng,
description
)

})


// REALTIME

supabase
.channel("realtime-poop")
.on(
"postgres_changes",
{
event:"INSERT",
schema:"public",
table:"poop_reports"
},
payload=>{

const p=payload.new

const marker=L.marker(
[p.latitude,p.longitude],
{icon:poopIcon}
)

clusterGroup.addLayer(marker)

markers[p.id]=marker

enableRemove(marker,p.id)

addChat("💩 nuova cacca segnalata")

}
)
.on(
"postgres_changes",
{
event:"DELETE",
schema:"public",
table:"poop_reports"
},
payload=>{

const id=payload.old.id

if(markers[id]){

clusterGroup.removeLayer(markers[id])

delete markers[id]

addChat("❌ cacca rimossa")

}

}
)
.subscribe()



// REMOVE MARKER

function enableRemove(marker,id){

marker.on("dblclick",function(e){

L.DomEvent.stopPropagation(e)

deleteReport(id)

})

}


// REVERSE GEOCODING

async function getStreet(lat,lng){

const url=`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`

try{

const res=await fetch(url)

const data=await res.json()

return data.address?.road || "Via sconosciuta"

}catch{

return "Via sconosciuta"

}

}
