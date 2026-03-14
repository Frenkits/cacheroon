const express = require("express")
const { Pool } = require("pg")
const WebSocket = require("ws")
const cors = require("cors")
const fetch = require("node-fetch")

async function getStreet(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`

  try {
    const res = await fetch(url, { headers: { "User-Agent": "CacheroonApp" } })
    const data = await res.json()
    return data.address?.road || "Via sconosciuta"
  } catch (err) {
    console.error("Errore reverse geocoding:", err)
    return "Via sconosciuta"
  }
}

const app = express()

app.use(express.json())
app.use(cors())
const path = require("path");

// serve la root del progetto come cartella statica
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "cacheroon",
  password: ".Faraone260506#",
  port: 5432
})

app.get("/reports", async (req,res)=>{
  try {
    const result = await pool.query("SELECT * FROM poop_reports");
    res.json(result.rows);
  } catch(err){
    console.error("Errore /reports:", err); // <--- stampa l’errore completo
    res.status(500).send("Internal Server Error");
  }
});

app.get("/events", async (req,res)=>{

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
  `)

  res.json(result.rows.reverse())

})

app.post("/report", async (req,res)=>{

  const { lat, lng, description } = req.body

  const street = await getStreet(lat,lng)

  const result = await pool.query(
    "INSERT INTO poop_reports(latitude,longitude,street,description) VALUES($1,$2,$3,$4) RETURNING *",
    [lat,lng,street,description || null]
  )

  await pool.query(
    "INSERT INTO events(type,report_id,street,description) VALUES($1,$2,$3,$4)",
    ["add",result.rows[0].id,street,description]
  )

  broadcast(JSON.stringify({
    type:"new",
    data:result.rows[0]
  }))

  res.json(result.rows[0])

})

app.delete("/report/:id", async (req,res)=>{

  const id = req.params.id

  try{

    const streetResult = await pool.query(
      "SELECT street, description FROM poop_reports WHERE id=$1",
      [id]
    )

    const street = streetResult.rows[0]?.street || "Via sconosciuta"
    const description = streetResult.rows[0]?.description || null

    await pool.query(
      "INSERT INTO events(type,report_id,street,description) VALUES($1,$2,$3,$4)",
      ["delete",id,street,description]
    )

    await pool.query(
      "DELETE FROM poop_reports WHERE id=$1",
      [id]
    )

    broadcast(JSON.stringify({
      type:"delete",
      id:id
    }))

    res.sendStatus(200)

  }catch(err){

    console.error(err)
    res.sendStatus(500)

  }

})

app.get("/stats", async (req,res)=>{

  try{

    const active = await pool.query(
      "SELECT COUNT(*) FROM poop_reports"
    )

    const deleted = await pool.query(
      "SELECT COUNT(*) FROM events WHERE type='delete'"
    )

    const activeCount = parseInt(active.rows[0].count)
    const deletedCount = parseInt(deleted.rows[0].count)

    res.json({
      active: activeCount,
      deleted: deletedCount,
      total: activeCount + deletedCount
    })

  }catch(err){
    console.error(err)
    res.sendStatus(500)
  }

})

const server = app.listen(3000, "0.0.0.0", () => {
  console.log("Server in ascolto sulla porta 3000")
})

const wss = new WebSocket.Server({server})

let clients = []

wss.on("connection", ws=>{
 clients.push(ws)
})

function broadcast(message){

 clients.forEach(c=>{
  c.send(message)
 })

}
