"use strict";

// --- Tab switching ---
const tabs = document.querySelectorAll(".tab-btn");
const forms = document.querySelectorAll(".auth-form");

tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    forms.forEach((f) => f.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`${btn.dataset.tab}Form`).classList.add("active");
  });
});

// --- Avatar preview ---
let avatarBase64 = null;
const regAvatar = document.getElementById("regAvatar");
const fileLabel = document.getElementById("fileLabel");

regAvatar.addEventListener("change", () => {
  const file = regAvatar.files[0];
  if (!file) return;
  fileLabel.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (e) => { avatarBase64 = e.target.result; };
  reader.readAsDataURL(file);
});

// --- Helpers ---
function setError(id, msg) {
  document.getElementById(id).textContent = msg;
}
function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.textContent = loading ? "Chargement..." : btn.dataset.label;
}

function storeLabel(btn) {
  btn.dataset.label = btn.textContent;
}

// --- Login ---
const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
storeLabel(loginBtn);

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setError("loginError", "");

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!username || !password) {
    return setError("loginError", "Remplis tous les champs.");
  }

  setLoading(loginBtn, true);
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) return setError("loginError", data.error || "Erreur.");
    window.location.href = "/chat.html";
  } catch {
    setError("loginError", "Impossible de joindre le serveur.");
  } finally {
    setLoading(loginBtn, false);
  }
});

// --- Register ---
const registerForm = document.getElementById("registerForm");
const registerBtn = document.getElementById("registerBtn");
storeLabel(registerBtn);

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setError("registerError", "");

  const username = document.getElementById("regUsername").value.trim();
  const password = document.getElementById("regPassword").value;

  if (!username || !password) {
    return setError("registerError", "Remplis tous les champs.");
  }

  setLoading(registerBtn, true);
  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, avatar: avatarBase64 }),
    });
    const data = await res.json();
    if (!res.ok) return setError("registerError", data.error || "Erreur.");
    window.location.href = "/chat.html";
  } catch {
    setError("registerError", "Impossible de joindre le serveur.");
  } finally {
    setLoading(registerBtn, false);
  }
});
