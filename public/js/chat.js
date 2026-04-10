"use strict";

// ============================
// State
// ============================
let me = null;
let rooms = [];
let currentRoom = null;
let typingTimeout = null;
const typingUsers = new Map();

// ============================
// DOM refs
// ============================
const $ = (id) => document.getElementById(id);

const messagesEl    = $("messages");
const roomLoaderEl  = $("roomLoader");
const msgInput      = $("msgInput");
const sendBtn       = $("sendBtn");
const roomListEl    = $("roomList");
const userListEl    = $("userList");
const onlineCount   = $("onlineCount");
const selfName      = $("selfName");
const selfAvatar    = $("selfAvatar");
const themeToggle   = $("themeToggle");
const logoutBtn     = $("logoutBtn");
const typingEl      = $("typingIndicator");
const fileInput     = $("fileInput");
const attachBtn     = $("attachBtn");
const lightbox      = $("lightbox");
const lightboxImg   = $("lightboxImg");
const sidebar       = $("sidebar");
const sidebarToggle = $("sidebarToggle");
const roomNameEl    = $("currentRoomName");
const roomDescEl    = $("currentRoomDesc");
const addRoomBtn    = $("addRoomBtn");
const createRoomModal = $("createRoomModal");
const createRoomBtn = $("createRoomBtn");
const cancelRoomBtn = $("cancelRoomBtn");
const newRoomName   = $("newRoomName");
const newRoomDesc   = $("newRoomDesc");
const createRoomError = $("createRoomError");

// ============================
// Theme
// ============================
(function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  themeToggle.textContent = saved === "dark" ? "☀️" : "🌙";
})();

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
});

// ============================
// Sidebar (mobile)
// ============================
sidebarToggle.addEventListener("click", () => sidebar.classList.toggle("open"));
messagesEl.addEventListener("click", () => sidebar.classList.remove("open"));

// ============================
// Logout
// ============================
logoutBtn.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login.html";
});

// ============================
// Avatar helpers
// ============================
function makeAvatar(username, avatar, large = false) {
  const cls = large ? "msg-avatar" : "avatar-placeholder";
  if (avatar) {
    const img = document.createElement("img");
    img.src = avatar;
    img.className = large ? "msg-avatar" : "user-item-avatar";
    img.alt = username;
    return img;
  }
  const div = document.createElement("div");
  div.className = large ? "msg-avatar-placeholder" : "avatar-placeholder";
  div.textContent = username[0].toUpperCase();
  return div;
}

// ============================
// Render helpers
// ============================
let lastMsgAuthor = null;
let lastMsgTime   = null;

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function linkify(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/https?:\/\/[^\s<>"]+/g, (url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}

/** Build a styled username span (color + admin glow) */
function makeUsernameSpan(username, color, isAdmin) {
  const span = document.createElement("span");
  span.className = "msg-author" + (isAdmin ? " is-admin" : "");
  span.textContent = username;
  if (color) span.style.color = color;
  return span;
}

function appendMessage(msg, prepend = false) {
  const isAdmin  = msg.is_admin === 1;
  const isGrouped = !prepend
    && lastMsgAuthor === msg.username
    && lastMsgTime
    && (new Date(msg.created_at) - new Date(lastMsgTime)) < 5 * 60 * 1000;

  const row = document.createElement("div");
  row.className = "msg" + (isGrouped ? " grouped" : "");

  row.appendChild(makeAvatar(msg.username, msg.avatar, true));

  const body = document.createElement("div");
  body.className = "msg-body";

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.appendChild(makeUsernameSpan(msg.username, msg.color, isAdmin));
  const time = document.createElement("span");
  time.className = "msg-time";
  time.textContent = formatTime(msg.created_at);
  meta.appendChild(time);
  body.appendChild(meta);

  if (msg.type === "image") {
    const img = document.createElement("img");
    img.src = msg.content;
    img.className = "msg-image";
    img.alt = "image";
    img.addEventListener("click", () => {
      lightboxImg.src = msg.content;
      lightbox.style.display = "flex";
    });
    body.appendChild(img);
  } else {
    const content = document.createElement("div");
    content.className = "msg-content";
    content.innerHTML = linkify(msg.content);
    body.appendChild(content);
  }

  row.appendChild(body);

  if (prepend) {
    messagesEl.insertBefore(row, messagesEl.firstChild);
  } else {
    messagesEl.appendChild(row);
    lastMsgAuthor = msg.username;
    lastMsgTime   = msg.created_at;
  }
}

function appendSystem(text) {
  const el = document.createElement("div");
  el.className = "msg-system";
  el.textContent = text;
  messagesEl.appendChild(el);
  lastMsgAuthor = null;
  scrollBottom();
}

function scrollBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ============================
// Loader
// ============================
function showLoader() {
  roomLoaderEl.style.display = "flex";
  messagesEl.style.display   = "none";
}
function hideLoader() {
  roomLoaderEl.style.display = "none";
  messagesEl.style.display   = "flex";
}

// ============================
// Render user list
// ============================
function renderUsers(users) {
  onlineCount.textContent = users.length;
  userListEl.innerHTML = "";
  users.forEach((u) => {
    const li = document.createElement("li");
    li.className = "user-item";
    li.appendChild(makeAvatar(u.username, u.avatar, false));
    const nameSpan = document.createElement("span");
    nameSpan.textContent = u.username + (u.username === me?.username ? " (moi)" : "");
    if (u.color) nameSpan.style.color = u.color;
    if (u.isAdmin) nameSpan.classList.add("is-admin");
    li.appendChild(nameSpan);
    userListEl.appendChild(li);
  });
}

// ============================
// Render room list
// ============================
function renderRooms() {
  roomListEl.innerHTML = "";
  rooms.forEach((r) => {
    const li = document.createElement("li");
    li.className = "room-item" + (r.name === currentRoom ? " active" : "");

    const hash = document.createElement("span");
    hash.className = "room-hash-icon";
    hash.textContent = "#";

    const nameSpan = document.createElement("span");
    nameSpan.style.flex = "1";
    nameSpan.textContent = r.name;

    li.appendChild(hash);
    li.appendChild(nameSpan);
    li.addEventListener("click", () => joinRoom(r.name));

    // Admin delete button (only on non-protected rooms)
    if (me?.isAdmin && !r.protected) {
      const delBtn = document.createElement("button");
      delBtn.className = "room-delete-btn";
      delBtn.textContent = "×";
      delBtn.title = `Supprimer #${r.name}`;
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteRoom(r.name);
      });
      li.appendChild(delBtn);
    }

    roomListEl.appendChild(li);
  });
}

// ============================
// Typing indicator
// ============================
function updateTypingDisplay() {
  const names = [...typingUsers.keys()];
  if (!names.length) { typingEl.textContent = ""; return; }
  if (names.length === 1) { typingEl.textContent = `${names[0]} est en train d'écrire…`; return; }
  typingEl.textContent = `${names.slice(0, -1).join(", ")} et ${names.at(-1)} écrivent…`;
}

// ============================
// Socket.IO
// ============================
const socket = io({ withCredentials: true });

socket.on("connect", () => console.log("Socket connecté", socket.id));
socket.on("auth_error", () => { window.location.href = "/login.html"; });

socket.on("history", (messages) => {
  messagesEl.innerHTML = "";
  lastMsgAuthor = null;
  lastMsgTime   = null;
  messages.forEach((m) => appendMessage(m));
  hideLoader();
  scrollBottom();
});

socket.on("new_message", (msg) => {
  appendMessage(msg);
  scrollBottom();
  if (typingUsers.has(msg.username)) {
    clearTimeout(typingUsers.get(msg.username));
    typingUsers.delete(msg.username);
    updateTypingDisplay();
  }
});

socket.on("system_message", ({ text }) => appendSystem(text));
socket.on("user_list", (users) => renderUsers(users));

socket.on("user_typing", ({ username, isTyping }) => {
  if (username === me?.username) return;
  if (typingUsers.has(username)) clearTimeout(typingUsers.get(username));
  if (isTyping) {
    typingUsers.set(username, setTimeout(() => {
      typingUsers.delete(username);
      updateTypingDisplay();
    }, 3000));
  } else {
    typingUsers.delete(username);
  }
  updateTypingDisplay();
});

socket.on("room_created", (room) => {
  if (!rooms.find((r) => r.name === room.name)) {
    rooms.push(room);
    renderRooms();
  }
});

socket.on("room_deleted", ({ name }) => {
  rooms = rooms.filter((r) => r.name !== name);
  renderRooms();
  // If currently in the deleted room, auto-join the first available one
  if (currentRoom === name && rooms.length > 0) {
    currentRoom = null;
    joinRoom(rooms[0].name);
  }
});

socket.on("error", (msg) => console.error("Socket error:", msg));

// ============================
// Join room
// ============================
function joinRoom(roomName) {
  if (roomName === currentRoom) return;
  currentRoom = roomName;
  const room = rooms.find((r) => r.name === roomName);
  roomNameEl.textContent = roomName;
  roomDescEl.textContent = room?.description || "";
  msgInput.placeholder = `Message dans #${roomName}…`;
  typingUsers.clear();
  updateTypingDisplay();
  lastMsgAuthor = null;
  lastMsgTime   = null;
  renderRooms();
  showLoader();
  socket.emit("join_room", roomName);
  sidebar.classList.remove("open");
}

// ============================
// Send message
// ============================
function sendMessage() {
  const content = msgInput.value;
  if (!content.trim()) return;
  socket.emit("send_message", { content, type: "text" });
  msgInput.value = "";
  socket.emit("typing", false);
  clearTimeout(typingTimeout);
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
msgInput.addEventListener("input", () => {
  socket.emit("typing", true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit("typing", false), 2500);
});

// ============================
// Image upload
// ============================
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX_WIDTH = 1280;
      let { width, height } = img;
      if (width > MAX_WIDTH) { height = Math.round(height * MAX_WIDTH / width); width = MAX_WIDTH; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Format non supporté")); };
    img.src = objectUrl;
  });
}

attachBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = "";
  try {
    const compressed = await compressImage(file);
    socket.emit("send_message", { content: compressed, type: "image" });
  } catch (err) { console.error("Erreur envoi image :", err); }
});

// ============================
// Lightbox
// ============================
lightbox.addEventListener("click", (e) => { if (e.target === lightbox) lightbox.style.display = "none"; });

// ============================
// Admin — create room
// ============================
addRoomBtn.addEventListener("click", () => {
  newRoomName.value = "";
  newRoomDesc.value = "";
  createRoomError.textContent = "";
  createRoomModal.style.display = "flex";
  newRoomName.focus();
});

cancelRoomBtn.addEventListener("click", () => { createRoomModal.style.display = "none"; });

createRoomModal.addEventListener("click", (e) => {
  if (e.target === createRoomModal) createRoomModal.style.display = "none";
});

createRoomBtn.addEventListener("click", async () => {
  const name = newRoomName.value.trim().toLowerCase();
  const description = newRoomDesc.value.trim();
  createRoomError.textContent = "";

  const res = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
  const data = await res.json();
  if (!res.ok) { createRoomError.textContent = data.error; return; }
  createRoomModal.style.display = "none";
  joinRoom(data.name);
});

newRoomName.addEventListener("keydown", (e) => { if (e.key === "Enter") createRoomBtn.click(); });

// ============================
// Admin — delete room
// ============================
async function deleteRoom(name) {
  if (!confirm(`Supprimer définitivement #${name} et tous ses messages ?`)) return;
  const res = await fetch(`/api/rooms/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json();
    alert(data.error || "Erreur lors de la suppression.");
  }
}

// ============================
// Init
// ============================
async function init() {
  const meRes = await fetch("/api/me");
  if (!meRes.ok) { window.location.href = "/login.html"; return; }
  me = await meRes.json();

  selfName.textContent = me.username;
  if (me.color) selfName.style.color = me.color;
  if (me.isAdmin) selfName.classList.add("is-admin");

  if (me.avatar) { selfAvatar.src = me.avatar; selfAvatar.style.display = ""; }
  if (me.isAdmin) addRoomBtn.style.display = "";

  const roomsRes = await fetch("/api/rooms");
  if (!roomsRes.ok) return;
  rooms = await roomsRes.json();
  renderRooms();

  if (rooms.length > 0) joinRoom(rooms[0].name);
}

init();
