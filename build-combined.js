const fs = require('fs');

const owner = fs.readFileSync('public/owner/index.html', 'utf8');
const customer = fs.readFileSync('public/customer/menu.html', 'utf8');
const admin = fs.readFileSync('private/admin.html', 'utf8');

function extractBody(html) {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1].trim() : '';
}

function extractScript(html) {
  const m = html.match(/<script>([\s\S]*)<\/script>/i);
  return m ? m[1].trim() : '';
}

function extractStyles(html) {
  const styles = [];
  const regex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    styles.push(match[1]);
  }
  return styles.join('\n');
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1] : 'App';
}

const ownerCSS = extractStyles(owner);
const customerCSS = extractStyles(customer);
const adminCSS = extractStyles(admin);
const ownerBody = extractBody(owner);
const customerBody = extractBody(customer);
const adminBody = extractBody(admin);
let ownerScript = extractScript(owner);
let customerScript = extractScript(customer);
let adminScript = extractScript(admin);

// Remove trailing auto-init calls (handled by switchView on first view switch)
ownerScript = ownerScript.replace(/checkAuth\s*\(\s*\)\s*;?\s*$/m, '');
customerScript = customerScript.replace(/loadMenu\s*\(\s*\)\s*;?\s*$/m, '');
adminScript = adminScript.replace(/checkAuth\s*\(\s*\)\s*;?\s*$/m, '');

const combined = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Restaurant Platform</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d0d0d; color: #f5f5f5; min-height: 100vh; }

.launch-page { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 2rem; background: linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 50%, #16213e 100%); }
.launch-page h1 { font-size: 2rem; margin-bottom: 0.5rem; background: linear-gradient(135deg, #e67e22, #f39c12); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.launch-page p { color: #888; margin-bottom: 2rem; text-align: center; }
.launch-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; width: 100%; max-width: 800px; }
.launch-card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: 2rem; text-align: center; cursor: pointer; transition: all 0.3s; text-decoration: none; color: inherit; }
.launch-card:hover { border-color: #e67e22; transform: translateY(-4px); box-shadow: 0 8px 30px rgba(230,126,34,0.15); }
.launch-card .icon { font-size: 2.5rem; margin-bottom: 1rem; }
.launch-card h3 { font-size: 1.2rem; margin-bottom: 0.5rem; }
.launch-card p { font-size: 0.85rem; color: #888; margin-bottom: 0; }

.view-container { display: none; }
.view-container.active { display: block; }

.nav-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #111; border-top: 1px solid #2a2a2a; display: flex; justify-content: space-around; padding: 0.5rem 0; z-index: 1000; }
.nav-bar a { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; color: #888; text-decoration: none; font-size: 0.7rem; padding: 0.25rem 0.75rem; border-radius: 8px; transition: all 0.2s; cursor: pointer; }
.nav-bar a:hover, .nav-bar a.active { color: #e67e22; background: rgba(230,126,34,0.1); }
.nav-bar a .nav-icon { font-size: 1.2rem; }

/* ===== OWNER DASHBOARD STYLES ===== */
.view-owner ${ownerCSS}

/* ===== CUSTOMER MENU STYLES ===== */
.view-customer ${customerCSS}

/* ===== ADMIN PANEL STYLES ===== */
.view-admin ${adminCSS}

/* Override for embedded views - hide login overlay in admin */
.view-admin .login-page { display: none !important; }
.view-owner .login-page { display: flex !important; }
.view-owner .login-page[style*="display: none"] { display: none !important; }

@media (min-width: 769px) {
  .nav-bar { display: none; }
}
</style>
</head>
<body>
<!-- Landing Page -->
<div id="landing-page" class="launch-page landing-view">
  <h1>Restaurant Platform</h1>
  <p>Choose an application to open</p>
  <div class="launch-grid">
    <a class="launch-card" onclick="switchView('owner')">
      <div class="icon">&#x1F3E2;</div>
      <h3>Owner Dashboard</h3>
      <p>Manage your restaurant — orders, menu, settings, and QR codes</p>
    </a>
    <a class="launch-card" onclick="switchView('customer')">
      <div class="icon">&#x1F37D;&#xFE0F;</div>
      <h3>Customer Menu</h3>
      <p>Browse the menu, view categories, and place orders</p>
    </a>
    <a class="launch-card" onclick="switchView('admin')">
      <div class="icon">&#x1F6E1;&#xFE0F;</div>
      <h3>Super Admin Panel</h3>
      <p>Manage all restaurants, owners, and platform settings</p>
    </a>
  </div>
</div>

<!-- Owner Dashboard -->
<div id="view-owner" class="view-container view-owner">
  ${ownerBody}
</div>

<!-- Customer Menu -->
<div id="view-customer" class="view-container view-customer">
  ${customerBody}
</div>

<!-- Super Admin Panel -->
<div id="view-admin" class="view-container view-admin">
  ${adminBody}
</div>

<!-- Bottom Nav Bar (mobile) -->
<nav class="nav-bar" id="nav-bar">
  <a onclick="switchView('owner')" class="active"><span class="nav-icon">&#x1F3E2;</span>Owner</a>
  <a onclick="switchView('customer')"><span class="nav-icon">&#x1F37D;&#xFE0F;</span>Menu</a>
  <a onclick="switchView('admin')"><span class="nav-icon">&#x1F6E1;&#xFE0F;</span>Admin</a>
  <a onclick="switchView('landing')"><span class="nav-icon">&#x1F3E0;</span>Home</a>
</nav>

<script>
var currentView = null;

function switchView(view) {
  document.querySelectorAll('.view-container').forEach(function(el) { el.classList.remove('active'); });
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('landing-page').classList.remove('active');

  if (view === 'landing') {
    document.getElementById('landing-page').style.display = 'flex';
    document.getElementById('landing-page').classList.add('active');
    document.querySelectorAll('.nav-bar a').forEach(function(a) { a.classList.remove('active'); });
    document.querySelector('.nav-bar a:last-child').classList.add('active');
    currentView = null;
    return;
  }

  var el = document.getElementById('view-' + view);
  if (el) {
    el.classList.add('active');
    document.getElementById('landing-page').style.display = 'none';
  }

  document.querySelectorAll('.nav-bar a').forEach(function(a) { a.classList.remove('active'); });
  var navLinks = document.querySelectorAll('.nav-bar a');
  var idx = view === 'owner' ? 0 : view === 'customer' ? 1 : view === 'admin' ? 2 : 3;
  if (navLinks[idx]) navLinks[idx].classList.add('active');

  currentView = view;

  // Initialize view when first shown
  if (view === 'owner') {
    if (typeof checkAuth === 'function') checkAuth();
  }
  if (view === 'customer') {
    if (typeof loadMenu === 'function') loadMenu();
  }
  if (view === 'admin') {
    if (typeof checkAuth === 'function') checkAuth();
  }
}

/* ===== OWNER DASHBOARD JS ===== */
${ownerScript}

/* ===== CUSTOMER MENU JS ===== */
${customerScript}

/* ===== ADMIN PANEL JS ===== */
${adminScript}

// Remove auto-init calls at end of scripts (handled by switchView)
// Owner: checkAuth() at end removed
// Customer: loadMenu() at end removed
// Admin: checkAuth() at end removed

// Override logout to go back to landing
var origLogout = typeof logout === 'function' ? logout : null;
if (typeof logout === 'function') {
  window._origLogout = logout;
  logout = function() {
    if (window._origLogout) window._origLogout();
    switchView('landing');
  };
}

// Fix admin logout
if (typeof window.adminLogout === 'function') {
  window._adminLogout = window.adminLogout;
  window.adminLogout = function() {
    if (window._adminLogout) window._adminLogout();
    switchView('landing');
  };
}

// Owner sidebar logout fix
document.addEventListener('click', function(e) {
  if (e.target.closest && e.target.closest('.logout, .logout-btn, [onclick*=\"logout\" i]')) {
    // Let the original handler run, then go home
    setTimeout(function() {
      if (document.getElementById('landing-page')) {
        switchView('landing');
      }
    }, 100);
  }
});

switchView('landing');
</script>
</body>
</html>`;

fs.writeFileSync('public/combined.html', combined);
console.log('Written: public/combined.html (' + (combined.length / 1024).toFixed(1) + ' KB)');
