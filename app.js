// =========================
// SUPABASE SETUP
// =========================
const SUPABASE_URL = "https://gvlwrwcbcbsdjiauzxuq.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g"

// Creiamo il client Supabase
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)


// =========================
// MAPPA
// =========================
const map = L.map('map',{
  center:[41.9,12.5],
  zoom:13,
  maxZoom:19
})

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
map.doubleClickZoom.disable()

const clusterGroup = L.markerClusterGroup({
  iconCreateFunction: cluster => {
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

const markers = {}
const allReports = {}

const chat = document.getElementById("chat")
const details = document.getElementById("details")


// =========================
// CHAT
// =========================
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
  if(chat.children.length > 50) chat.removeChild(chat.firstChild)
  chat.scrollTop = chat.scrollHeight
}


// =========================
// CARICA REPORT DAL DB
// =========================
async function loadReports(){
  const { data, error } = await db.from("poop_reports").select("*")
  if(error){ console.error(error); return }

  data.forEach(p=>{
    const marker = L.marker([p.latitude, p.longitude], {icon: poopIcon})
    clusterGroup.addLayer(marker)

    markers[p.id] = marker
    allReports[p.id] = {
      street: p.street,
      description: p.description,
      created_at: p.created_at
    }

    enableRemove(marker, p.id)
    addChat(`✅ Cacca segnalata in ${p.street}`, p.id)
  })
}

loadReports()


// =========================
// CREAZIONE NUOVA SEGNALAZIONE
// =========================
async function createReport(lat, lng, description){
  const street = await getStreet(lat, lng)

  const { data, error } = await db.from("poop_reports")
    .insert({ latitude: lat, longitude: lng, street, description })
    .select()

  if(error){ console.error(error); return }

  const p = data[0]
  const marker = L.marker([p.latitude, p.longitude], {icon: poopIcon})
  clusterGroup.addLayer(marker)

  markers[p.id] = marker
  allReports[p.id] = { street: p.street, description: p.description, created_at: p.created_at }

  enableRemove(marker, p.id)
  addChat(`✅ Cacca aggiunta il ${new Date(p.created_at).toLocaleString()} in ${p.street}`, p.id)
}


// =========================
// CANCELLA SEGNALAZIONE
// =========================
async function deleteReport(id){
  const { error } = await db.from("poop_reports").delete().eq("id", id)
  if(error) console.error(error)
}


// =========================
// CLICK SULLA MAPPA
// =========================
map.on("click", async function(e){
  const description = prompt("Descrizione della cacca (facoltativa)")
  await createReport(e.latlng.lat, e.latlng.lng, description)
})


// =========================
// ENABLE REMOVE MARKER
// =========================
function enableRemove(marker, id){
  marker.on("dblclick", async function(e){
    L.DomEvent.stopPropagation(e)
    await deleteReport(id)
  })
}


// =========================
// REVERSE GEOCODING
// =========================
async function getStreet(lat, lng){
  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
    const data = await res.json()
    return data.address?.road || "Via sconosciuta"
  }catch(err){
    console.error(err)
    return "Via sconosciuta"
  }
}


// =========================
// REALTIME SUPABASE
// =========================
db
.channel("realtime-poop")
.on("postgres_changes", { event:"INSERT", schema:"public", table:"poop_reports" }, payload=>{
  const p = payload.new
  const marker = L.marker([p.latitude, p.longitude], {icon: poopIcon})
  clusterGroup.addLayer(marker)

  markers[p.id] = marker
  allReports[p.id] = { street: p.street, description: p.description, created_at: p.created_at }

  enableRemove(marker, p.id)
  addChat(`💩 nuova cacca segnalata il ${new Date(p.created_at).toLocaleString()} in ${p.street}`, p.id)
})
.on("postgres_changes", { event:"DELETE", schema:"public", table:"poop_reports" }, payload=>{
  const id = payload.old.id
  if(markers[id]){
    clusterGroup.removeLayer(markers[id])
    delete markers[id]
    delete allReports[id]
    addChat(`❌ Cacca rimossa`, id)
  }
})
.subscribe()
