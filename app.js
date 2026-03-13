import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// --- SUPABASE ---
const SUPABASE_URL = "https://gvlwrwcbcbsdjiauzxuq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- MAPPA ---
const map = L.map('map',{center:[41.9,12.5],zoom:13,maxZoom:19});
map.doubleClickZoom.disable();

const clusterGroup = L.markerClusterGroup({
  iconCreateFunction: cluster=>{
    const count = cluster.getChildCount();
    return L.divIcon({
      html:`💩<br>${count}`,
      className:'poop-cluster',
      iconSize:[40,40],
      iconAnchor:[20,20]
    });
  }
});

map.addLayer(clusterGroup);

const poopIcon = L.divIcon({
  html:"💩",
  className:"poop-marker",
  iconSize:[30,30],
  iconAnchor:[15,15]
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// --- POSIZIONE UTENTE ---
let userPosition=null;
let userMarker=null;
let accuracyCircle=null;

if("geolocation" in navigator){

navigator.geolocation.watchPosition(pos=>{

const lat=pos.coords.latitude;
const lng=pos.coords.longitude;
const acc=pos.coords.accuracy;

userPosition=[lat,lng];

localStorage.setItem("lastUserPosition",JSON.stringify(userPosition));

if(!userMarker){

userMarker=L.circleMarker([lat,lng],{
radius:8,
color:"#007bff",
fillColor:"#007bff",
fillOpacity:1
}).addTo(map);

accuracyCircle=L.circle([lat,lng],{
radius:acc,
color:"#007bff",
fillColor:"#007bff",
fillOpacity:0.15,
weight:1
}).addTo(map);

map.setView([lat,lng],16);

}else{

userMarker.setLatLng([lat,lng]);
accuracyCircle.setLatLng([lat,lng]);
accuracyCircle.setRadius(acc);

}

},err=>{

const savedPos=localStorage.getItem("lastUserPosition");
if(savedPos){
userPosition=JSON.parse(savedPos);
map.setView(userPosition,16);
}

},{enableHighAccuracy:true});

}

// --- UI ---
const markers={};
const allReports={};

const chat=document.getElementById("chat");
const details=document.getElementById("details");

const activeCountEl=document.getElementById("active-count");
const deletedCountEl=document.getElementById("deleted-count");
const totalCountEl=document.getElementById("total-count");

let activeCount=0;
let deletedCount=0;

function updateStats(){

activeCountEl.textContent=`Attive: ${activeCount}`;
deletedCountEl.textContent=`Eliminate: ${deletedCount}`;
totalCountEl.textContent=`Totali: ${activeCount+deletedCount}`;

}

// --- CHAT ---
function addChat(message,reportId=null){

const entry=document.createElement("div");
entry.className="chat-entry";
entry.textContent=message;

if(reportId){

entry.onclick=()=>{

const r=allReports[reportId];

if(r){

const created=new Date(r.created_at).toLocaleString();
const deleted=r.deleted_at ? new Date(r.deleted_at).toLocaleString() : "Ancora presente";

details.innerHTML=`
<strong>ID:</strong> ${reportId}<br>
<strong>Inserita:</strong> ${created}<br>
<strong>Rimossa:</strong> ${deleted}<br>
<strong>Via:</strong> ${r.street}<br>
<strong>Descrizione:</strong> ${r.description||"Nessuna"}
`;

}

};

}

chat.appendChild(entry);

if(chat.children.length>50){
chat.removeChild(chat.firstChild);
}

chat.scrollTop=chat.scrollHeight;

}

// --- SUPABASE FUNZIONI ---

async function addReport(lat,lng,street,description){

const {data,error}=await supabase
.from("poop_reports")
.insert({latitude:lat,longitude:lng,street,description})
.select();

if(error) console.error(error);

const report=data[0];

await supabase.from("poop_events").insert({
report_id:report.id,
type:"add",
street:street,
description:description
});

return report;

}

async function deleteReport(id){

await supabase.from("poop_reports").delete().eq("id",id);

await supabase.from("poop_events").insert({
report_id:id,
type:"delete",
street:markers[id]?.street || ""
});

}

// --- LOAD MARKERS ---
async function loadReports(){

const {data}=await supabase
.from("poop_reports")
.select("*")
.order("created_at",{ascending:true});

data.forEach(p=>{

const marker=L.marker([p.latitude,p.longitude],{icon:poopIcon});

clusterGroup.addLayer(marker);

markers[p.id]={marker,street:p.street,created_at:p.created_at,description:p.description};

allReports[p.id]={street:p.street,created_at:p.created_at,description:p.description};

enableRemove(marker,p.id);

activeCount++;

});

updateStats();

}

// --- LOAD CHAT ---
async function loadChat(){

const {data}=await supabase
.from("poop_events")
.select("*")
.order("timestamp",{ascending:true})
.limit(50);

data.forEach(ev=>{

const formatted=new Date(ev.timestamp).toLocaleString();

if(ev.type==="add"){
addChat(`✅ Cacca segnalata il ${formatted} in ${ev.street}`,ev.report_id);
}

if(ev.type==="delete"){
addChat(`❌ Cacca rimossa il ${formatted} in ${ev.street}`,ev.report_id);
deletedCount++;
}

});

updateStats();

}

// --- REALTIME ---
supabase
.channel('poop_channel')
.on('postgres_changes',{event:'INSERT',schema:'public',table:'poop_reports'},payload=>{

const p=payload.new;

if(markers[p.id]) return;

const marker=L.marker([p.latitude,p.longitude],{icon:poopIcon});

clusterGroup.addLayer(marker);

markers[p.id]={marker,street:p.street,created_at:p.created_at,description:p.description};

allReports[p.id]={street:p.street,created_at:p.created_at,description:p.description};

enableRemove(marker,p.id);

addChat(`✅ Cacca aggiunta in ${p.street}`,p.id);

activeCount++;

updateStats();

})
.subscribe();

// --- CLICK MAPPA ---
map.on("click",async e=>{

const desc=prompt("Descrizione della cacca (facoltativo)");

if(!userPosition){
alert("GPS non disponibile");
return;
}

const street="Via sconosciuta";

const report=await addReport(e.latlng.lat,e.latlng.lng,street,desc);

const marker=L.marker([report.latitude,report.longitude],{icon:poopIcon});

clusterGroup.addLayer(marker);

markers[report.id]={marker,street:report.street,created_at:report.created_at,description:report.description};

allReports[report.id]={street:report.street,created_at:report.created_at,description:report.description};

enableRemove(marker,report.id);

addChat(`✅ Cacca aggiunta in ${report.street}`,report.id);

activeCount++;

updateStats();

});

// --- REMOVE ---
function enableRemove(marker,id){

marker.on("click",()=>{

const r=allReports[id];

const created=new Date(r.created_at).toLocaleString();

details.innerHTML=`
<strong>ID:</strong> ${id}<br>
<strong>Inserita:</strong> ${created}<br>
<strong>Via:</strong> ${r.street}<br>
<strong>Descrizione:</strong> ${r.description||"Nessuna"}
`;

});

marker.on("dblclick",async ()=>{

await deleteReport(id);

clusterGroup.removeLayer(markers[id].marker);

addChat(`❌ Cacca rimossa`,id);

delete markers[id];

activeCount--;
deletedCount++;

updateStats();

});

}

// --- BOTTONI ---
const locateControl=L.control({position:"topleft"});

locateControl.onAdd=()=>{

const btn=L.DomUtil.create("button");

btn.innerHTML="📍";
btn.style="background:white;border:1px solid #ccc;padding:6px;cursor:pointer;font-size:18px;";

L.DomEvent.disableClickPropagation(btn);

btn.onclick=()=>{

if(userPosition) map.setView(userPosition,17);

};

return btn;

};

locateControl.addTo(map);

const poopControl=L.control({position:"topleft"});

poopControl.onAdd=()=>{

const btn=L.DomUtil.create("button");

btn.innerHTML="💩";

btn.style="background:white;border:1px solid #ccc;padding:6px;cursor:pointer;font-size:18px;margin-top:5px;";

L.DomEvent.disableClickPropagation(btn);

btn.onclick=async ()=>{

if(!userPosition){
alert("GPS non disponibile");
return;
}

const desc=prompt("Descrizione (facoltativa)");

const street="Via sconosciuta";

const report=await addReport(userPosition[0],userPosition[1],street,desc);

const marker=L.marker([report.latitude,report.longitude],{icon:poopIcon});

clusterGroup.addLayer(marker);

markers[report.id]={marker,street:report.street,created_at:report.created_at,description:report.description};

allReports[report.id]={street:report.street,created_at:report.created_at,description:report.description};

enableRemove(marker,report.id);

addChat(`✅ Cacca aggiunta in ${report.street}`,report.id);

activeCount++;

updateStats();

};

return btn;

};

poopControl.addTo(map);

// --- START ---
loadReports();
loadChat();
