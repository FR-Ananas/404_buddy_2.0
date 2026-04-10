function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Non authentifié" });
  }
  res.redirect("/login.html");
}

function redirectIfAuth(req, res, next) {
  if (req.session && req.session.userId) return res.redirect("/chat.html");
  next();
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(403).json({ error: "Accès réservé à l'administrateur." });
}

module.exports = { requireAuth, redirectIfAuth, requireAdmin };
