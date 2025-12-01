// ====== IMPORTS ======
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ====== SIMPLE DATABASE (data.json) ======
let db = {
  users: [],
  servers: [],
  verifiedUsers: [],
  adminUsers: [],
};

function loadDb() {
  if (fs.existsSync("data.json")) {
    try {
      const raw = fs.readFileSync("data.json", "utf8") || "{}";
      const parsed = JSON.parse(raw);

      db.users = Array.isArray(parsed.users) ? parsed.users : [];
      db.servers = Array.isArray(parsed.servers) ? parsed.servers : [];
      db.verifiedUsers = Array.isArray(parsed.verifiedUsers)
        ? parsed.verifiedUsers
        : [];
      db.adminUsers = Array.isArray(parsed.adminUsers)
        ? parsed.adminUsers
        : [];
    } catch (e) {
      console.log("data.json broken, resetting:", e.message);
      db = { users: [], servers: [], verifiedUsers: [], adminUsers: [] };
      saveDb();
    }
  } else {
    saveDb();
  }

  // Ensure arrays exist
  if (!db.verifiedUsers) db.verifiedUsers = [];
  if (!db.adminUsers) db.adminUsers = [];

  // Make sure Kayden and Test are verified + admin
  if (!db.verifiedUsers.includes("Kayden")) db.verifiedUsers.push("Kayden");
  if (!db.verifiedUsers.includes("Test")) db.verifiedUsers.push("Test");

  if (!db.adminUsers.includes("Kayden")) db.adminUsers.push("Kayden");
  if (!db.adminUsers.includes("Test")) db.adminUsers.push("Test");
}

function saveDb() {
  fs.writeFileSync("data.json", JSON.stringify(db, null, 2));
}

loadDb();

// ===== HELPER FUNCTIONS =====
function isVerified(username) {
  return (db.verifiedUsers || []).includes(username);
}

function isAdmin(user) {
  if (!user) return false;
  return (db.adminUsers || []).includes(user.username);
}

// ====== MIDDLEWARE ======
app.use(bodyParser.urlencoded({ extended: false }));
app.use(
  session({
    secret: "change-this-secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.use((req, res, next) => {
  if (req.session.userId) {
    req.user = db.users.find((u) => u.id === req.session.userId) || null;
  } else {
    req.user = null;
  }
  next();
});

// ====== UI RENDER FUNCTION ======
function renderPage({ user, title = "MiniDisboard", contentHtml, toastMessage }) {
  const theme = user?.theme || "dark";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>

.card-buttons {
  position: absolute;
  top: 6px;
  right: 8px;
  display: flex;
  gap: 6px;
}

  .verified {
    font-size: 12px;
    margin-left: 4px;
    color: #5ee7ff;
    font-weight: bold;
  }
  body.theme-light .verified {
    color: #0ea5e9;
  }
  body.theme-neon .verified {
    color: #67e8f9;
    text-shadow: 0 0 6px #67e8f9aa;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --accent1:#5865f2;
    --accent2:#9b5cff;
    --muted:#9ca3af;
    --danger:#dc2626;
    --dangerText:#fef2f2;
  }

  body {
    font-family: system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    height:100vh;
    overflow:hidden;
  }

  body.theme-dark {
    background:#18191c;
    color:#f9fafb;
  }
  body.theme-light {
    background:#f4f5fb;
    color:#111827;
  }
  body.theme-neon {
    background:radial-gradient(circle at top,#2f355e,#050816 60%);
    color:#e5e7eb;
  }

  a { color:inherit; text-decoration:none; }

  .app-shell { display:flex; height:100vh; }

  /* SIDEBAR */
  .sidebar {
    width:230px;
    padding:18px 16px;
    display:flex;
    flex-direction:column;
    justify-content:space-between;
    border-right:1px solid rgba(15,23,42,0.6);
  }
  .sidebar.theme-dark { background:#1f2125; }
  .sidebar.theme-light { background:#ffffff; border-right-color:#e5e7eb; }
  .sidebar.theme-neon { background:rgba(10,16,35,0.96); border-right-color:rgba(148,163,184,0.3); }

  .logo {
    font-weight:800;
    font-size:18px;
    letter-spacing:.12em;
    text-transform:uppercase;
    margin-bottom:6px;
  }
  .logo span { color:#9b5cff; }
  .tagline {
    font-size:11px;
    color:var(--muted);
    margin-bottom:18px;
  }

  .section-label {
    font-size:10px;
    letter-spacing:.16em;
    text-transform:uppercase;
    color:var(--muted);
    margin:12px 0 6px;
  }

  .nav-link {
    display:block;
    padding:8px 10px;
    border-radius:10px;
    font-size:14px;
    margin-bottom:4px;
    transition:.18s;
    border:1px solid transparent;
  }
  .nav-link:hover {
    background:rgba(148,163,184,0.14);
  }
  .nav-link.active {
    background:rgba(132,88,255,0.16);
    border-color:rgba(132,88,255,0.6);
    color:#e5e7ff;
  }

  .user-box {
    margin-top:20px;
    padding-top:10px;
    border-top:1px solid rgba(55,65,81,0.6);
    display:flex;
    gap:8px;
    align-items:center;
  }
  .user-avatar {
    width:32px;
    height:32px;
    border-radius:999px;
    background:linear-gradient(135deg,#5865f2,#9b5cff);
    display:flex;
    align-items:center;
    justify-content:center;
    color:#fff;
    font-weight:700;
    font-size:15px;
  }
  .user-info { font-size:12px; }
  .user-info .name { font-weight:600; }
  .user-info .discord { font-size:11px; color:var(--muted); }
  .user-info .logout {
    font-size:11px;
    color:#f97373;
    margin-top:2px;
    display:inline-block;
  }

  .content {
    flex:1;
    padding:20px 24px;
    overflow-y:auto;
  }

  .page-header h1 {
    font-size:20px;
    margin-bottom:4px;
  }
  .page-header p {
    font-size:13px;
    color:var(--muted);
    margin-bottom:10px;
  }

  .card {
    background:rgba(31,31,37,0.96);
    border-radius:12px;
    padding:16px;
    margin-bottom:16px;
    border:1px solid rgba(55,65,81,0.9);
  }
  body.theme-light .card {
    background:#ffffff;
    border-color:#e5e7eb;
  }
  body.theme-neon .card {
    background:rgba(15,23,42,0.98);
    border-color:rgba(56,189,248,0.4);
  }

  label {
    display:block;
    font-size:12px;
    margin:8px 0 2px;
    color:var(--muted);
  }
  input, textarea {
    width:100%;
    padding:8px 9px;
    border-radius:9px;
    border:1px solid #374151;
    background:#111827;
    color:#f9fafb;
    font-size:13px;
    outline:none;
    margin-bottom:4px;
  }
  body.theme-light input,
  body.theme-light textarea {
    background:#f9fafb;
    color:#111827;
    border-color:#d1d5db;
  }
  textarea { resize:vertical; min-height:60px; }

  button {
    background:linear-gradient(90deg,var(--accent1),var(--accent2));
    border:none;
    padding:9px 16px;
    border-radius:999px;
    font-size:13px;
    font-weight:600;
    color:#fff;
    cursor:pointer;
    margin-top:8px;
  }

  .small-text {
    font-size:11px;
    color:var(--muted);
    margin-top:4px;
  }

  .field-row {
    display:flex;
    align-items:center;
    gap:6px;
    margin-top:4px;
  }
  .field-row input[type="radio"] {
    width:auto;
  }

  .search-row {
    display:flex;
    gap:8px;
    flex-wrap:wrap;
    margin-bottom:8px;
  }
  .search-row input {
    flex:1;
    min-width:140px;
  }
  .count-text {
    font-size:12px;
    color:var(--muted);
    margin-bottom:4px;
  }

  .server-grid {
    display:grid;
    grid-template-columns:repeat(auto-fit,minmax(250px,1fr));
    gap:12px;
  }
  .server-card {
    background:rgba(24,25,32,0.96);
    border-radius:12px;
    padding:10px 12px;
    border:1px solid rgba(55,65,81,0.9);
    position:relative;
  }
  .server-card.pinned {
    border-color:#facc15;
    box-shadow:0 0 12px rgba(250,204,21,0.3);
  }
  body.theme-light .server-card {
    background:#ffffff;
    border-color:#e5e7eb;
  }
  body.theme-neon .server-card {
    background:rgba(15,23,42,0.98);
    border-color:rgba(56,189,248,0.4);
  }

  .server-name { font-size:15px; font-weight:600; }
  .server-owner { font-size:11px; color:var(--muted); margin-bottom:4px; }
  .server-desc { font-size:13px; margin-top:3px; }
  .server-tags { font-size:11px; color:var(--muted); margin-top:4px; }
  .join-link { margin-top:6px; text-align:right; font-size:12px; }
  .join-link a { color:#22c55e; }

  .delete-btn {
    position:absolute;
    top:6px;
    right:8px;
    background:none;
    border:none;
    color:#f97373;
    font-size:11px;
    cursor:pointer;
  }

  .pin-btn {
    position:absolute;
    top:6px;
    left:8px;
    background:none;
    border:none;
    color:#facc15;
    font-size:11px;
    cursor:pointer;
  }

  /* TOASTS */
  #toast-container {
    position:fixed;
    top:16px;
    right:18px;
    z-index:9999;
  }
  .toast {
    padding:10px 14px;
    margin-bottom:8px;
    border-radius:10px;
    font-size:13px;
    color:var(--dangerText);
    background:var(--danger);
    box-shadow:0 10px 30px rgba(0,0,0,0.5);
    animation:slideIn .25s ease-out, fadeOut .35s ease-in forwards;
    animation-delay:0s, 2.2s;
  }
  @keyframes slideIn {
    from { transform:translateX(110%); opacity:0; }
    to   { transform:translateX(0); opacity:1; }
  }
  @keyframes fadeOut {
    to { transform:translateX(110%); opacity:0; }
  }

  /* DISCORD MODAL */
  .modal-backdrop {
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.6);
    display:none;
    align-items:center;
    justify-content:center;
    z-index:9998;
  }
  .modal {
    background:#1f2125;
    border-radius:14px;
    padding:16px 18px;
    width:320px;
    border:1px solid rgba(99,102,241,0.7);
  }
  body.theme-light .modal {
    background:#ffffff;
    color:#111827;
    border-color:#e5e7eb;
  }
  body.theme-neon .modal {
    background:rgba(15,23,42,0.98);
    border-color:rgba(99,102,241,0.8);
  }
  .modal-title { font-size:16px; font-weight:600; margin-bottom:6px; }
  .modal-close {
    float:right;
    font-size:16px;
    cursor:pointer;
    color:var(--muted);
  }
  </style>

  <script>
    const initialToast = ${toastMessage ? JSON.stringify(toastMessage) : "null"};

    function showToast(message) {
      const c = document.getElementById("toast-container");
      if (!c) return;
      const d = document.createElement("div");
      d.className = "toast";
      d.textContent = message;
      c.appendChild(d);
      setTimeout(() => d.remove(), 2500);
    }

    function validateInvite(form) {
      const invite = form.invite.value.trim();
      const regex = /^(https?:\\/\\/)?(www\\.)?(discord\\.gg\\/|discord\\.com\\/invite\\/)[A-Za-z0-9]+$/;
      if (!regex.test(invite)) {
        showToast("You must enter a valid Discord invite link.");
        return false;
      }
      return true;
    }

    function confirmDelete(id) {
      if (confirm("Delete this server?")) {
        const f = document.createElement("form");
        f.method = "POST";
        f.action = "/delete-server";
        const inp = document.createElement("input");
        inp.type = "hidden";
        inp.name = "id";
        inp.value = id;
        f.appendChild(inp);
        document.body.appendChild(f);
        f.submit();
      }
      return false;
    }

    function openDiscordModal() {
      const m = document.getElementById("discord-modal-backdrop");
      if (m) m.style.display = "flex";
    }
    function closeDiscordModal() {
      const m = document.getElementById("discord-modal-backdrop");
      if (m) m.style.display = "none";
    }

    window.addEventListener("DOMContentLoaded", () => {
      if (initialToast) showToast(initialToast);
    });
  </script>
</head>
<body class="theme-${theme}">
  <div id="toast-container"></div>

  <div class="app-shell">
    <aside class="sidebar theme-${theme}">
      <div>
        <div class="logo">MINI<span>DISBOARD</span></div>
        <div class="tagline">List and discover Discord servers.</div>

        <div class="section-label">Navigation</div>
        <a href="/" class="nav-link ${title === "Servers" ? "active" : ""}">Servers</a>
        <a href="/settings" class="nav-link ${title === "Settings" ? "active" : ""}">Settings</a>
        ${
          user && isAdmin(user)
            ? `<a href="/admin" class="nav-link ${title === "Admin" ? "active" : ""}">Admin</a>`
            : ""
        }

        <div class="section-label" style="margin-top:18px;">Downloads</div>
        <div class="nav-link">Desktop App (coming soon)</div>
      </div>

      <div class="user-box">
        ${
          user
            ? `
        <div class="user-avatar">${(user.username || "?")
          .charAt(0)
          .toUpperCase()}</div>
        <div class="user-info">
          <div class="name">
            @${user.username}
            ${isVerified(user.username) ? '<span class="verified">✔</span>' : ""}
          </div>
          <div class="discord">${user.discordTag || "Discord not set"}</div>
          <a href="/logout" class="logout">Log out</a>
        </div>
        `
            : `
        <div class="user-info">
          <div class="name">Not logged in</div>
          <div class="discord">Use forms on Settings</div>
        </div>
        `
        }
      </div>
    </aside>

    <main class="content">
      ${contentHtml}
    </main>
  </div>

  <!-- Discord connect modal -->
  <div id="discord-modal-backdrop" class="modal-backdrop">
    <div class="modal">
      <div class="modal-close" onclick="closeDiscordModal()">×</div>
      <div class="modal-title">Connect Discord</div>
      <p class="small-text">Enter your Discord username (e.g. name#1234 or @user). This does not log into Discord, it just shows on your profile.</p>
      <form method="POST" action="/settings/discord">
        <label>Your Discord tag</label>
        <input name="discordTag" placeholder="name#1234 or @user" required>
        <button type="submit">Save Discord</button>
      </form>
    </div>
  </div>
</body>
</html>`;
}

// ====== ROUTES ======

// HOME: server list + add form + search/filter
app.get("/", (req, res) => {
  const user = req.user;
  const q = (req.query.q || "").toLowerCase();
  const tag = (req.query.tag || "").toLowerCase();

  // Copy servers so we can sort without mutating
  let servers = [...db.servers];

  if (q) {
    servers = servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.tags || "").toLowerCase().includes(q)
    );
  }
  if (tag) {
    servers = servers.filter((s) => (s.tags || "").toLowerCase().includes(tag));
  }

  // Sort pinned servers first
  servers.sort((a, b) => (b.pinned === true) - (a.pinned === true));

  const countText = `Showing ${servers.length} server${
    servers.length === 1 ? "" : "s"
  }${q || tag ? " (filtered)" : ""}.`;

  let addForm = "";
  if (user) {
    addForm = `
      <div class="card">
        <div class="page-header">
          <h1>Add your server</h1>
          <p>Paste your real Discord invite link.</p>
        </div>
        <form method="POST" action="/add-server" onsubmit="return validateInvite(this)">
          <label>Server name</label>
          <input name="name" required>

          <label>Invite link</label>
          <input name="invite" placeholder="https://discord.gg/..." required>

          <label>Description</label>
          <textarea name="description" required></textarea>

          <label>Tags (optional)</label>
          <input name="tags" placeholder="gaming, chill, meme">

          <label>Server image URL (optional)</label>
          <input name="imageUrl" placeholder="https://example.com/image.png">

          <button type="submit">List server</button>
        </form>
      </div>
    `;
  } else {
    addForm = `
      <div class="card">
        <div class="page-header">
          <h1>Public Discord servers</h1>
          <p>Log in from Settings to add your own server.</p>
        </div>
      </div>
    `;
  }

  const searchBar = `
    <div class="card">
      <div class="page-header">
        <h1>Browse servers</h1>
        <p>Search and filter community servers.</p>
      </div>
      <form method="GET" action="/">
        <div class="search-row">
          <input name="q" placeholder="Search by name, description, tag..." value="${q.replace(
            /"/g,
            "&quot;"
          )}">
          <input name="tag" placeholder="Filter by tag (e.g. gaming)" value="${tag.replace(
            /"/g,
            "&quot;"
          )}">
          <button type="submit">Search</button>
        </div>
      </form>
      <div class="count-text">${countText}</div>
    </div>
  `;

  let serverList;
  if (servers.length === 0) {
    serverList = `<p class="small-text">No servers match your search yet.</p>`;
  } else {
    serverList =
      '<div class="server-grid">' +
      servers
servers
  .map((s) => {
    const mine = user && s.ownerId === user.id;

    return `
      <div class="server-card ${s.pinned ? "pinned" : ""}">
        ${
          mine
            ? `<button class="delete-btn" onclick="return confirmDelete('${s.id}')">Delete</button>`
            : ""
        }

        <div class="server-name">${s.name}</div>

        <div class="server-owner">
          by ${s.ownerName}
          ${isVerified(s.ownerName) ? '<span class="verified">✔</span>' : ""}
        </div>

        <div class="server-desc">${s.description}</div>
        ${s.tags ? `<div class="server-tags">Tags: ${s.tags}</div>` : ""}
        <div class="join-link"><a href="${s.invite}" target="_blank">Join server →</a></div>
      </div>
    `;
  })
  .join("")
  }

  const html = renderPage({
    user,
    title: "Servers",
    contentHtml: addForm + searchBar + serverList,
    toastMessage: req.query.toast || null,
  });
  res.send(html);
});

// ADD SERVER
app.post("/add-server", (req, res) => {
  if (!req.user) return res.redirect("/settings?toast=Login%20first");
  const { name, invite, description, tags, imageUrl } = req.body;
  if (!name || !invite || !description) {
    return res.redirect("/?toast=Missing%20fields");
  }

  db.servers.push({
    id: "s_" + Date.now(),
    ownerId: req.user.id,
    ownerName: req.user.username,
    name,
    invite,
    description,
    tags,
    imageUrl,
    pinned: false,
  });
  saveDb();
  res.redirect("/?toast=Server%20added");
});

// DELETE SERVER (only owner)
app.post("/delete-server", (req, res) => {
  if (!req.user) return res.redirect("/settings?toast=Login%20first");
  const { id } = req.body;
  const before = db.servers.length;
  db.servers = db.servers.filter(
    (s) => !(s.id === id && s.ownerId === req.user.id)
  );
  saveDb();
  const deleted = db.servers.length !== before;
  res.redirect(
    "/?toast=" +
      encodeURIComponent(deleted ? "Server deleted" : "Unable to delete server")
  );
});

// ===== ADMIN PAGE =====
app.get("/admin", (req, res) => {
  if (!req.user || !isAdmin(req.user)) {
    return res.status(403).send("Forbidden");
  }

  const verifiedList = (db.verifiedUsers || [])
    .map(
      (u) =>
        `<li>${u} <a href="/admin/unverify?u=${encodeURIComponent(
          u
        )}">❌</a></li>`
    )
    .join("");

  const adminList = (db.adminUsers || [])
    .map(
      (u) =>
        `<li>${u} ${
          u === "Kayden"
            ? "<span class='small-text'>(owner)</span>"
            : `<a href="/admin/remove-admin?u=${encodeURIComponent(
                u
              )}">❌</a>`
        }</li>`
    )
    .join("");

  const content = `
    <div class="page-header">
      <h1>Admin Panel</h1>
      <p>Only admins can view this page.</p>
    </div>

    <div class="card">
      <h2>Verify a user</h2>
      <form method="POST" action="/admin/verify">
        <label>Username (exact)</label>
        <input name="username" required placeholder="e.g. Kayden">
        <button type="submit">Verify user</button>
      </form>
    </div>

    <div class="card">
      <h2>Verified users</h2>
      <ul style="margin-left:20px; line-height:1.6;">
        ${verifiedList || "<i>No verified users yet.</i>"}
      </ul>
    </div>

    <div class="card">
      <h2>Admins</h2>
      <form method="POST" action="/admin/add-admin">
        <label>Username (exact)</label>
        <input name="username" required placeholder="e.g. Test">
        <button type="submit">Add admin</button>
      </form>
      <ul style="margin-left:20px; line-height:1.6; margin-top:8px;">
        ${adminList || "<i>No admins yet.</i>"}
      </ul>
    </div>
  `;

  const html = renderPage({
    user: req.user,
    title: "Admin",
    contentHtml: content,
    toastMessage: req.query.toast || null,
  });
  res.send(html);
});

// VERIFY USER
app.post("/admin/verify", (req, res) => {
  if (!req.user || !isAdmin(req.user)) {
    return res.status(403).send("Forbidden");
  }

  const u = (req.body.username || "").trim();
  if (!u) return res.redirect("/admin?toast=Missing%20username");

  if (!db.verifiedUsers.includes(u)) {
    db.verifiedUsers.push(u);
    saveDb();
    return res.redirect("/admin?toast=Verified%20" + encodeURIComponent(u));
  }

  res.redirect("/admin?toast=Already%20verified");
});

// UNVERIFY USER
app.get("/admin/unverify", (req, res) => {
  if (!req.user || !isAdmin(req.user)) {
    return res.status(403).send("Forbidden");
  }

  const u = req.query.u;
  db.verifiedUsers = (db.verifiedUsers || []).filter((x) => x !== u);
  saveDb();

  res.redirect("/admin?toast=Removed%20" + encodeURIComponent(u));
});

// ADD ADMIN
app.post("/admin/add-admin", (req, res) => {
  if (!req.user || !isAdmin(req.user)) {
    return res.status(403).send("Forbidden");
  }

  const u = (req.body.username || "").trim();
  if (!u) return res.redirect("/admin?toast=Missing%20username");

  if (!db.adminUsers.includes(u)) {
    db.adminUsers.push(u);
    saveDb();
    return res.redirect(
      "/admin?toast=Made%20admin:%20" + encodeURIComponent(u)
    );
  }

  res.redirect("/admin?toast=Already%20admin");
});

// REMOVE ADMIN (cannot remove Kayden)
app.get("/admin/remove-admin", (req, res) => {
  if (!req.user || !isAdmin(req.user)) {
    return res.status(403).send("Forbidden");
  }

  const u = req.query.u;
  if (u === "Kayden") {
    return res.redirect("/admin?toast=Cannot%20remove%20owner");
  }

  db.adminUsers = (db.adminUsers || []).filter((x) => x !== u);
  saveDb();

  res.redirect(
    "/admin?toast=Removed%20admin:%20" + encodeURIComponent(u)
  );
});

// SETTINGS PAGE
app.get("/settings", (req, res) => {
  const user = req.user;
  let content = `
    <div class="page-header">
      <h1>Settings</h1>
      <p>Account, theme and Discord tag.</p>
    </div>
  `;

  if (user) {
    content += `
      <div class="card">
        <h2>Theme</h2>
        <form method="POST" action="/settings/theme">
          <div class="field-row">
            <input type="radio" id="theme-dark" name="theme" value="dark" ${
              user.theme === "dark" ? "checked" : ""
            }>
            <label for="theme-dark">Dark</label>
          </div>
          <div class="field-row">
            <input type="radio" id="theme-light" name="theme" value="light" ${
              user.theme === "light" ? "checked" : ""
            }>
            <label for="theme-light">Light</label>
          </div>
          <div class="field-row">
            <input type="radio" id="theme-neon" name="theme" value="neon" ${
              user.theme === "neon" ? "checked" : ""
            }>
            <label for="theme-neon">Neon</label>
          </div>
          <button type="submit">Save theme</button>
        </form>
      </div>

      <div class="card">
        <h2>Discord account</h2>
        <p class="small-text">
          Current: ${user.discordTag || "Not set"}.
        </p>
        <button type="button" onclick="openDiscordModal()">Connect Discord</button>
      </div>
    `;
  }

  if (!user) {
    content += `
      <div class="card">
        <h2>Register</h2>
        <form method="POST" action="/register">
          <label>Username</label>
          <input name="username" required>
          <label>Password</label>
          <input name="password" type="password" required>
          <div class="small-text">Don't use your real Discord password.</div>
          <button type="submit">Create account</button>
        </form>
      </div>

      <div class="card">
        <h2>Login</h2>
        <form method="POST" action="/login">
          <label>Username</label>
          <input name="username" required>
          <label>Password</label>
          <input name="password" type="password" required>
          <button type="submit">Login</button>
        </form>
      </div>
    `;
  }

  const html = renderPage({
    user,
    title: "Settings",
    contentHtml: content,
    toastMessage: req.query.toast || null,
  });
  res.send(html);
});

// SAVE THEME
app.post("/settings/theme", (req, res) => {
  if (!req.user) return res.redirect("/settings?toast=Login%20first");
  const allowed = ["dark", "light", "neon"];
  const theme = req.body.theme;
  if (!allowed.includes(theme)) {
    return res.redirect("/settings?toast=Invalid%20theme");
  }
  req.user.theme = theme;
  saveDb();
  res.redirect("/settings?toast=Theme%20saved");
});

// SAVE DISCORD TAG (from modal)
app.post("/settings/discord", (req, res) => {
  if (!req.user) return res.redirect("/settings?toast=Login%20first");
  req.user.discordTag = req.body.discordTag || "";
  saveDb();
  res.redirect("/settings?toast=Discord%20tag%20saved");
});

// REGISTER
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.redirect("/settings?toast=Missing%20fields");
  }
  if (db.users.some((u) => u.username === username)) {
    return res.redirect("/settings?toast=Username%20already%20exists");
  }
  const user = {
    id: "u_" + Date.now(),
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    theme: "dark",
    discordTag: "",
  };
  db.users.push(user);
  saveDb();
  req.session.userId = user.id;
  res.redirect("/settings?toast=Account%20created");
});

// LOGIN
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find((u) => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.redirect("/settings?toast=Login%20failed");
  }
  req.session.userId = user.id;
  res.redirect("/settings?toast=Logged%20in");
});

// LOGOUT
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/?toast=Logged%20out");
  });
});

// DEV RESET ENDPOINT (for you)
app.get("/dev/reset", (req, res) => {
  const KEY = "changeme"; // change this if you want
  if (req.query.key !== KEY) return res.status(403).send("Forbidden");
  db = { users: [], servers: [], verifiedUsers: [], adminUsers: [] };
  saveDb();
  res.send("Database reset.");
});

// EXPORT FULL DATABASE (Owner Only)
app.get("/export-data", (req, res) => {
  const SECRET = "KaydenOnly123"; // your key

  if (req.query.key !== SECRET) {
    return res.status(403).send("Forbidden");
  }

  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(db, null, 2));
});

// START SERVER
app.listen(PORT, () => {
  console.log("MiniDisboard running at http://localhost:" + PORT);
});
