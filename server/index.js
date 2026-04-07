require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const path = require("path");

const authRoutes = require("./routes/auth");
const apiRoutes = require("./routes/api");
const { requireAuth, redirectIfAuth } = require("./middleware/auth");
const registerSocketHandlers = require("./socket");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Session setup ---
const sessionMiddleware = session({
  store: new SQLiteStore({ db: "sessions.db", dir: path.join(__dirname, "..") }),
  secret: process.env.SESSION_SECRET || "404buddy_secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});

app.use(express.json({ limit: "5mb" }));
app.use(sessionMiddleware);

// Share session with Socket.IO
io.engine.use(sessionMiddleware);

// --- Routes ---
app.use("/api", authRoutes);
app.use("/api", apiRoutes);

// Redirect root based on auth
app.get("/", (req, res) => {
  if (req.session.userId) return res.redirect("/chat.html");
  res.redirect("/login.html");
});

// Protect chat.html
app.get("/chat.html", requireAuth, (req, res, next) => next());

// Static files
app.use(express.static(path.join(__dirname, "../public")));

// --- Socket.IO ---
registerSocketHandlers(io);

// --- Start ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ 404Buddy 2.0 en ligne → http://localhost:${PORT}`);
});
