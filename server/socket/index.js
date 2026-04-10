const { roomQueries, messageQueries } = require("../db");

// roomName → Set of socket ids
const roomMembers = new Map();
// socketId → { userId, username, avatar, color, isAdmin, roomName }
const socketUsers = new Map();

function getUsersInRoom(roomName) {
  const members = roomMembers.get(roomName) || new Set();
  return [...members].map((sid) => {
    const u = socketUsers.get(sid);
    return u ? { id: u.userId, username: u.username, avatar: u.avatar, color: u.color, isAdmin: u.isAdmin } : null;
  }).filter(Boolean);
}

module.exports = function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    const session = socket.request.session;

    if (!session || !session.userId) {
      socket.emit("auth_error", "Non authentifié");
      return socket.disconnect(true);
    }

    const { userId, username, avatar, color, isAdmin } = session;

    // --- join_room ---
    socket.on("join_room", (roomName) => {
      const room = roomQueries.findByName.get(roomName);
      if (!room) return socket.emit("error", "Salon introuvable.");

      // Leave previous room
      const prev = socketUsers.get(socket.id);
      if (prev && prev.roomName) {
        socket.leave(prev.roomName);
        const prevMembers = roomMembers.get(prev.roomName);
        if (prevMembers) prevMembers.delete(socket.id);
        io.to(prev.roomName).emit("system_message", {
          text: `${username} a quitté #${prev.roomName}`,
          at: new Date().toISOString(),
        });
        io.to(prev.roomName).emit("user_list", getUsersInRoom(prev.roomName));
      }

      // Join new room
      socket.join(roomName);
      if (!roomMembers.has(roomName)) roomMembers.set(roomName, new Set());
      roomMembers.get(roomName).add(socket.id);
      socketUsers.set(socket.id, { userId, username, avatar, color, isAdmin, roomName });

      // Send history
      const history = messageQueries.lastN.all(room.id, 50).reverse();
      socket.emit("history", history);

      io.to(roomName).emit("system_message", {
        text: `${username} a rejoint #${roomName}`,
        at: new Date().toISOString(),
      });
      io.to(roomName).emit("user_list", getUsersInRoom(roomName));
    });

    // --- send_message ---
    socket.on("send_message", ({ content, type = "text" }) => {
      const user = socketUsers.get(socket.id);
      if (!user || !user.roomName) return;

      const room = roomQueries.findByName.get(user.roomName);
      if (!room) return;

      if (!content || typeof content !== "string") return;
      if (type === "text" && content.trim().length === 0) return;
      if (type === "text" && content.length > 250) return;
      if (type === "image" && content.length > 4 * 1024 * 1024) return;

      const trimmed = type === "text" ? content.trim() : content;
      const info = messageQueries.insert.run(room.id, userId, trimmed, type);

      io.to(user.roomName).emit("new_message", {
        id: info.lastInsertRowid,
        room_id: room.id,
        user_id: userId,
        username,
        avatar,
        color,
        is_admin: isAdmin ? 1 : 0,
        content: trimmed,
        type,
        created_at: new Date().toISOString(),
      });
    });

    // --- typing ---
    socket.on("typing", (isTyping) => {
      const user = socketUsers.get(socket.id);
      if (!user || !user.roomName) return;
      socket.to(user.roomName).emit("user_typing", { username, isTyping });
    });

    // --- disconnect ---
    socket.on("disconnect", () => {
      const user = socketUsers.get(socket.id);
      if (!user) return;
      socketUsers.delete(socket.id);

      if (user.roomName) {
        const members = roomMembers.get(user.roomName);
        if (members) members.delete(socket.id);
        io.to(user.roomName).emit("system_message", {
          text: `${username} s'est déconnecté`,
          at: new Date().toISOString(),
        });
        io.to(user.roomName).emit("user_list", getUsersInRoom(user.roomName));
      }
    });
  });
};
