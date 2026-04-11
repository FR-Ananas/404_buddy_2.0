require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const MemoryStore = require("memorystore")(session);
const path = require("path");

const authRoutes = require("./routes/auth");
const apiRoutes = require("./routes/api");
const { requireAuth } = require("./middleware/auth");
const registerSocketHandlers = require("./socket");
const { initDb, initAdmin } = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Make io accessible in route handlers via req.app.get("io")
app.set("io", io);

// --- Session ---
const sessionMiddleware = session({
  store: new MemoryStore({ checkPeriod: 86400000 }),
  secret: process.env.SESSION_SECRET || "aeglane_secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
});

app.use(express.json({ limit: "5mb" }));
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

// --- Routes ---
app.use("/api", authRoutes);
app.use("/api", apiRoutes);

app.get("/", (req, res) => {
  if (req.session.userId) return res.redirect("/chat.html");
  res.redirect("/login.html");
});

app.get("/chat.html", requireAuth, (req, res, next) => next());
app.use(express.static(path.join(__dirname, "../public")));

// --- Socket.IO ---
registerSocketHandlers(io);

// --- Start ---
const PORT = process.env.PORT || 3000;

initDb()
  .then(() => initAdmin())
  .then(() => {
    server.listen(PORT, () => {
      console.log(`✅ Aeglane en ligne → http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Échec du démarrage :", err);
    process.exit(1);
  });
