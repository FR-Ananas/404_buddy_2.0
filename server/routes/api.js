const router = require("express").Router();
const { roomQueries, messageQueries } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

// GET /api/rooms
router.get("/rooms", requireAuth, (req, res) => {
  res.json(roomQueries.all.all());
});

// GET /api/rooms/:name/history
router.get("/rooms/:name/history", requireAuth, (req, res) => {
  const room = roomQueries.findByName.get(req.params.name);
  if (!room) return res.status(404).json({ error: "Salon introuvable." });
  const messages = messageQueries.lastN.all(room.id, 50).reverse();
  res.json(messages);
});

// POST /api/rooms  (admin only)
router.post("/rooms", requireAuth, requireAdmin, (req, res) => {
  let { name = "", description = "" } = req.body;
  name = name.trim().toLowerCase();

  if (!/^[a-z0-9-]{2,32}$/.test(name)) {
    return res.status(400).json({
      error: "Nom invalide (2–32 caractères, minuscules / chiffres / tirets).",
    });
  }
  if (roomQueries.findByName.get(name)) {
    return res.status(409).json({ error: "Ce salon existe déjà." });
  }

  const info = roomQueries.create.run(name, description.trim());
  const room = { id: info.lastInsertRowid, name, description: description.trim(), protected: 0 };

  req.app.get("io").emit("room_created", room);
  res.json(room);
});

// DELETE /api/rooms/:name  (admin only)
router.delete("/rooms/:name", requireAuth, requireAdmin, (req, res) => {
  const { name } = req.params;
  const room = roomQueries.findByName.get(name);

  if (!room) return res.status(404).json({ error: "Salon introuvable." });
  if (room.protected) {
    return res.status(403).json({ error: "Ce salon est protégé et ne peut pas être supprimé." });
  }

  // Delete all messages first, then the room
  messageQueries.deleteByRoom.run(room.id);
  roomQueries.delete.run(name);

  req.app.get("io").emit("room_deleted", { name });
  res.json({ ok: true });
});

module.exports = router;
