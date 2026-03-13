import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// SUPABASE
const SUPABASE_URL = "https://gvlwrwcbcbsdjiauzxuq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// MAPPA
const map = L.map("map",{center:[41.9,12.5],zoom:13,maxZoom:19});
map.doubleClickZoom.disable();

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

const clusterGroup = L.markerClusterGroup();
map.addLayer(clusterGroup);

const poopIcon = L.divIcon({
html:"💩",
className:"poop-marker",
iconSize:[30,30],
iconAnchor:[15,15]
});

// STATO
const markers = {};
const allReports = {};

let activeCount = 0;
let deletedCount = 0;

// UI
const chat = document.getElementById("chat");
const details = document.getElementById("details");

const activeCountEl = document.getElementById("active-count");
const deletedCountEl = document.getElementById("deleted-count");
const totalCountEl = document.getElementById("total-count");

function updateStats(){
activeCountEl.textContent = `Attive: ${activeCount}`;
deletedCountEl.textContent = `Eliminate: ${deletedCount}`;
totalCountEl.textContent = `Totali: ${activeCount + deletedCount}`;
}

// CHAT
function addChat(message,id=null){

const entry = document.createElement("div");
entry.className="chat-entry";
entry.textContent = message;

if(id){
entry.onclick=()=>{
const r = allReports[id];
if(!r) return;

details.innerHTML=`
<strong>ID:</strong> ${id}<br>
<strong>Via:</strong> ${r.street}<br>
<strong>Descrizione:</strong> ${r.description || "Nessuna"}
`;
};
}

chat.appendChild(entry);

if(chat.children.length>50){
chat.removeChild(chat.firstChild);
}

chat.scrollTop = chat.scrollHeight;

}

// SUPABASE

async function addReport(lat,lng,street,description){

const {data,error} = await supabase
.from("poop_reports")
.insert({
latitude:lat,
longitude:lng,
street,
description
})
.select()
.single();

if(error){
console.error(error);
return null;
}

return data;

}

async function deleteReport(id){

const {error} = await supabase
.from("poop_reports")
.delete()
.eq("id",id);

if(error) console.error(error);

}

// CREAZIONE MARKER
function createMarker(report){

if(markers[report.id]) return;

const marker = L.marker(
[report.latitude,report.longitude],
{icon:poopIcon}
);

clusterGroup.addLayer(marker);

markers[report.id] = {marker,street:report.street};
allReports[report.id] = report;

marker.on("click",()=>{

details.innerHTML=`
<strong>ID:</strong> ${report.id}<br>
<strong>Via:</strong> ${report.street}<br>
<strong>Descrizione:</strong> ${report.description || "Nessuna"}
`;

});

marker.on("dblclick",async()=>{

await deleteReport(report.id);

clusterGroup.removeLayer(marker);

delete markers[report.id];

activeCount--;
deletedCount++;

updateStats();

addChat("❌ Cacca rimossa",report.id);

});

activeCount++;
updateStats();

}

// LOAD INIZIALE
async function loadReports(){

const {data,error} = await supabase
.from("poop_reports")
.select("*");

if(error){
console.error(error);
return;
}

data.forEach(createMarker);

}

// REALTIME
supabase
.channel("poop-realtime")
.on(
"postgres_changes",
{
event:"INSERT",
schema:"public",
table:"poop_reports"
},
payload=>{

createMarker(payload.new);

addChat("💩 Nuova cacca segnalata",payload.new.id);

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

const id = payload.old.id;

if(!markers[id]) return;

clusterGroup.removeLayer(markers[id].marker);

delete markers[id];

activeCount--;
deletedCount++;

updateStats();

addChat("❌ Cacca rimossa",id);

}
)
.subscribe();

// CLICK MAPPA
map.on("click",async e=>{

const desc = prompt("Descrizione (facoltativa)");

const report = await addReport(
e.latlng.lat,
e.latlng.lng,
"Via sconosciuta",
desc
);

if(!report) return;

// AGGIUNTA IMMEDIATA
createMarker(report);

addChat("💩 Cacca aggiunta",report.id);

});

// POSIZIONE UTENTE

let userPosition = null;

if(navigator.geolocation){

navigator.geolocation.watchPosition(pos=>{

const lat = pos.coords.latitude;
const lng = pos.coords.longitude;

userPosition = [lat,lng];

},()=>{},{
enableHighAccuracy:true
});

}

// BOTTONE POSIZIONE
const locateControl = L.control({position:"topleft"});

locateControl.onAdd = function(){

const btn = L.DomUtil.create("button");

btn.innerHTML="📍";

btn.style="background:white;border:1px solid #ccc;padding:6px;cursor:pointer";

btn.onclick=()=>{
if(userPosition){
map.setView(userPosition,17);
}
};

return btn;

};

locateControl.addTo(map);

// START
loadReports();
