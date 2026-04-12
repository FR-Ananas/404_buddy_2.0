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

const messagesEl           = $("messages");
const roomLoaderEl         = $("roomLoader");
const msgInput             = $("msgInput");
const sendBtn              = $("sendBtn");
const userListEl           = $("userList");
const onlineCount          = $("onlineCount");
const selfName             = $("selfName");
const selfAvatar           = $("selfAvatar");
const themeToggle          = $("themeToggle");
const logoutBtn            = $("logoutBtn");
const typingEl             = $("typingIndicator");
const fileInput            = $("fileInput");
const attachBtn            = $("attachBtn");
const lightbox             = $("lightbox");
const lightboxImg          = $("lightboxImg");
const usersPanel           = $("usersPanel");
const usersPanelToggle     = $("usersPanelToggle");
const usersPanelClose      = $("usersPanelClose");
const panelBackdrop        = $("panelBackdrop");
const roomNameEl           = $("currentRoomName");
const roomDescEl           = $("currentRoomDesc");
const createRoomModal      = $("createRoomModal");
const createRoomBtn        = $("createRoomBtn");
const cancelRoomBtn        = $("cancelRoomBtn");
const newRoomName          = $("newRoomName");
const newRoomDesc          = $("newRoomDesc");
const createRoomError      = $("createRoomError");
const charCounter          = $("charCounter");
const constellationOverlay = $("constellationOverlay");
const constellationToggle  = $("constellationToggle");
const constellationClose   = $("constellationClose");
const constellationAdd     = $("constellationAdd");
const constellationSvg     = $("constellationSvg");
const constellationNodes   = $("constellationNodes");

const CHAR_LIMIT = 250;
const CHAR_WARN  = 50;

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
// Users panel
// ============================
const isMobile = () => window.innerWidth <= 640;

function closeUsersPanel() {
  usersPanel.classList.remove("open");
  panelBackdrop.classList.remove("active");
}

usersPanelToggle.addEventListener("click", () => {
  const open = usersPanel.classList.toggle("open");
  if (isMobile()) panelBackdrop.classList.toggle("active", open);
  setTimeout(scrollBottom, 320);
});
usersPanelClose.addEventListener("click", closeUsersPanel);
panelBackdrop.addEventListener("click", closeUsersPanel);

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
// Render helpers — messages
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
function makeUsernameSpan(username, color, isAdmin) {
  const span = document.createElement("span");
  span.className = "msg-author" + (isAdmin ? " is-admin" : "");
  span.textContent = username;
  if (color) span.style.color = color;
  return span;
}

function appendMessage(msg, prepend = false) {
  const isAdmin   = msg.is_admin === 1;
  const isOwn     = me != null && msg.user_id === me.id;
  const isGrouped = !prepend
    && lastMsgAuthor === msg.username
    && lastMsgTime
    && (new Date(msg.created_at) - new Date(lastMsgTime)) < 5 * 60 * 1000;

  const row = document.createElement("div");
  row.className = "msg" + (isGrouped ? " grouped" : "") + (isOwn ? " own" : "");
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
    img.addEventListener("click", () => { lightboxImg.src = msg.content; lightbox.style.display = "flex"; });
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
    row.classList.add("msg-new");
    row.addEventListener("animationend", () => row.classList.remove("msg-new"), { once: true });
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

function scrollBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }
function showLoader() { roomLoaderEl.style.display = "flex"; messagesEl.style.display = "none"; }
function hideLoader() { roomLoaderEl.style.display = "none"; messagesEl.style.display = "flex"; }

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
// Constellation — helpers
// ============================

// Deterministic pseudo-random from integer seed [0, 1)
function seededRand(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Hash room name to a stable number
function nameHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Compute (x, y) positions for all rooms
function computePositions(roomList, vw, vh) {
  const CX = vw / 2;
  const CY = vh / 2;
  const BASE = Math.min(vw * 0.41, vh * 0.41, 390);

  // 3 rings around center; center = index of protected (or first) room
  const RINGS = [
    { r: BASE * 0.40, max: 6  },
    { r: BASE * 0.73, max: 8  },
    { r: BASE * 1.00, max: 6  },
  ];

  const centerIdx = roomList.findIndex(r => r.protected) !== -1
    ? roomList.findIndex(r => r.protected) : 0;

  const others = roomList
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => i !== centerIdx);

  // Group others into rings
  const grouped = [[], [], []];
  let ri = 0;
  for (const item of others) {
    while (ri < RINGS.length && grouped[ri].length >= RINGS[ri].max) ri++;
    if (ri >= RINGS.length) break;
    grouped[ri].push(item);
  }

  const positions = new Array(roomList.length).fill(null);
  positions[centerIdx] = { x: CX, y: CY, ring: -1 };

  grouped.forEach((group, ringIdx) => {
    const n = group.length;
    const ringR = RINGS[ringIdx].r;
    group.forEach(({ r, i }, pi) => {
      const hash = nameHash(r.name);
      // Base angle: evenly spread, starting from top (-π/2)
      const baseAngle = (pi / n) * 2 * Math.PI - Math.PI / 2;
      // Jitter: up to ±20% of the inter-node angle, seeded by name
      const jitter = (seededRand(hash) - 0.5) * (2 * Math.PI / n) * 0.38;
      // Radius variation: ±15px
      const rJitter = (seededRand(hash + 1) - 0.5) * 30;
      const angle = baseAngle + jitter;
      const rad   = ringR + rJitter;
      positions[i] = {
        x: CX + Math.cos(angle) * rad,
        y: CY + Math.sin(angle) * rad,
        ring: ringIdx,
      };
    });
  });

  return { positions, centerIdx, grouped };
}

// Build connection pairs (index, index)
function computeConnections(positions, centerIdx, grouped) {
  const conns = [];
  const ring0 = grouped[0].map(({ i }) => i);
  const ring1 = grouped[1].map(({ i }) => i);
  const ring2 = grouped[2].map(({ i }) => i);

  // Center → ring 0
  ring0.forEach(i => conns.push([centerIdx, i]));
  // If no ring 0, center → ring 1 directly
  if (ring0.length === 0) ring1.forEach(i => conns.push([centerIdx, i]));

  // Ring 0 → ring 1 (nearest neighbour)
  ring1.forEach(i => {
    const pi = positions[i];
    const parents = ring0.length ? ring0 : [centerIdx];
    let nearest = parents[0], minD = Infinity;
    parents.forEach(j => {
      const d = Math.hypot(pi.x - positions[j].x, pi.y - positions[j].y);
      if (d < minD) { minD = d; nearest = j; }
    });
    conns.push([nearest, i]);
  });

  // Ring 1 → ring 2 (nearest neighbour)
  ring2.forEach(i => {
    const pi = positions[i];
    const parents = ring1.length ? ring1 : (ring0.length ? ring0 : [centerIdx]);
    let nearest = parents[0], minD = Infinity;
    parents.forEach(j => {
      const d = Math.hypot(pi.x - positions[j].x, pi.y - positions[j].y);
      if (d < minD) { minD = d; nearest = j; }
    });
    conns.push([nearest, i]);
  });

  return conns;
}

// ============================
// Constellation — render
// ============================
function renderConstellation() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const { positions, centerIdx, grouped } = computePositions(rooms, vw, vh);
  const connections = computeConnections(positions, centerIdx, grouped);

  // --- SVG: stars + lines ---
  const NS = "http://www.w3.org/2000/svg";
  constellationSvg.innerHTML = "";
  constellationSvg.setAttribute("viewBox", `0 0 ${vw} ${vh}`);

  // Stars (deterministic)
  const STAR_COUNT = 140;
  for (let s = 0; s < STAR_COUNT; s++) {
    const cx = seededRand(s * 3)   * vw;
    const cy = seededRand(s * 7)   * vh;
    const r  = seededRand(s * 11)  < 0.12 ? 1.4 : seededRand(s * 11) < 0.35 ? 0.9 : 0.5;
    const op = 0.15 + seededRand(s * 17) * 0.55;
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", cx.toFixed(1));
    circle.setAttribute("cy", cy.toFixed(1));
    circle.setAttribute("r",  r);
    circle.setAttribute("fill", `rgba(255,255,255,${op.toFixed(2)})`);
    constellationSvg.appendChild(circle);
  }

  // Connection lines
  connections.forEach(([a, b]) => {
    const pa = positions[a], pb = positions[b];
    if (!pa || !pb) return;
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", pa.x.toFixed(1));
    line.setAttribute("y1", pa.y.toFixed(1));
    line.setAttribute("x2", pb.x.toFixed(1));
    line.setAttribute("y2", pb.y.toFixed(1));
    line.setAttribute("stroke", "rgba(139,92,246,0.22)");
    line.setAttribute("stroke-width", "1");
    line.setAttribute("stroke-linecap", "round");
    constellationSvg.appendChild(line);
  });

  // --- HTML nodes ---
  constellationNodes.innerHTML = "";
  const nodeSize = (ring) => ring === -1 ? 68 : ring === 0 ? 54 : ring === 1 ? 48 : 44;

  rooms.forEach((room, idx) => {
    const pos = positions[idx];
    if (!pos) return; // over ring limit

    const isCenter = idx === centerIdx;
    const size = nodeSize(pos.ring);
    const delay = isCenter ? 0 : 0.06 + idx * 0.04;

    const node = document.createElement("div");
    node.className = "c-node" + (isCenter ? " center" : "") + (room.name === currentRoom ? " active" : "");
    node.style.left = pos.x + "px";
    node.style.top  = pos.y + "px";
    node.style.animationDelay = delay + "s";

    const circle = document.createElement("div");
    circle.className = "c-circle";
    circle.style.width  = size + "px";
    circle.style.height = size + "px";

    const icon = document.createElement("span");
    icon.className = "c-icon";
    icon.textContent = "#";
    circle.appendChild(icon);

    // Admin delete button
    if (me?.isAdmin && !room.protected) {
      const delBtn = document.createElement("button");
      delBtn.className = "c-delete";
      delBtn.textContent = "×";
      delBtn.title = `Supprimer #${room.name}`;
      delBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteRoom(room.name); });
      circle.appendChild(delBtn);
    }

    const label = document.createElement("span");
    label.className = "c-label";
    label.textContent = room.name;

    node.appendChild(circle);
    node.appendChild(label);

    node.addEventListener("click", () => {
      joinRoom(room.name);
      closeConstellation();
    });

    constellationNodes.appendChild(node);
  });
}

// ============================
// Constellation — open / close
// ============================
function openConstellation() {
  renderConstellation();
  constellationOverlay.style.display = "";
  constellationOverlay.removeAttribute("aria-hidden");
}

function closeConstellation() {
  constellationOverlay.style.display = "none";
  constellationOverlay.setAttribute("aria-hidden", "true");
}

constellationToggle.addEventListener("click", () => {
  if (constellationOverlay.style.display === "none") openConstellation();
  else closeConstellation();
});
constellationClose.addEventListener("click", closeConstellation);

// Close on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeConstellation();
    closeUsersPanel();
  }
});

// Close on click outside all nodes
constellationOverlay.addEventListener("click", (e) => {
  if (e.target === constellationOverlay || e.target === constellationSvg) closeConstellation();
});

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
    typingUsers.set(username, setTimeout(() => { typingUsers.delete(username); updateTypingDisplay(); }, 3000));
  } else {
    typingUsers.delete(username);
  }
  updateTypingDisplay();
});

socket.on("room_created", (room) => {
  if (!rooms.find((r) => r.name === room.name)) {
    rooms.push(room);
    // Redraw constellation if open
    if (constellationOverlay.style.display !== "none") renderConstellation();
  }
});

socket.on("room_deleted", ({ name }) => {
  rooms = rooms.filter((r) => r.name !== name);
  if (constellationOverlay.style.display !== "none") renderConstellation();
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
  showLoader();
  socket.emit("join_room", roomName);
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
  const remaining = CHAR_LIMIT - msgInput.value.length;
  if (remaining <= CHAR_WARN) {
    charCounter.textContent = remaining;
    charCounter.className = "char-counter" + (remaining <= 10 ? " danger" : " warn");
    charCounter.style.display = "";
  } else {
    charCounter.style.display = "none";
  }
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
// Admin — create room (modal)
// ============================
constellationAdd.addEventListener("click", () => {
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
  closeConstellation();
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
  if (me.isAdmin) {
    selfName.classList.add("is-admin");
    constellationAdd.style.display = "";
  }
  if (me.avatar) { selfAvatar.src = me.avatar; selfAvatar.style.display = ""; }

  const roomsRes = await fetch("/api/rooms");
  if (!roomsRes.ok) return;
  rooms = await roomsRes.json();

  if (rooms.length > 0) joinRoom(rooms[0].name);
}

// ============================
// Keyboard resize (Android + iOS)
// ============================
if (window.visualViewport) {
  const chatPage = document.querySelector(".chat-page");
  let lastHeight = window.visualViewport.height;
  function onViewportChange() {
    const { height, offsetTop } = window.visualViewport;
    chatPage.style.height = height + "px";
    chatPage.style.top    = offsetTop + "px";
    if (height < lastHeight) setTimeout(scrollBottom, 60);
    lastHeight = height;
  }
  window.visualViewport.addEventListener("resize", onViewportChange);
  window.visualViewport.addEventListener("scroll", onViewportChange);
  onViewportChange();
}

msgInput.addEventListener("focus", () => setTimeout(scrollBottom, 300));

init();
