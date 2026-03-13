// =========================
// CONFIG SUPABASE
// =========================
const SUPABASE_URL = "https://gvlwrwcbcbsdjiauzxuq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2bHdyd2NiY2JzZGppYXV6eHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTYxNDMsImV4cCI6MjA4ODk5MjE0M30.uIDogfXNncPKjjwwMt-RUwpjpg6Qaa_pWCsZm6bOV1g";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =========================
// MAPPA
// =========================
const map = L.map('map', {
  center: [41.9, 12.5],
  zoom: 13,
  maxZoom: 19
});
map.doubleClickZoom.disable();

const clusterGroup = L.markerClusterGroup({
  iconCreateFunction: function (cluster) {
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
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

// =========================
// POSIZIONE UTENTE
// =========================
let userMarker = null;
let accuracyCircle = null;
let userPosition = null;

if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(position => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = position.coords.accuracy;

    userPosition = [lat, lng];
    localStorage.setItem("lastUserPosition", JSON.stringify(userPosition));

    if (!userMarker) {
      userMarker = L.circleMarker([lat, lng], {
        radius: 8,
        color: "#007bff",
        fillColor: "#007bff",
        fillOpacity: 1
      }).addTo(map);

      accuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
        color: "#007bff",
        fillColor: "#007bff",
        fillOpacity: 0.15,
        weight: 1
      }).addTo(map);

      map.setView([lat, lng], 16);
    } else {
      userMarker.setLatLng([lat, lng]);
      accuracyCircle.setLatLng([lat, lng]);
      accuracyCircle.setRadius(accuracy);
    }
  }, err => {
    console.log("GPS errore:", err);
    const savedPos = localStorage.getItem("lastUserPosition");
    if (savedPos) {
      const pos = JSON.parse(savedPos);
      userPosition = pos;
      map.setView(pos, 16);
    }
  }, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 10000
  });
} else {
  const savedPos = localStorage.getItem("lastUserPosition");
  if (savedPos) {
    const pos = JSON.parse(savedPos);
    userPosition = pos;
    map.setView(pos, 16);
  }
}

// =========================
// VARIABILI GLOBALI
// =========================
const markers = {};
const allReports = {};
const chat = document.getElementById("chat");

const activeCountEl = document.getElementById("active-count");
const deletedCountEl = document.getElementById("deleted-count");
const totalCountEl = document.getElementById("total-count");

let activeCount = 0;
let deletedCount = 0;

function updateStats() {
  activeCountEl.textContent = `Attive: ${activeCount}`;
  deletedCountEl.textContent = `Eliminate: ${deletedCount}`;
  totalCountEl.textContent = `Totali: ${activeCount + deletedCount}`;
}

const details = document.getElementById("details");

// =========================
// CHAT
// =========================
function addChat(message, reportId = null) {
  const entry = document.createElement("div");
  entry.className = "chat-entry";
  entry.textContent = message;

  if (reportId) {
    entry.style.cursor = "pointer";
    entry.addEventListener("click", () => {
      const report = allReports[reportId];
      if (report) {
        const created = new Date(report.created_at).toLocaleString();
        const deleted = report.deleted_at
          ? new Date(report.deleted_at).toLocaleString()
          : "Ancora presente";

        details.innerHTML = `
          <strong>Segnalazione ID:</strong> ${reportId}<br>
          <strong>Data inserimento:</strong> ${created}<br>
          <strong>Data rimozione:</strong> ${deleted}<br>
          <strong>Via:</strong> ${report.street}<br>
          <strong>Descrizione:</strong> ${report.description || "Nessuna"}
        `;
      }
    });
  }

  chat.appendChild(entry);

  if (chat.children.length > 50) {
    chat.removeChild(chat.firstChild);
  }

  chat.scrollTop = chat.scrollHeight;
}

// =========================
// CARICA STATISTICHE
// =========================
supabase.from("stats").select("*").single().then(({ data }) => {
  activeCount = data.active;
  deletedCount = data.deleted;
  updateStats();
});

// =========================
// CARICA EVENTI
// =========================
supabase.from("events")
  .select("*")
  .order("timestamp", { ascending: true })
  .then(({ data }) => {
    data.forEach(ev => {
      const formatted = new Date(ev.timestamp).toLocaleString();
      const street = ev.street || "Via sconosciuta";
      const description = ev.description || null;

      if (ev.type === "add") {
        addChat(`✅ Cacca segnalata il ${formatted} in ${street}`, ev.report_id);
        allReports[ev.report_id] = { street, created_at: ev.timestamp, description };
      }
      if (ev.type === "delete") {
        addChat(`❌ Cacca rimossa il ${formatted} in ${street}`, ev.report_id);
        if (allReports[ev.report_id]) {
          allReports[ev.report_id].deleted_at = ev.timestamp;
        }
      }
    });
  });

// =========================
// MAP TILE
// =========================
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// =========================
// CARICA REPORT ESISTENTI
// =========================
supabase.from("reports").select("*").then(({ data }) => {
  data.forEach(p => {
    const marker = L.marker([p.latitude, p.longitude], { icon: poopIcon });
    clusterGroup.addLayer(marker);

    const date = new Date(p.created_at);
    const formatted = date.toLocaleString();

    marker.bindTooltip(`Aggiunta il: ${formatted}\n${p.street}`, { direction: "top" });

    markers[p.id] = { marker, street: p.street, created_at: p.created_at, description: p.description };
    allReports[p.id] = { street: p.street, created_at: p.created_at, description: p.description };

    enableRemove(marker, p.id);
  });
});

// =========================
// CLICK MAPPA → NUOVA CACCA
// =========================
map.on("click", async function (e) {
  const description = prompt("Inserisci una descrizione della cacca (facoltativo)");

  const { data, error } = await supabase.from("reports").insert({
    latitude: e.latlng.lat,
    longitude: e.latlng.lng,
    description
  }).select().single();

  if (!error) {
    await supabase.from("events").insert({
      report_id: data.id,
      type: "add",
      street: data.street,
      description
    });
  }
});

// =========================
// REALTIME SUPABASE
// =========================
supabase.channel("reports-changes")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "reports" }, payload => {
    const p = payload.new;

    if (!markers[p.id]) {
      const marker = L.marker([p.latitude, p.longitude], { icon: poopIcon });
      clusterGroup.addLayer(marker);

      const formatted = new Date(p.created_at).toLocaleString();
      marker.bindTooltip(`Aggiunta il: ${formatted}\n${p.street}`, { direction: "top" });

      markers[p.id] = { marker, street: p.street, created_at: p.created_at, description: p.description };
      allReports[p.id] = { street: p.street, created_at: p.created_at, description: p.description };

      enableRemove(marker, p.id);
      addChat(`✅ Cacca aggiunta il ${formatted} in ${p.street}`, p.id);

      activeCount++;
      updateStats();
    }
  })
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "reports" }, payload => {
    const p = payload.new;

    if (p.deleted_at && markers[p.id]) {
      clusterGroup.removeLayer(markers[p.id].marker);
      delete markers[p.id];

      addChat(`❌ Cacca rimossa il ${new Date().toLocaleString()} in ${p.street}`, p.id);

      if (allReports[p.id]) {
        allReports[p.id].deleted_at = p.deleted_at;
      }

      activeCount--;
      deletedCount++;
      updateStats();
    }
  })
  .subscribe();

// =========================
// FUNZIONE CANCELLAZIONE
// =========================
function enableRemove(marker, id) {
  marker.on("click", function (e) {
    L.DomEvent.stopPropagation(e);

    const report = allReports[id];
    if (report) {
      const created = new Date(report.created_at).toLocaleString();
      const deleted = report.deleted_at
        ? new Date(report.deleted_at).toLocaleString()
        : "Ancora presente";

      details.innerHTML = `
        <strong>Segnalazione ID:</strong> ${id}<br>
        <strong>Data inserimento:</strong> ${created}<br>
        <strong>Data rimozione:</strong> ${deleted}<br>
        <strong>Via:</strong> ${report.street}<br>
        <strong>Descrizione:</strong> ${report.description || "Nessuna"}
      `;
    }
  });

  marker.on("dblclick", async function (e) {
    L.DomEvent.stopPropagation(e);

    await supabase.from("reports")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    await supabase.from("events").insert({
      report_id: id,
      type: "delete",
      street: markers[id].street
    });
  });
}

// =========================
// BOTTONE CENTRA SU DI ME
// =========================
const locateControl = L.control({ position: "topleft" });

locateControl.onAdd = function () {
  const btn = L.DomUtil.create("button");

  btn.innerHTML = "📍";
  btn.title = "Vai alla tua posizione";

  btn.style.background = "white";
  btn.style.border = "1px solid #ccc";
  btn.style.padding = "6px";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "18px";

  L.DomEvent.disableClickPropagation(btn);

  btn.onclick = function (e) {
    L.DomEvent.stopPropagation(e);

    if (userPosition) {
      map.setView(userPosition, 17);
    }
  };

  return btn;
};

locateControl.addTo(map);

// =========================
// BOTTONE SEGNALA CACCA QUI
// =========================
const poopControl = L.control({ position: "topleft" });

poopControl.onAdd = function () {
  const btn = L.DomUtil.create("button");

  btn.innerHTML = "💩";
  btn.title = "Segnala cacca qui";

  btn.style.background = "white";
  btn.style.border = "1px solid #ccc";
  btn.style.padding = "6px";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "18px";
  btn.style.marginTop = "5px";

  L.DomEvent.disableClickPropagation(btn);

  btn.onclick = async function (e) {
    L.DomEvent.stopPropagation(e);

    if (!userPosition) {
      alert("Posizione GPS non ancora disponibile");
      return;
    }

    const description = prompt("Descrizione della cacca (facoltativa)");

    const { data, error } = await supabase.from("reports").insert({
      latitude: userPosition[0],
      longitude: userPosition[1],
      description
    }).select().single();

    if (!error) {
      await supabase.from("events").insert({
        report_id: data.id,
        type: "add",
        street: data.street,
        description
      });
    }
  };

  return btn;
};

poopControl.addTo(map);
