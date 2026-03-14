// server.js
const fs = require("fs");               // serve per leggere i certificati
const https = require("https");         // HTTPS server
const express = require("express");
const { Pool } = require("pg");
const WebSocket = require("ws");
const cors = require("cors");
const fetch = require("node-fetch");    // assicurati sia node-fetch@2

// --- CERTIFICATI AUTO-FIRMATI ---
const options = {
  key: fs.readFileSync("server.key"),
  cert: fs.readFileSync("server.cert")
};

// --- FUNZIONE REVERSE GEOCODING ---
async function getStreet(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "CacheroonApp" } });
    const data = await res.json();
    return data.address?.road || "Via sconosciuta";
  } catch (err) {
    console.error("Errore reverse geocoding:", err);
    return "Via sconosciuta";
  }
}

// --- EXPRESS ---
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname)); // serve tutti i file dalla cartella del progetto

// --- POOL POSTGRESQL ---
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "cacheroon",
  password: ".Faraone260506#", // metti la tua password corretta
  port: 5432
});

// --- ROUTE ---
app.get("/reports", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM poop_reports");
    res.json(result.rows);
  } catch (err) {
    console.error("Errore /reports:", err);
    res.status(500).send("Internal Server Error: " + err.message);
  }
});

app.get("/events", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        events.*,
        COALESCE(events.street, poop_reports.street) AS street,
        COALESCE(events.description, poop_reports.description) AS description
      FROM events
      LEFT JOIN poop_reports
      ON events.report_id = poop_reports.id
      ORDER BY events.timestamp DESC
      LIMIT 50
    `);
    res.json(result.rows.reverse());
  } catch (err) {
    console.error("Errore /events:", err);
    res.status(500).send("Internal Server Error: " + err.message);
  }
});

app.get("/stats", async (req, res) => {
  try {
    const active = await pool.query("SELECT COUNT(*) FROM poop_reports");
    const deleted = await pool.query("SELECT COUNT(*) FROM events WHERE type='delete'");
    res.json({
      active: parseInt(active.rows[0].count),
      deleted: parseInt(deleted.rows[0].count),
      total: parseInt(active.rows[0].count) + parseInt(deleted.rows[0].count)
    });
  } catch (err) {
    console.error("Errore /stats:", err);
    res.status(500).send("Internal Server Error: " + err.message);
  }
});

// --- POST / DELETE REPORT ---
app.post("/report", async (req, res) => {
  try {
    const { lat, lng, description } = req.body;
    const street = await getStreet(lat, lng);

    const result = await pool.query(
      "INSERT INTO poop_reports(latitude,longitude,street,description) VALUES($1,$2,$3,$4) RETURNING *",
      [lat, lng, street, description || null]
    );

    await pool.query(
      "INSERT INTO events(type,report_id,street,description) VALUES($1,$2,$3,$4)",
      ["add", result.rows[0].id, street, description]
    );

    broadcast(JSON.stringify({ type: "new", data: result.rows[0] }));
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Errore /report POST:", err);
    res.status(500).send("Internal Server Error: " + err.message);
  }
});

app.delete("/report/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const streetResult = await pool.query(
      "SELECT street, description FROM poop_reports WHERE id=$1",
      [id]
    );
    const street = streetResult.rows[0]?.street || "Via sconosciuta";
    const description = streetResult.rows[0]?.description || null;

    await pool.query(
      "INSERT INTO events(type,report_id,street,description) VALUES($1,$2,$3,$4)",
      ["delete", id, street, description]
    );

    await pool.query("DELETE FROM poop_reports WHERE id=$1", [id]);

    broadcast(JSON.stringify({ type: "delete", id: id }));
    res.sendStatus(200);
  } catch (err) {
    console.error("Errore /report DELETE:", err);
    res.status(500).send("Internal Server Error: " + err.message);
  }
});

// --- SERVER HTTPS E WEBSOCKET ---
const server = https.createServer(options, app);

server.listen(443, "0.0.0.0", () => {
  console.log("Server HTTPS auto-firmato in ascolto sulla porta 443");
});

const wss = new WebSocket.Server({ server });
let clients = [];

wss.on("connection", ws => {
  clients.push(ws);
  ws.on("close", () => {
    clients = clients.filter(c => c !== ws);
  });
});

function broadcast(message) {
  clients.forEach(c => c.send(message));
}
