/**
 * Middleware: redirects unauthenticated requests to /login.html
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Non authentifié" });
  }
  res.redirect("/login.html");
}

/**
 * Middleware: redirects already-authenticated users to /chat.html
 */
function redirectIfAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect("/chat.html");
  }
  next();
}

module.exports = { requireAuth, redirectIfAuth };
