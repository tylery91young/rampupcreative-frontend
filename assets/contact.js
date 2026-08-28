/* Contact form -> POST /api/contact */
(function () {
  "use strict";
  var form = document.getElementById("contact-form");
  if (!form) return;
  var statusEl = document.getElementById("contact-status");
  var btn = form.querySelector('button[type="submit"]');

  function setStatus(kind, msg) {
    statusEl.className = "form-status is-shown " + kind;
    statusEl.textContent = msg;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    if (!form.reportValidity()) return;

    var data = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      message: form.message.value.trim(),
      company_website: form.company_website.value, // honeypot
      page: location.pathname
    };

    var tokenField = form.querySelector('[name="cf-turnstile-response"]');
    data.turnstileToken = tokenField ? tokenField.value : "";

    btn.disabled = true;
    var original = btn.textContent;
    btn.textContent = "Sending…";
    setStatus("ok", "Sending your message…");

    fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (res.ok && res.body.ok) {
          form.reset();
          if (window.turnstile) { try { window.turnstile.reset(); } catch (_) {} }
          setStatus("ok", "Thanks — your message is in. I'll be in touch soon.");
        } else {
          setStatus("err", res.body && res.body.error ? res.body.error : "Something went wrong. Please email tyler@rampupcreative.com directly.");
        }
      })
      .catch(function () {
        setStatus("err", "Network error. Please email tyler@rampupcreative.com directly.");
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = original;
      });
  });
})();
