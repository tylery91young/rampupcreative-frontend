/* /admin — inquiry inbox */
(function () {
  "use strict";

  var loginForm = document.getElementById("admin-login");
  var loginStatus = document.getElementById("admin-login-status");
  var app = document.getElementById("admin-app");
  var listEl = document.getElementById("admin-list");
  var countEl = document.getElementById("admin-count");
  var tabs = document.getElementById("admin-tabs");
  var logoutBtn = document.getElementById("admin-logout");

  var state = { filter: "new", counts: {} };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso || "";
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function showLogin(msg) {
    app.hidden = true;
    loginForm.hidden = false;
    if (msg) { loginStatus.textContent = msg; loginStatus.classList.add("is-shown"); }
  }
  function showApp() {
    loginForm.hidden = true;
    app.hidden = false;
    load();
  }

  function api(path, opts) {
    return fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts))
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; });
      });
  }

  function load() {
    api("/api/admin/submissions?status=" + encodeURIComponent(state.filter)).then(function (res) {
      if (res.status === 401) { showLogin(); return; }
      if (!res.body.ok) { listEl.innerHTML = '<p class="muted">Could not load submissions.</p>'; return; }
      state.counts = res.body.counts || {};
      render(res.body.submissions || []);
      updateTabs();
    });
  }

  function updateTabs() {
    [].forEach.call(tabs.children, function (b) {
      var f = b.dataset.filter;
      b.classList.toggle("is-active", f === state.filter);
      var n = state.counts[f];
      b.textContent = b.textContent.replace(/\s*\(\d+\)$/, "");
      if (typeof n === "number") b.textContent += " (" + n + ")";
    });
  }

  function render(items) {
    countEl.textContent = items.length + (items.length === 1 ? " message" : " messages");
    if (!items.length) { listEl.innerHTML = '<p class="muted">Nothing here.</p>'; return; }
    listEl.innerHTML = items.map(function (s) {
      return (
        '<article class="sub status-' + esc(s.status) + '" data-id="' + s.id + '">' +
          '<div class="sub-top">' +
            "<b>" + esc(s.name) + "</b>" +
            '<span class="sub-date">' + esc(fmtDate(s.created_at)) + "</span>" +
          "</div>" +
          '<div class="sub-contacts">' +
            '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + "</a>" +
            (s.phone ? '<a href="tel:' + esc(s.phone) + '">' + esc(s.phone) + "</a>" : "") +
            (s.page ? '<span class="muted">' + esc(s.page) + "</span>" : "") +
          "</div>" +
          '<div class="sub-msg">' + esc(s.message) + "</div>" +
          (s.note ? '<div class="sub-meta">Note: ' + esc(s.note) + "</div>" : "") +
          '<div class="sub-meta">' + esc(s.ip || "") + (s.turnstile_ok ? " · verified" : " · unverified") + "</div>" +
          '<div class="sub-actions">' +
            '<button data-act="replied">Mark replied</button>' +
            '<button data-act="new">Mark new</button>' +
            '<button data-act="spam" class="danger">Mark spam</button>' +
            '<button data-act="note">Add note</button>' +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  listEl.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-act]");
    if (!btn) return;
    var art = e.target.closest(".sub");
    var id = art.dataset.id;
    var act = btn.dataset.act;
    var payload = { id: Number(id) };
    if (act === "note") {
      var note = prompt("Note for this submission:", "");
      if (note === null) return;
      payload.note = note;
    } else {
      payload.status = act;
    }
    btn.disabled = true;
    api("/api/admin/submissions", { method: "PATCH", body: JSON.stringify(payload) }).then(function (res) {
      if (res.status === 401) { showLogin("Session expired — sign in again."); return; }
      load();
    });
  });

  tabs.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-filter]");
    if (!b) return;
    state.filter = b.dataset.filter;
    load();
  });

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    loginStatus.classList.remove("is-shown");
    var pw = loginForm.password.value;
    api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: pw }) }).then(function (res) {
      if (res.status === 200 && res.body.ok) { loginForm.password.value = ""; showApp(); }
      else {
        loginStatus.textContent = res.body.error || "Incorrect password.";
        loginStatus.classList.add("is-shown");
      }
    });
  });

  logoutBtn.addEventListener("click", function () {
    api("/api/admin/logout", { method: "POST" }).then(function () { showLogin("Signed out."); });
  });

  // initial probe
  api("/api/admin/submissions?status=new").then(function (res) {
    if (res.status === 200 && res.body && res.body.ok) showApp();
    else showLogin();
  }).catch(showLogin.bind(null, ""));
})();
