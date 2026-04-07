const router = require("express").Router();
const { roomQueries, messageQueries } = require("../db");
const { requireAuth } = require("../middleware/auth");

// GET /api/rooms — list available rooms
router.get("/rooms", requireAuth, (req, res) => {
  const rooms = roomQueries.all.all();
  res.json(rooms);
});

// GET /api/rooms/:name/history — last 50 messages of a room
router.get("/rooms/:name/history", requireAuth, (req, res) => {
  const room = roomQueries.findByName.get(req.params.name);
  if (!room) return res.status(404).json({ error: "Salon introuvable." });

  const messages = messageQueries.lastN.all(room.id, 50).reverse();
  res.json(messages);
});

module.exports = router;
