"use strict";

// ============================
// State
// ============================
let me = null;          // { id, username, avatar }
let rooms = [];         // [{ id, name, description }]
let currentRoom = null; // room name string
let typingTimeout = null;
const typingUsers = new Map(); // username → timer

// ============================
// DOM refs
// ============================
const $ = (id) => document.getElementById(id);

const messagesEl   = $("messages");
const msgInput     = $("msgInput");
const sendBtn      = $("sendBtn");
const roomListEl   = $("roomList");
const userListEl   = $("userList");
const onlineCount  = $("onlineCount");
const selfName     = $("selfName");
const selfAvatar   = $("selfAvatar");
const themeToggle  = $("themeToggle");
const logoutBtn    = $("logoutBtn");
const typingEl     = $("typingIndicator");
const fileInput    = $("fileInput");
const attachBtn    = $("attachBtn");
const lightbox     = $("lightbox");
const lightboxImg  = $("lightboxImg");
const sidebar      = $("sidebar");
const sidebarToggle = $("sidebarToggle");
const roomNameEl   = $("currentRoomName");
const roomDescEl   = $("currentRoomDesc");

// ============================
// Theme
// ============================
(function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  themeToggle.textContent = saved === "dark" ? "☀️" : "🌙";
})();

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
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
// Avatar helper
// ============================
function makeAvatar(username, avatar, cls = "msg-avatar") {
  if (avatar) {
    const img = document.createElement("img");
    img.src = avatar;
    img.className = cls;
    img.alt = username;
    return img;
  }
  const div = document.createElement("div");
  div.className = cls === "msg-avatar" ? "msg-avatar-placeholder" : "avatar-placeholder";
  div.textContent = username[0].toUpperCase();
  return div;
}

// ============================
// Render helpers
// ============================
let lastMsgAuthor = null;
let lastMsgTime = null;

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function linkify(text) {
  const urlPattern = /https?:\/\/[^\s<>"]+/g;
  return text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(urlPattern, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}

function appendMessage(msg, prepend = false) {
  const isGrouped = !prepend
    && lastMsgAuthor === msg.username
    && lastMsgTime
    && (new Date(msg.created_at) - new Date(lastMsgTime)) < 5 * 60 * 1000;

  const row = document.createElement("div");
  row.className = "msg" + (isGrouped ? " grouped" : "");

  // Avatar
  row.appendChild(makeAvatar(msg.username, msg.avatar));

  // Body
  const body = document.createElement("div");
  body.className = "msg-body";

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  const author = document.createElement("span");
  author.className = "msg-author";
  author.textContent = msg.username;
  const time = document.createElement("span");
  time.className = "msg-time";
  time.textContent = formatTime(msg.created_at);
  meta.append(author, time);
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
    lastMsgTime = msg.created_at;
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
// Render user list
// ============================
function renderUsers(users) {
  onlineCount.textContent = users.length;
  userListEl.innerHTML = "";
  users.forEach((u) => {
    const li = document.createElement("li");
    li.className = "user-item";
    li.appendChild(makeAvatar(u.username, u.avatar, "avatar-placeholder-sm"));
    const name = document.createElement("span");
    name.textContent = u.username + (u.username === me?.username ? " (moi)" : "");
    li.appendChild(name);
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
    li.dataset.room = r.name;
    li.innerHTML = `<span class="room-hash-icon">#</span> ${r.name}`;
    li.addEventListener("click", () => joinRoom(r.name));
    roomListEl.appendChild(li);
  });
}

// ============================
// Typing indicator
// ============================
function updateTypingDisplay() {
  const names = [...typingUsers.keys()];
  if (names.length === 0) {
    typingEl.textContent = "";
  } else if (names.length === 1) {
    typingEl.textContent = `${names[0]} est en train d'écrire...`;
  } else {
    typingEl.textContent = `${names.slice(0, -1).join(", ")} et ${names.at(-1)} écrivent...`;
  }
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
  lastMsgTime = null;
  messages.forEach((m) => appendMessage(m));
  scrollBottom();
});

socket.on("new_message", (msg) => {
  appendMessage(msg);
  scrollBottom();
  // Clear typing for sender
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
    const timer = setTimeout(() => {
      typingUsers.delete(username);
      updateTypingDisplay();
    }, 3000);
    typingUsers.set(username, timer);
  } else {
    typingUsers.delete(username);
  }
  updateTypingDisplay();
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
  msgInput.placeholder = `Message dans #${roomName}...`;
  typingUsers.clear();
  updateTypingDisplay();
  lastMsgAuthor = null;
  lastMsgTime = null;
  renderRooms();
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
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Typing events
msgInput.addEventListener("input", () => {
  socket.emit("typing", true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit("typing", false), 2500);
});

// ============================
// Image upload
// ============================
attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    socket.emit("send_message", { content: e.target.result, type: "image" });
  };
  reader.readAsDataURL(file);
  fileInput.value = "";
});

// ============================
// Lightbox close
// ============================
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) lightbox.style.display = "none";
});

// ============================
// Init
// ============================
async function init() {
  // Fetch current user
  const meRes = await fetch("/api/me");
  if (!meRes.ok) { window.location.href = "/login.html"; return; }
  me = await meRes.json();

  selfName.textContent = me.username;
  if (me.avatar) {
    selfAvatar.src = me.avatar;
    selfAvatar.style.display = "";
  } else {
    selfAvatar.style.display = "none";
  }

  // Fetch rooms
  const roomsRes = await fetch("/api/rooms");
  if (!roomsRes.ok) return;
  rooms = await roomsRes.json();
  renderRooms();

  // Join first room
  if (rooms.length > 0) joinRoom(rooms[0].name);
}

init();
