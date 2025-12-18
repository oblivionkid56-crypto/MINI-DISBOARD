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
  partnerServers: [],
  messages: [], // NEW
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
      db.partnerServers = Array.isArray(parsed.partnerServers)
        ? parsed.partnerServers
        : [];
        db.messages = Array.isArray(parsed.messages) ? parsed.messages 
        : [];
    } catch (e) {
      console.log("data.json broken, resetting:", e.message);
      db = {
        users: [],
        servers: [],
        verifiedUsers: [],
        adminUsers: [],
        partnerServers: [],
        messages: [], 
      };
      saveDb();
    }
  } else {
    saveDb();
  }

  // Ensure arrays exist
  if (!db.verifiedUsers) db.verifiedUsers = [];
  if (!db.adminUsers) db.adminUsers = [];
  if (!db.partnerServers) db.partnerServers = [];

db.verifiedUsers = db.verifiedUsers || [];
db.adminUsers = db.adminUsers || [];
db.partnerServers = db.partnerServers || [];
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
// ============================================
//   UNIVERSAL PROFANITY / SLUR FILTER ENGINE
// ============================================

// 1) Turn any text into plain ASCII letters & numbers
function normalizeForFilter(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")              // remove accents
    .replace(/[\u0300-\u036f]/g, "")          // diacritics
    .replace(/[\u200B-\u200D\uFEFF]/g, "")    // zero-width chars
    .replace(/[^\w]/g, "")                    // remove symbols, punctuation, emojis
    // Cyrillic lookalike → Latin
    .replace(/[а-яё]/gi, c => {
      const map = {
        'а':'a','е':'e','о':'o','р':'p','с':'c','у':'y','х':'x',
        'к':'k','м':'m','т':'t','н':'h','в':'b'
      };
      return map[c] || c;
    })
    // Full-width → ASCII
    .replace(/[Ａ-Ｚａ-ｚ]/g, c =>
      String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
    );
}

// 2) Organized banned words
const banned = {
  slurs: [
    "nigger", "nigga",
    "faggot",
    "kike",
    "chink",
    "spic"
  ],

  profanity: [
    "fuck", "shit", "bitch", "bastard", "jerk",
    "kunt", "frick", "fricken", "damn", "crap"
  ],

  sexual: [
    "porn", "cum", "dick", "cock", "pussy", "anal"
  ],

  extremist: [
    "hitler", "gaydolf", "jerdolf", "epstein", "racist"
  ],

  violence: [
    "kys", "kill yourself", "suicide"
  ]
};

// 3) Flatten into one list
const allBannedWords = Object.values(banned).flat();

// 4) Auto-make regex for bypass protection
const bannedPatterns = allBannedWords.map(word => {
  const w = word
    .toLowerCase()
    .replace(/a/g, "[a@4]")
    .replace(/e/g, "[e3]")
    .replace(/i/g, "[i1!|]")
    .replace(/o/g, "[o0]")
    .replace(/u/g, "[u*]")
    .replace(/s/g, "[s5$]")
    .replace(/t/g, "[t7+]");

  return new RegExp(w, "i");
});

// EXTRA: fragment-based detection (catches broken/extended versions)
const bannedFragments = [
  "nig",   // core racist fragment
  "igg",
  "gger",
  "fag",
  "jew",
  "kys",
  "hitl",
  "porn",
  "anal",
  "cum",
  "cock",
  "puss",
  "dick"
];

// Normalize fragments the same way as text
const filteredFragments = bannedFragments.map(f =>
  f
    .toLowerCase()
    .replace(/a/g, "[a@4]")
    .replace(/e/g, "[e3]")
    .replace(/i/g, "[i1!|]")
    .replace(/o/g, "[o0]")
    .replace(/u/g, "[u*]")
);

// NEW final detection function
function containsBannedWords(text) {
  if (!text) return false;

  const normalized = normalizeForFilter(text);

  // 1: Try whole-word / strong patterns
  if (bannedPatterns.some(p => p.test(normalized))) return true;

  // 2: Try fragment matching
  return filteredFragments.some(f =>
    new RegExp(f, "i").test(normalized)
  );
}


function isPartner(serverId) {
  return (db.partnerServers || []).includes(serverId);
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

// ====== UI RENDER FUNCTION (UPDATED MODERN UI STYLES) ======
function renderPage({
  user,
  title = "MiniDisboard",
  contentHtml,
  toastMessage,
}) {
  const theme = user?.theme || "dark";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
  /* --- ADVANCED UI/UX STYLES --- */

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
    text-shadow: 0 0 4px rgba(94, 231, 255, 0.5); /* Subtle glow */
  }
  body.theme-light .verified {
    color: #0ea5e9;
    text-shadow: none;
  }
  body.theme-neon .verified {
    color: #67e8f9;
    text-shadow: 0 0 8px #67e8f9aa;
  }

  .partner-badge {
    font-size: 11px;
    margin-left: 6px;
    color: #facc15;
    font-weight: 600;
  }
  body.theme-neon .partner-badge {
    text-shadow: 0 0 6px rgba(250, 204, 21, 0.6);
  }

  .server-card.partner {
    border-color: #facc15;
    box-shadow: 0 0 12px rgba(250, 204, 21, 0.25);
    transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
  }
  .server-card.partner:hover {
    transform: translateY(-3px); /* Lift effect */
    box-shadow: 0 8px 20px rgba(250, 204, 21, 0.4);
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

  /* THEMES */
  body.theme-dark {
    background:#18191c;
    color:#f9fafb;
  }
  body.theme-light {
    background:#f4f5fb;
    color:#111827;
  }
  body.theme-neon {
    /* More vibrant neon background */
    background: #050816;
    background-image: radial-gradient(circle at top,#2f355e 10%, #050816 70%);
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
  .sidebar.theme-neon { 
    background:rgba(10,16,35,0.96); 
    border-right-color:rgba(148,163,184,0.3); 
    box-shadow: 2px 0 10px rgba(0,0,0,0.4); /* Add depth */
  }

  .logo {
    font-weight:800;
    font-size:18px;
    letter-spacing:.12em;
    text-transform:uppercase;
    margin-bottom:6px;
  }
  .logo span { 
    color:#9b5cff; 
    text-shadow: 0 0 6px rgba(155, 92, 255, 0.7); /* Logo glow */
    transition: color 0.3s;
  }
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
    padding:10px 12px; /* Slightly larger hit area */
    border-radius:10px;
    font-size:14px;
    margin-bottom:4px;
    transition:.18s;
    border:1px solid transparent;
  }
  .nav-link:hover {
    background:rgba(148,163,184,0.18); /* Darker hover */
    transform: translateX(2px); /* Slight movement */
  }
  .nav-link.active {
    background:linear-gradient(90deg, rgba(132,88,255,0.18), rgba(132,88,255,0.05));
    border-color:rgba(132,88,255,0.8);
    color:#e5e7ff;
    font-weight: 600;
  }
  body.theme-neon .nav-link.active {
    box-shadow: 0 0 8px rgba(132,88,255,0.4);
  }

  .user-box {
    margin-top:20px;
    padding-top:10px;
    border-top:1px solid rgba(55,65,81,0.6);
    display:flex;
    gap:10px; /* Increased gap */
    align-items:center;
  }
  .user-avatar {
    width:36px; /* Slightly larger avatar */
    height:36px;
    border-radius:999px;
    background:linear-gradient(135deg,#5865f2,#9b5cff);
    display:flex;
    align-items:center;
    justify-content:center;
    color:#fff;
    font-weight:700;
    font-size:16px;
    box-shadow: 0 0 8px rgba(88, 101, 242, 0.5); /* Avatar glow */
  }
  .user-info { font-size:13px; }
  .user-info .name { font-weight:600; }
  .user-info .discord { font-size:12px; color:var(--muted); }
  .user-info .logout {
    font-size:11px;
    color:#f97373;
    margin-top:2px;
    display:inline-block;
    transition: color 0.1s;
  }
  .user-info .logout:hover {
    color: #ef4444;
  }

  .content {
    flex:1;
    padding:24px 32px; /* Larger padding */
    overflow-y:auto;
  }

  .page-header h1 {
    font-size:24px; /* Larger heading */
    margin-bottom:4px;
    font-weight:800;
  }
  .page-header p {
    font-size:14px;
    color:var(--muted);
    margin-bottom:12px;
  }

  .card {
    background:rgba(31,31,37,0.96);
    border-radius:16px; /* Larger border radius */
    padding:20px; /* Larger padding */
    margin-bottom:20px;
    border:1px solid rgba(55,65,81,0.9);
    box-shadow: 0 4px 10px rgba(0,0,0,0.3); /* Subtle card shadow */
  }
  body.theme-light .card {
    background:#ffffff;
    border-color:#e5e7eb;
    box-shadow: 0 4px 8px rgba(0,0,0,0.05);
  }
  body.theme-neon .card {
    background:rgba(15,23,42,0.98);
    border-color:rgba(56,189,248,0.4);
    box-shadow: 0 0 15px rgba(56,189,248,0.15); /* Neon glow effect */
  }

  label {
    display:block;
    font-size:12px;
    margin:8px 0 2px;
    color:var(--muted);
    font-weight: 500;
  }
  input, textarea {
    width:100%;
    padding:10px 12px; /* Larger padding */
    border-radius:10px;
    border:1px solid #374151;
    background:#111827;
    color:#f9fafb;
    font-size:14px;
    outline:none;
    margin-bottom:4px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  input:focus, textarea:focus {
    border-color: var(--accent1);
    box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.4);
  }
  body.theme-light input,
  body.theme-light textarea {
    background:#f9fafb;
    color:#111827;
    border-color:#d1d5db;
  }
  body.theme-neon input,
  body.theme-neon textarea {
    border-color: rgba(56,189,248,0.5);
  }
  textarea { resize:vertical; min-height:80px; }

  button {
    background:linear-gradient(90deg,var(--accent1),var(--accent2));
    border:none;
    padding:10px 20px; /* Larger button */
    border-radius:999px;
    font-size:14px;
    font-weight:600;
    color:#fff;
    cursor:pointer;
    margin-top:10px;
    transition: all 0.2s ease;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  }
  button:hover {
    box-shadow: 0 6px 20px rgba(0,0,0,0.3);
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .small-text {
    font-size:12px;
    color:var(--muted);
    margin-top:4px;
  }

  .field-row {
    display:flex;
    align-items:center;
    gap:8px;
    margin-top:6px;
  }
  .field-row label { margin: 0; }

  .search-row {
    display:flex;
    gap:10px;
    flex-wrap:wrap;
    margin-bottom:10px;
  }
  .search-row input {
    flex:1;
    min-width:180px;
  }
  .count-text {
    font-size:13px;
    color:var(--muted);
    margin-bottom:6px;
  }

  /* SERVER GRID */
  .server-grid {
    display:grid;
    grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); /* Wider cards */
    gap:16px;
  }
  .server-card {
    background:rgba(24,25,32,0.96);
    border-radius:14px;
    padding:16px; /* Increased card padding */
    border:1px solid rgba(55,65,81,0.9);
    position:relative;
    display: flex;
    flex-direction: column;
    transition: all 0.2s ease-out; /* Add transition for hover */
  }
  .server-card:hover:not(.partner) {
    border-color: var(--accent1);
    box-shadow: 0 4px 10px rgba(88, 101, 242, 0.15);
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

  .server-name { font-size:18px; font-weight:700; } /* Larger name */
  .server-owner { font-size:12px; color:var(--muted); margin-bottom:6px; }
  .server-desc { font-size:14px; margin-top:6px; flex-grow: 1; } /* Take up space */
  .server-tags { font-size:12px; color:var(--muted); margin-top:8px; }
  .join-link { margin-top:12px; text-align:right; font-size:13px; }
  .join-link a { color:#22c55e; font-weight: 600; transition: color 0.1s; }
  .join-link a:hover { color: #16a34a; }

  .delete-btn {
    position:absolute;
    top:10px;
    right:10px;
    background:none;
    border:none;
    color:#f97373;
    font-size:13px;
    cursor:pointer;
    transition: color 0.1s;
    padding: 4px;
    line-height: 1;
  }
  .delete-btn:hover {
    color: #ef4444;
  }

  /* TOASTS (Keep functional) */
  #toast-container {
    position:fixed;
    top:20px;
    right:20px;
    z-index:9999;
  }
  .toast {
    padding:12px 18px;
    margin-bottom:10px;
    border-radius:10px;
    font-size:14px;
    color:var(--dangerText);
    background:var(--danger);
    box-shadow:0 10px 30px rgba(0,0,0,0.5);
    animation:slideIn .25s ease-out, fadeOut .35s ease-in forwards;
    animation-delay:0s, 2.7s; /* Longer delay */
  }
  @keyframes slideIn {
    from { transform:translateX(110%); opacity:0; }
    to   { transform:translateX(0); opacity:1; }
  }
  @keyframes fadeOut {
    to { transform:translateX(110%); opacity:0; }
  }

  /* DISCORD MODAL */
  .modal-backdrop {
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.75); /* Darker backdrop */
    display:none;
    align-items:center;
    justify-content:center;
    z-index:9998;
    backdrop-filter: blur(4px); /* Blur effect */
  }
  .modal {
    background:#1f2125;
    border-radius:18px; /* Larger border radius */
    padding:20px;
    width:360px; /* Wider modal */
    border:1px solid rgba(99,102,241,0.7);
    box-shadow: 0 10px 30px rgba(0,0,0,0.6);
  }
  body.theme-light .modal {
    background:#ffffff;
    color:#111827;
    border-color:#e5e7eb;
  }
  body.theme-neon .modal {
    background:rgba(15,23,42,0.98);
    border-color:rgba(99,102,241,0.8);
    box-shadow: 0 0 20px rgba(99,102,241,0.4);
  }
  .modal-title { font-size:20px; font-weight:700; margin-bottom:8px; }
  .modal-close {
    float:right;
    font-size:20px;
    cursor:pointer;
    color:var(--muted);
    transition: color 0.1s;
  }
  .modal-close:hover { color: #ef4444; }

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
      setTimeout(() => d.remove(), 3000); // 3 seconds before removal
    }

    function validateInvite(form) {
      const invite = form.invite.value.trim();
      // Added case-insensitivity to the regex
      const regex = /^(https?:\\/\\/)?(www\\.)?(discord\\.gg\\/|discord\\.com\\/invite\\/)[A-Za-z0-9]+$/i; 
      if (!regex.test(invite)) {
        showToast("You must enter a valid Discord invite link.");
        return false;
      }
      return true;
    }

    function confirmDelete(id) {
      if (confirm("Are you sure you want to permanently delete this server?")) {
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
        <div class="tagline">List and discover Discord communities.</div>

        <div class="section-label">Navigation</div>
        <a href="/" class="nav-link ${
          title === "Servers" ? "active" : ""
        }">Servers</a>
        <a href="/partnerships" class="nav-link ${
          title === "Partnerships" ? "active" : ""
        }">Partnerships</a>
        <a href="/settings" class="nav-link ${
          title === "Settings" ? "active" : ""
        }">Settings</a>
        ${
  user
    ? `<a href="/inbox" class="nav-link ${
        title === "Inbox" ? "active" : ""
      }">Inbox</a>`
    : ""
}
${
  user && isAdmin(user)
    ? `
      <a href="/admin" class="nav-link ${
        title === "Admin" ? "active" : ""
      }">Admin Console</a>
      <a href="/admin/inbox" class="nav-link ${
        title === "Admin Inbox" ? "active" : ""
      }">Admin Inbox</a>
    `
    : ""
}

<div class="section-label" style="margin-top:18px;">Resources</div>
<a href="/information" class="nav-link ${
  title === "Information" ? "active" : ""
}">Information</a>
<a href="/request-verification" class="nav-link ${
  title === "Request Verification" ? "active" : ""
}">Contact Us </a>
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
          <div class="name">Guest User</div>
          <div class="discord">Log in via Settings</div>
        </div>
        `
        }
      </div>
    </aside>

    <main class="content">
      ${contentHtml}
    </main>
  </div>

  <div id="discord-modal-backdrop" class="modal-backdrop">
    <div class="modal">
      <div class="modal-close" onclick="closeDiscordModal()">×</div>
      <div class="modal-title">Connect Discord</div>
      <p class="small-text">
        Enter your Discord username (e.g. name#1234 or @user).
        This does not log into Discord, it just shows on your profile.
      </p>
      <form method="POST" action="/settings/discord">
        <label>Your Discord Tag/Username</label>
        <input name="discordTag" placeholder="name#1234 or @user" required>
        <button type="submit">Save Discord Tag</button>
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
        .map((s) => {
          const mine = user && s.ownerId === user.id;
          const partner = isPartner(s.id);

          return `
        <div class="server-card ${s.pinned ? "pinned" : ""} ${
            partner ? "partner" : ""
          }">
          ${
            mine
              ? `<button class="delete-btn" onclick="return confirmDelete('${s.id}')">❌</button>`
              : ""
          }

          <div class="server-name">
            ${s.name}
            ${
              partner
                ? '<span class="partner-badge">★ Partner</span>'
                : ""
            }
          </div>

          <div class="server-owner">
            by ${s.ownerName}
            ${isVerified(s.ownerName) ? '<span class="verified">✔</span>' : ""}
          </div>

          <div class="server-desc">${s.description}</div>
          ${s.tags ? `<div class="server-tags">Tags: ${s.tags}</div>` : ""}
          <div class="join-link">
            <a href="${s.invite}" target="_blank">Join server →</a>
          </div>
        </div>
      `;
        })
        .join("") +
      "</div>";
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

  // 🔥 Check for banned content
  if (
    containsBannedWords(name) ||
    containsBannedWords(description) ||
    containsBannedWords(tags || "")
  ) {
    return res.redirect("/?toast=Inappropriate%20content%20blocked");
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
  // Also remove from partnerServers if present
  db.partnerServers = (db.partnerServers || []).filter((sid) => sid !== id);
  saveDb();
  const deleted = db.servers.length !== before;
  res.redirect(
    "/?toast=" +
      encodeURIComponent(deleted ? "Server deleted" : "Unable to delete server")
  );
});

// ===== PARTNERSHIPS PUBLIC PAGE =====
app.get("/partnerships", (req, res) => {
  const user = req.user;
  const partnerIds = db.partnerServers || [];
  const partnerServers = db.servers.filter((s) => partnerIds.includes(s.id));

  let content = `
    <div class="page-header">
      <h1>Partnerships</h1>
      <p>Special servers that are officially partnered with MiniDisboard.</p>
    </div>
  `;

  if (partnerServers.length === 0) {
    content += `
      <div class="card">
        <p class="small-text">No partner servers yet.</p>
      </div>
    `;
  } else {
    const listHtml =
      '<div class="server-grid">' +
      partnerServers
        .map((s) => {
          return `
        <div class="server-card partner ${s.pinned ? "pinned" : ""}">
          <div class="server-name">
            ${s.name}
            <span class="partner-badge">★ Partner</span>
          </div>
          <div class="server-owner">
            by ${s.ownerName}
            ${isVerified(s.ownerName) ? '<span class="verified">✔</span>' : ""}
          </div>
          <div class="server-desc">${s.description}</div>
          ${s.tags ? `<div class="server-tags">Tags: ${s.tags}</div>` : ""}
          <div class="join-link">
            <a href="${s.invite}" target="_blank">Join server →</a>
          </div>
        </div>
      `;
        })
        .join("") +
      "</div>";

    content += `
      <div class="card">
        ${listHtml}
      </div>
    `;
  }

  const html = renderPage({
    user,
    title: "Partnerships",
    contentHtml: content,
    toastMessage: req.query.toast || null,
  });
  res.send(html);
});

// ===== ADMIN PAGE =====
// ===== ADMIN PAGE =====
app.get("/admin", (req, res) => {
  if (!req.user || !isAdmin(req.user)) {
    return res.status(403).send("Forbidden");
  }

  const verifiedList = (db.verifiedUsers || [])
    .map(u => `<li>${u} <a href="/admin/unverify?u=${encodeURIComponent(u)}">❌</a></li>`)
    .join("");

  const adminList = (db.adminUsers || [])
    .map(u =>
      `<li>${u} ${
        u === "Kayden"
          ? "<span class='small-text'>(owner)</span>"
          : `<a href="/admin/remove-admin?u=${encodeURIComponent(u)}">❌</a>`
      }</li>`
    )
    .join("");

  const partnerIds = db.partnerServers || [];
  const partnerServers = db.servers.filter(s => partnerIds.includes(s.id));

  const partnersList = partnerServers
    .map(
      s =>
        `<li>${s.name} <span class="small-text">(${s.id})</span>
        <a href="/admin/remove-partner?sid=${encodeURIComponent(s.id)}">❌</a></li>`
    )
    .join("");

  // BUILD ADMIN PAGE CONTENT
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

    <div class="card">
      <h2>Manage Users</h2>
      <p class="small-text">Admins cannot be deleted.</p>

      <ul style="margin-left:20px; line-height:1.6;">
        ${db.users
          .map(u => {
            const protectedUser = db.adminUsers.includes(u.username);
            return `
              <li>
                ${u.username}
                ${protectedUser ? "<span class='small-text'>(admin)</span>" : ""}
                ${
                  !protectedUser
                    ? `<a href="/admin/delete-user?id=${u.id}" onclick="return confirm('Delete user ${u.username}?')">❌</a>`
                    : ""
                }
              </li>
            `;
          })
          .join("")}
      </ul>
    </div>

    <div class="card">
      <h2>Partnership servers</h2>
      <form method="POST" action="/admin/add-partner">
        <label>Server ID</label>
        <input name="serverId" required placeholder="e.g. s_1764537526889">
        <button type="submit">Add partner</button>
      </form>
      <ul style="margin-left:20px; line-height:1.6; margin-top:8px;">
        ${partnersList || "<i>No partner servers yet.</i>"}
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

  res.redirect("/admin?toast=Removed%20admin:%20" + encodeURIComponent(u));
});

// ADD PARTNER (only if server exists)
app.post("/admin/add-partner", (req, res) => {
  if (!req.user || !isAdmin(req.user)) {
    return res.status(403).send("Forbidden");
  }

  const sid = (req.body.serverId || "").trim();
  if (!sid) {
    return res.redirect("/admin?toast=Missing%20server%20ID");
  }

  const server = db.servers.find((s) => s.id === sid);
  if (!server) {
    return res.redirect("/admin?toast=Server%20not%20found");
  }

  if (!db.partnerServers.includes(sid)) {
    db.partnerServers.push(sid);
    saveDb();
    return res.redirect(
      "/admin?toast=Added%20partner:%20" + encodeURIComponent(server.name)
    );
  }

  return res.redirect("/admin?toast=Already%20a%20partner");
});



// DELETE USER ROUTE (Admin function)
app.get("/admin/delete-user", (req, res) => {
  if (!req.user || !isAdmin(req.user)) {
    return res.status(403).send("Forbidden");
  }

  const userId = req.query.id;
  if (!userId) {
    return res.redirect("/admin?toast=Missing%20user%20ID");
  }

  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    return res.redirect("/admin?toast=User%20not%20found");
  }

  // Prevent deleting admins
  if (db.adminUsers.includes(user.username)) {
    return res.redirect("/admin?toast=Cannot%20delete%20admin%20accounts");
  }

  // Delete their servers
  db.servers = db.servers.filter((s) => s.ownerId !== userId);

  // Delete the user
  db.users = db.users.filter((u) => u.id !== userId);

  saveDb();
  return res.redirect("/admin?toast=Deleted%20user:%20" + encodeURIComponent(user.username));
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
// REGISTER
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect("/settings?toast=Missing%20fields");
  }

  // 🔥 Block offensive usernames
  if (containsBannedWords(username)) {
    return res.redirect("/settings?toast=Choose%20a%20different%20username");
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

app.post("/request-verification", (req, res) => {
  if (!req.user) return res.redirect("/settings?toast=Login%20first");

db.messages.push({
  id: "m_" + Date.now(),
  from: req.user.username,
  to: "owner",
  content: req.body.message,
  time: new Date().toISOString(),
  read: false,
  replies: []
});

  saveDb();
  res.redirect("/request-verification?toast=Request%20sent");
});


app.post("/admin/delete-message", (req, res) => {
  if (!req.user || !isAdmin(req.user)) {
    return res.status(403).send("Forbidden");
  }

  const { id } = req.body;
  db.messages = (db.messages || []).filter(m => m.id !== id);
  saveDb();

  res.redirect("/admin/inbox?toast=Message%20deleted");
});


app.post("/admin/reply-message", (req, res) => {
  if (!req.user || !isAdmin(req.user)) {
    return res.status(403).send("Forbidden");
  }

  const { id, reply } = req.body;
  if (!reply?.trim()) {
    return res.redirect("/admin/inbox?toast=Reply%20cannot%20be%20empty");
  }

  const msg = db.messages.find(m => m.id === id);
  if (!msg) {
    return res.redirect("/admin/inbox?toast=Message%20not%20found");
  }

  msg.replies.push({
    from: req.user.username,
    content: reply,
    time: new Date().toISOString()
  });

  saveDb();
  res.redirect("/admin/inbox?toast=Reply%20sent");
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
  db = {
    users: [],
    servers: [],
    verifiedUsers: [],
    adminUsers: [],
    partnerServers: [],
  };
  saveDb();
  res.send("Database reset.");
});

// EXPORT FULL DATABASE (Owner Only)
app.get("/export-data", (req, res) => {
  const SECRET = "Secret111"; // your key

  if (req.query.key !== SECRET) {
    return res.status(403).send("Forbidden");
  }

  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(db, null, 2));
});

app.get("/information", (req, res) => {
  res.send(renderPage({
    user: req.user,
    title: "Information",
    contentHtml: `
      <div class="page-header">
        <h1>Information</h1>
        <p>About our website!</p>
      </div>
      <div class="card">
        <p class="small-text">
          Welcome to our website, here is a palce to list and find discord servers! We have started small but hope to grow big.
           Feel free to use our " Message " feature when you login/sign up to message me about any questions!
        </p>
      </div>
    `
  }));
});

app.get("/request-verification", (req, res) => {
  if (!req.user) return res.redirect("/settings?toast=Login%20first");

  res.send(renderPage({
    user: req.user,
    title: "Request Verification",
contentHtml: `
  <div class="page-header">
    <h1>Contact Us!</h1>
    <p>
      This sends a message to the owner.
      Only send a message if you need help or are reporting a bug.
    </p>
  </div>

  <div class="card">
    <form method="POST">
      <label>Message</label>
      <textarea name="message" required></textarea>
      <button type="submit">Send Request</button>
    </form>
  </div>
`
  }));
});

// ===== USER INBOX 
app.get("/inbox", (req, res) => {
  if (!req.user) {
    return res.redirect("/settings?toast=Login%20first");
  }

  const myMessages = (db.messages || [])
    .filter(m => m.from === req.user.username)
    .slice()
    .reverse();

  let content = `
    <div class="page-header">
      <h1>Your Inbox</h1>
      <p>Messages and replies from the site owner.</p>
    </div>
  `;

  if (myMessages.length === 0) {
    content += `
      <div class="card">
        <p class="small-text">You have not sent any messages yet.</p>
      </div>
    `;
  } else {
    content += myMessages.map(m => `
      <div class="card">
        <div class="small-text">
          <strong>Sent:</strong> ${new Date(m.time).toLocaleString()}
        </div>

        <p style="margin-top:8px;">${m.content}</p>

        ${
          (m.replies || []).length === 0
            ? `<p class="small-text" style="margin-top:10px;">No replies yet.</p>`
            : (m.replies || []).map(r => `
                <div class="card" style="margin-top:10px;">
                  <div class="small-text">
                    <strong>Reply from ${r.from}</strong> • ${new Date(r.time).toLocaleString()}
                  </div>
                  <p>${r.content}</p>
                </div>
              `).join("")
        }
      </div>
    `).join("");
  }

  res.send(renderPage({
    user: req.user,
    title: "Inbox",
    contentHtml: content
  }));
});


// ===== ADMIN INBOX =====
app.get("/admin/inbox", (req, res) => {
  if (!req.user || !isAdmin(req.user)) {
    return res.status(403).send("Forbidden");
  }

  const messages = (db.messages || []).slice().reverse();

  // mark all messages as read
  db.messages.forEach(m => (m.read = true));
  saveDb();

  let content = `
    <div class="page-header">
      <h1>Admin Inbox</h1>
      <p>Messages sent to the site owner.</p>
    </div>
  `;

  if (messages.length === 0) {
    content += `
      <div class="card">
        <p class="small-text">No messages yet.</p>
      </div>
    `;
  } else {
    content += messages.map(m => `
      <div class="card">
        <div class="small-text">
          <strong>From:</strong> ${m.from}<br>
          <strong>Sent:</strong> ${new Date(m.time).toLocaleString()}
          ${!m.read ? " • <strong>UNREAD</strong>" : ""}
        </div>

        <p style="margin-top:8px;">${m.content}</p>

        ${(m.replies || []).map(r => `
          <div class="card" style="margin-top:10px;">
            <div class="small-text">
              <strong>Reply from ${r.from}</strong> • ${new Date(r.time).toLocaleString()}
            </div>
            <p>${r.content}</p>
          </div>
        `).join("")}

        <form method="POST" action="/admin/reply-message" style="margin-top:10px;">
          <input type="hidden" name="id" value="${m.id}">
          <label>Reply</label>
          <textarea name="reply" required></textarea>
          <button type="submit">Send Reply</button>
        </form>

        <form method="POST" action="/admin/delete-message"
              onsubmit="return confirm('Delete this message?')">
          <input type="hidden" name="id" value="${m.id}">
          <button type="submit" style="background:var(--danger);margin-top:6px;">
            Delete
          </button>
        </form>
      </div>
    `).join("");
  }

  res.send(renderPage({
    user: req.user,
    title: "Admin Inbox",
    contentHtml: content
  }));
});



// REMOVE PARTNER SERVER
app.get("/admin/remove-partner", (req, res) => {
  if (!req.user || !isAdmin(req.user)) {
    return res.status(403).send("Forbidden");
  }

  const sid = req.query.sid;
  if (!sid) {
    return res.redirect("/admin?toast=Missing%20server%20ID");
  }

  const before = db.partnerServers.length;
  db.partnerServers = (db.partnerServers || []).filter(id => id !== sid);

  saveDb();

  const removed = db.partnerServers.length !== before;

  res.redirect(
    "/admin?toast=" +
      encodeURIComponent(
        removed ? "Partner removed" : "Server was not a partner"
      )
  );
});


// START SERVER
app.listen(PORT, () => {
  console.log("MiniDisboard running at http://localhost:" + PORT);
});