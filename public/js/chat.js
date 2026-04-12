"use strict";

// ============================
// State
// ============================
let me = null;
let rooms = [];
let currentRoom = null;
let typingTimeout = null;
const typingUsers = new Map();
let constellationPositions = []; // positions from last renderConstellation call

const MAX_ROOMS = 30; // max rooms displayed + creatable

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
const constellationScroll  = $("constellationScroll");
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

// Organic placement — seeded Poisson-disc approximation.
// Each room gets a stable position derived from its name hash;
// rooms are placed so nothing overlaps and nothing goes off-canvas.
function computePositions(roomList, vw, vh) {
  const MARGIN   = 72;  // clearance from canvas edge
  const MIN_DIST = 92;  // minimum centre-to-centre distance (px)
  const TRIES    = 240; // candidate attempts per room

  const CX = vw / 2, CY = vh / 2;

  const centerIdx = roomList.findIndex(r => r.protected) !== -1
    ? roomList.findIndex(r => r.protected) : 0;

  const positions = new Array(roomList.length).fill(null);
  positions[centerIdx] = { x: CX, y: CY, ring: -1 };

  // Cap at MAX_ROOMS (including center)
  const others = roomList
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => i !== centerIdx)
    .slice(0, MAX_ROOMS - 1);

  for (const { r, i } of others) {
    const h = nameHash(r.name);
    let bestX = CX, bestY = CY, bestMinDist = -Infinity;

    for (let t = 0; t < TRIES; t++) {
      const x = MARGIN + seededRand(h * 3 + t * 7 + 1) * (vw - 2 * MARGIN);
      const y = MARGIN + seededRand(h * 5 + t * 11 + 3) * (vh - 2 * MARGIN);

      let minD = Infinity;
      for (let j = 0; j < roomList.length; j++) {
        if (!positions[j]) continue;
        minD = Math.min(minD, Math.hypot(x - positions[j].x, y - positions[j].y));
      }

      if (minD >= MIN_DIST) { bestX = x; bestY = y; break; } // valid — use it
      if (minD > bestMinDist) { bestMinDist = minD; bestX = x; bestY = y; }
    }

    positions[i] = { x: bestX, y: bestY, ring: 0 };
  }

  return { positions, centerIdx };
}

// Minimum spanning tree (Prim) from center + one extra edge per node toward
// its closest non-MST neighbour within 230 px, for a denser organic graph.
function computeConnections(positions, centerIdx) {
  const valid = positions.map((p, i) => p ? i : null).filter(i => i !== null);
  if (valid.length <= 1) return [];

  const inTree = new Set([centerIdx]);
  const rest   = new Set(valid.filter(i => i !== centerIdx));
  const conns  = [];

  while (rest.size > 0) {
    let bDist = Infinity, bFrom = -1, bTo = -1;
    for (const to of rest) {
      const pt = positions[to];
      for (const from of inTree) {
        const d = Math.hypot(pt.x - positions[from].x, pt.y - positions[from].y);
        if (d < bDist) { bDist = d; bFrom = from; bTo = to; }
      }
    }
    if (bTo === -1) break;
    conns.push([bFrom, bTo]);
    inTree.add(bTo);
    rest.delete(bTo);
  }

  // Extra edges: nearest non-MST neighbour within 230 px
  for (const i of valid) {
    const pi = positions[i];
    let nearIdx = -1, nearDist = 230;
    for (const j of valid) {
      if (j === i) continue;
      if (conns.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) continue;
      const d = Math.hypot(pi.x - positions[j].x, pi.y - positions[j].y);
      if (d < nearDist) { nearDist = d; nearIdx = j; }
    }
    if (nearIdx >= 0) conns.push([i, nearIdx]);
  }

  return conns;
}

// ============================
// Constellation — button visibility
// ============================
function updateConstellationAddButton() {
  if (!me?.isAdmin) return;
  constellationAdd.style.display = rooms.length >= MAX_ROOMS ? "none" : "";
}

// ============================
// Constellation — burst & shard effects
// ============================
const SHARD_SHAPES = [
  "polygon(50% 0%, 15% 100%, 100% 70%)",
  "polygon(0% 30%, 100% 0%, 85% 100%)",
  "polygon(20% 0%, 100% 40%, 60% 100%)",
  "polygon(50% 0%, 100% 90%, 0% 100%)",
  "polygon(0% 0%, 80% 10%, 100% 100%, 20% 90%)",
  "polygon(10% 0%, 100% 20%, 90% 100%, 0% 80%)",
  "polygon(40% 0%, 100% 60%, 50% 100%, 0% 40%)",
];

function addShatterEffect(x, y) {
  const COUNT = 14;
  for (let i = 0; i < COUNT; i++) {
    const angle = (i / COUNT) * Math.PI * 2 + seededRand(i * 41 + 17) * 0.7;
    const dist  = 32 + seededRand(i * 23 + 9)  * 65;
    const tx    = Math.cos(angle) * dist;
    const ty    = Math.sin(angle) * dist;
    const ox    = (seededRand(i * 19 + 3) - 0.5) * 16;
    const oy    = (seededRand(i * 29 + 7) - 0.5) * 16;
    const rot   = seededRand(i * 13 + 11) * 360;
    const spin  = (seededRand(i * 7  + 2) - 0.5) * 720;
    const w     = 5  + seededRand(i * 17 + 5) * 11;
    const h     = 9  + seededRand(i * 31 + 1) * 16;
    const shape = SHARD_SHAPES[i % SHARD_SHAPES.length];
    const dur   = 0.42 + seededRand(i * 11 + 13) * 0.38;
    const delay = seededRand(i * 37 + 19) * 0.09;

    const shard = document.createElement("div");
    shard.className = "c-shard";
    shard.style.cssText = `
      left:${x}px; top:${y}px;
      width:${w.toFixed(1)}px; height:${h.toFixed(1)}px;
      clip-path:${shape};
      --ox:${ox.toFixed(1)}px; --oy:${oy.toFixed(1)}px;
      --tx:${tx.toFixed(1)}px; --ty:${ty.toFixed(1)}px;
      --rot:${rot.toFixed(0)}deg; --spin:${spin.toFixed(0)}deg;
      animation-duration:${dur.toFixed(2)}s;
      animation-delay:${delay.toFixed(2)}s;
    `;
    constellationNodes.appendChild(shard);
    shard.addEventListener("animationend", () => shard.remove(), { once: true });
  }
}
function addBurstEffect(x, y, type) {
  const isDeath  = type === "death";
  const ringCount = isDeath ? 3 : 4;

  // Central flash
  const flash = document.createElement("div");
  flash.className = "c-burst-flash" + (isDeath ? " death" : "");
  flash.style.left = x + "px";
  flash.style.top  = y + "px";
  constellationNodes.appendChild(flash);
  flash.addEventListener("animationend", () => flash.remove(), { once: true });

  // Expanding rings
  for (let i = 0; i < ringCount; i++) {
    const ring = document.createElement("div");
    ring.className = "c-burst-ring" + (isDeath ? " death" : "");
    ring.style.left = x + "px";
    ring.style.top  = y + "px";
    ring.style.animationDelay = (i * (isDeath ? 0.08 : 0.11)) + "s";
    constellationNodes.appendChild(ring);
    ring.addEventListener("animationend", () => ring.remove(), { once: true });
  }

  // Birth only: deterministic sparks shooting outward
  if (!isDeath) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + seededRand(i * 31 + 7) * 0.5;
      const dist  = 38 + seededRand(i * 19 + 5) * 28;
      const spark = document.createElement("div");
      spark.className = "c-burst-spark";
      spark.style.left = x + "px";
      spark.style.top  = y + "px";
      spark.style.setProperty("--dx", (Math.cos(angle) * dist).toFixed(1) + "px");
      spark.style.setProperty("--dy", (Math.sin(angle) * dist).toFixed(1) + "px");
      spark.style.animationDelay = (0.05 + seededRand(i * 7 + 11) * 0.12) + "s";
      constellationNodes.appendChild(spark);
      spark.addEventListener("animationend", () => spark.remove(), { once: true });
    }
  }
}

// ============================
// Constellation — render
// opts.birthRoom : room name that gets the nova animation
// opts.instant   : all nodes appear without animation (after deletion)
// ============================
function renderConstellation(opts = {}) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // On mobile, render onto a larger virtual canvas so rings have room to breathe.
  // The scroll container lets the user pan to explore — like a real galaxy map.
  const MOBILE = vw < 768;
  const CVW = MOBILE ? Math.max(vw, 1000) : vw;
  const CVH = MOBILE ? Math.max(vh, 1000) : vh;

  // Size the SVG and nodes container to the virtual canvas
  constellationSvg.style.width    = CVW + "px";
  constellationSvg.style.height   = CVH + "px";
  constellationNodes.style.width  = CVW + "px";
  constellationNodes.style.height = CVH + "px";

  const { positions, centerIdx } = computePositions(rooms, CVW, CVH);
  constellationPositions = positions; // save for burst effects
  const connections = computeConnections(positions, centerIdx);

  // --- SVG: stars + lines ---
  const NS = "http://www.w3.org/2000/svg";
  constellationSvg.innerHTML = "";
  constellationSvg.setAttribute("viewBox", `0 0 ${CVW} ${CVH}`);

  // Stars — scale count proportionally to the virtual canvas area
  const STAR_COUNT = Math.min(Math.round(140 * (CVW * CVH) / (vw * vh)), 300);
  for (let s = 0; s < STAR_COUNT; s++) {
    const cx = seededRand(s * 3)   * CVW;
    const cy = seededRand(s * 7)   * CVH;
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
  // Center is large; others vary organically by name (44–60 px)
  const nodeSize = (room, isCenter) =>
    isCenter ? 68 : 44 + Math.round(seededRand(nameHash(room.name) * 7 + 3) * 16);

  rooms.forEach((room, idx) => {
    const pos = positions[idx];
    if (!pos) return;

    const isCenter  = idx === centerIdx;
    const isBirth   = room.name === opts.birthRoom;
    const size      = nodeSize(room, isCenter);
    const delay     = isCenter ? 0 : 0.06 + idx * 0.04;

    const node = document.createElement("div");
    node.className = "c-node"
      + (isCenter ? " center" : "")
      + (room.name === currentRoom ? " active" : "")
      + (isBirth ? " born" : "");
    node.dataset.room = room.name; // used by death animation lookup
    node.style.left = pos.x + "px";
    node.style.top  = pos.y + "px";

    if (opts.instant) {
      node.style.animation = "none";           // snap into place — no fly-in
    } else if (isBirth) {
      node.style.animationDelay = "0.2s";      // burst fires first, then node materialises
    } else if (opts.birthRoom) {
      node.style.animation = "none";           // don't re-animate existing nodes
    } else {
      node.style.animationDelay = delay + "s";
    }

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

  // Birth burst fires after nodes are in the DOM (so it layers above them)
  if (opts.birthRoom) {
    const bi = rooms.findIndex(r => r.name === opts.birthRoom);
    if (bi >= 0 && positions[bi]) addBurstEffect(positions[bi].x, positions[bi].y, "birth");
  }

  // On mobile: scroll to center the central node.
  // Skip on birthRoom renders so the user's pan position isn't disrupted.
  if (MOBILE && !opts.birthRoom) {
    const cp = positions[centerIdx];
    requestAnimationFrame(() => {
      constellationScroll.scrollLeft = Math.max(0, cp.x - vw / 2);
      constellationScroll.scrollTop  = Math.max(0, cp.y - vh / 2);
    });
  }
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

// Close on click of empty space (desktop only — on mobile the ✕ button and
// Escape handle it, to avoid accidental closes while panning)
constellationScroll.addEventListener("click", (e) => {
  if (e.target === constellationScroll && window.innerWidth >= 768) closeConstellation();
});

// Re-render on resize / orientation change
window.addEventListener("resize", () => {
  if (constellationOverlay.style.display !== "none") renderConstellation();
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
    updateConstellationAddButton();
    if (constellationOverlay.style.display !== "none") {
      renderConstellation({ birthRoom: room.name });
    }
  }
});

socket.on("room_deleted", ({ name }) => {
  if (constellationOverlay.style.display !== "none") {
    const dyingNode = constellationNodes.querySelector(`[data-room="${CSS.escape(name)}"]`);
    if (dyingNode) {
      const ri = rooms.findIndex(r => r.name === name);
      if (ri >= 0 && constellationPositions[ri]) {
        const { x, y } = constellationPositions[ri];
        addShatterEffect(x, y);          // shard explosion
        addBurstEffect(x, y, "death");   // secondary shockwave rings
      }
      dyingNode.classList.add("dying");
      setTimeout(() => {
        rooms = rooms.filter(r => r.name !== name);
        updateConstellationAddButton();
        renderConstellation({ instant: true });
        if (currentRoom === name && rooms.length > 0) {
          currentRoom = null;
          joinRoom(rooms[0].name);
        }
      }, 620);
      return;
    }
  }
  // Constellation closed — update silently
  rooms = rooms.filter(r => r.name !== name);
  updateConstellationAddButton();
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
  // Don't auto-join or close — admin stays in the constellation and
  // watches the new star being born via the room_created socket event.
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

  const roomsRes = await fetch("/api/rooms");
  if (!roomsRes.ok) return;
  rooms = await roomsRes.json();

  updateConstellationAddButton(); // show/hide based on room count + admin status

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
