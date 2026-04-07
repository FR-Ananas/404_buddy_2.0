const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { userQueries } = require("../db");

// POST /api/register
router.post("/register", async (req, res) => {
  const { username, password, avatar } = req.body;

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
  const info = userQueries.create.run(username, hash, avatar || null);

  req.session.userId = info.lastInsertRowid;
  req.session.username = username;
  req.session.avatar = avatar || null;

  res.json({ ok: true });
});

// POST /api/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

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

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.avatar = user.avatar;

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
    id: req.session.userId,
    username: req.session.username,
    avatar: req.session.avatar,
  });
});

module.exports = router;
