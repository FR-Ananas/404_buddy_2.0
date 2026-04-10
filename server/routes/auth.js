const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { userQueries } = require("../db");

// "(27F538)Matteo" → { username: "Matteo", color: "#27F538" }
// "Matteo"         → { username: "Matteo", color: null }
const COLOR_RE = /^\(([0-9A-Fa-f]{6})\)(.+)$/;
function parseUsername(raw) {
  const m = raw.trim().match(COLOR_RE);
  if (m) return { color: "#" + m[1].toUpperCase(), username: m[2].trim() };
  return { color: null, username: raw.trim() };
}

// POST /api/register
router.post("/register", async (req, res) => {
  const { password, avatar } = req.body;
  const { username, color } = parseUsername(req.body.username || "");

  if (!username || !password) {
    return res.status(400).json({ error: "Pseudo et mot de passe requis." });
  }
  if (username.length < 2 || username.length > 24) {
    return res.status(400).json({ error: "Le pseudo doit faire entre 2 et 24 caractères." });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: "Mot de passe trop court (min 4 caractères)." });
  }

  const existing = userQueries.findByUsername.get(username);
  if (existing) {
    return res.status(409).json({ error: "Ce pseudo est déjà pris." });
  }

  const hash = await bcrypt.hash(password, 10);
  const info = userQueries.create.run(username, hash, avatar || null, color);

  req.session.userId   = info.lastInsertRowid;
  req.session.username = username;
  req.session.avatar   = avatar || null;
  req.session.color    = color;
  req.session.isAdmin  = false;

  res.json({ ok: true });
});

// POST /api/login
router.post("/login", async (req, res) => {
  const { password } = req.body;
  const { username } = parseUsername(req.body.username || "");

  if (!username || !password) {
    return res.status(400).json({ error: "Pseudo et mot de passe requis." });
  }

  const user = userQueries.findByUsername.get(username);
  if (!user) {
    return res.status(401).json({ error: "Pseudo ou mot de passe incorrect." });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Pseudo ou mot de passe incorrect." });
  }

  req.session.userId   = user.id;
  req.session.username = user.username;
  req.session.avatar   = user.avatar;
  req.session.color    = user.color;
  req.session.isAdmin  = user.is_admin === 1;

  res.json({ ok: true });
});

// POST /api/logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

// GET /api/me
router.get("/me", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Non authentifié" });
  }
  res.json({
    id:       req.session.userId,
    username: req.session.username,
    avatar:   req.session.avatar,
    color:    req.session.color,
    isAdmin:  req.session.isAdmin,
  });
});

module.exports = router;
