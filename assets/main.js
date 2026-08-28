/* Ramp Up Creative — shared front-end behaviour */
(function () {
  "use strict";

  document.documentElement.classList.add("js");

  /* ?diag=1 — surface horizontal-overflow offenders (dev aid) */
  if (location.search.indexOf("diag") !== -1) {
    window.addEventListener("load", function () {
      var docW = document.documentElement.clientWidth;
      var bad = [];
      document.querySelectorAll("*").forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.right > docW + 1 || r.left < -1) {
          bad.push(el.tagName + "." + (el.className || "") + " right=" + Math.round(r.right) + " w=" + Math.round(r.width));
        }
      });
      var pre = document.createElement("pre");
      pre.id = "diag-out";
      pre.style.cssText = "position:fixed;left:0;right:0;bottom:0;max-height:40vh;z-index:99999;background:rgba(255,255,0,.95);color:#000;font:11px monospace;padding:10px;overflow:auto;margin:0;border-top:2px solid #000";
      pre.textContent = "clientWidth=" + docW + " scrollWidth=" + document.documentElement.scrollWidth +
        (bad.length ? "\nOVERFLOW:\n" + bad.join("\n") : "  — no horizontal overflow");
      document.body.appendChild(pre);
    });
  }

  /* ---- sticky header state (home: transparent -> solid on scroll) ---- */
  var header = document.querySelector("[data-header]");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-stuck", window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---- mobile nav ---- */
  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---- scroll reveal ---- */
  var reveals = document.querySelectorAll(".reveal");
  if (reveals.length) {
    if (!("IntersectionObserver" in window)) {
      reveals.forEach(function (el) { el.classList.add("is-visible"); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.14 });
      reveals.forEach(function (el) { io.observe(el); });
      // safety net: never leave content hidden
      setTimeout(function () {
        reveals.forEach(function (el) { el.classList.add("is-visible"); });
      }, 3000);
    }
  }

  /* ---- lightbox (any [data-lightbox] container of <a><img></a>) ---- */
  var galleries = document.querySelectorAll("[data-lightbox]");
  if (galleries.length) {
    var links = [];
    galleries.forEach(function (g) {
      g.querySelectorAll("a").forEach(function (a) { links.push(a); });
    });

    var box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML =
      '<button class="lb-close" aria-label="Close">&times;</button>' +
      '<button class="lb-prev" aria-label="Previous">&#8249;</button>' +
      '<img alt="">' +
      '<button class="lb-next" aria-label="Next">&#8250;</button>';
    document.body.appendChild(box);
    var lbImg = box.querySelector("img");
    var idx = 0;

    var show = function (i) {
      idx = (i + links.length) % links.length;
      lbImg.src = links[idx].getAttribute("href");
      box.classList.add("is-open");
      document.body.style.overflow = "hidden";
    };
    var hide = function () {
      box.classList.remove("is-open");
      lbImg.src = "";
      document.body.style.overflow = "";
    };

    links.forEach(function (a, i) {
      a.addEventListener("click", function (e) { e.preventDefault(); show(i); });
    });
    box.querySelector(".lb-close").addEventListener("click", hide);
    box.querySelector(".lb-prev").addEventListener("click", function () { show(idx - 1); });
    box.querySelector(".lb-next").addEventListener("click", function () { show(idx + 1); });
    box.addEventListener("click", function (e) { if (e.target === box) hide(); });
    document.addEventListener("keydown", function (e) {
      if (!box.classList.contains("is-open")) return;
      if (e.key === "Escape") hide();
      if (e.key === "ArrowLeft") show(idx - 1);
      if (e.key === "ArrowRight") show(idx + 1);
    });
  }
})();
