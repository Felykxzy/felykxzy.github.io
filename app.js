(function () {
  "use strict";
  var deck = document.getElementById("deck"), slides = [].slice.call(deck.children), dock = document.getElementById("dock"), N = slides.length;
  var wideMQ = matchMedia("(min-width:900px) and (min-aspect-ratio:12/10)"), CW = innerWidth, cur = 0, W = innerWidth, H = innerHeight, DPR = Math.min(2, window.devicePixelRatio || 1), drag = null, moved = false, lastT = performance.now(), recent = [];
  var cvs = slides.map(function (s) { return s.querySelector("canvas"); }), ctxs = cvs.map(function (c) { return c.getContext("2d"); });
  var rm = matchMedia("(prefers-reduced-motion:reduce)").matches;
  function size() { W = innerWidth; H = innerHeight; DPR = Math.min(2, window.devicePixelRatio || 1); window.HUB_WIDE = wideMQ.matches; CW = window.HUB_WIDE ? Math.round(W * .62) : W; cvs.forEach(function (c) { c.width = Math.round(CW * DPR); c.height = Math.round(H * DPR); }); go(cur, true); thumbs(); }
  var thumbCv = [];
  function thumbs() {
    var hw = window.HUB_WIDE; window.HUB_WIDE = false;
    thumbCv.forEach(function (c, i) { var g = c.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); var s = 128; c.width = c.height = s * Math.min(2, DPR); g.scale(c.width / s, c.width / s); g.save(); g.beginPath(); g.rect(0, 0, s, s); g.clip(); g.translate(s / 2, s / 2); g.scale(1.1, 1.1); g.translate(-s / 2, -s / 2 + 10); window.SCENES[i](g, s, s * 1.35, window.SCENE_THUMB_T[i]); g.restore(); });
    window.HUB_WIDE = hw;
  }
  slides.forEach(function (s, i) {
    var b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", s.getAttribute("aria-label")); b.style.setProperty("--c", s.style.getPropertyValue("--c"));
    var c = document.createElement("canvas"); b.appendChild(c); thumbCv.push(c); b.addEventListener("click", function () { go(i); }); dock.appendChild(b);
  });
  function go(i, instant) {
    cur = Math.max(0, Math.min(N - 1, i)); if (instant) deck.style.transition = "none";
    deck.style.transform = "translateX(" + (-cur * 100 / N) + "%)"; if (instant) { void deck.offsetWidth; deck.style.transition = ""; }
    [].forEach.call(dock.children, function (b, k) { b.setAttribute("aria-current", k === cur ? "true" : "false"); if (k === cur) document.getElementById("app").style.setProperty("--ac", b.style.getPropertyValue("--c")); });
    document.getElementById("pv").hidden = cur === 0; document.getElementById("nx").hidden = cur === N - 1;
    slides.forEach(function (s, k) { s.tabIndex = k === cur ? 0 : -1; });
  }
  // свайп
  deck.style.width = N * 100 + "vw";
  deck.addEventListener("pointerdown", function (e) { if (e.button > 0) return; drag = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, id: e.pointerId }; moved = false; });
  window.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { moved = true; deck.classList.add("drag"); try { deck.setPointerCapture(e.pointerId); } catch (x) { } }
    if (moved) { drag.dx = dx; var edge = (cur === 0 && dx > 0) || (cur === N - 1 && dx < 0) ? .3 : 1; deck.style.transform = "translateX(" + (-cur * W + dx * edge) + "px)"; }
  });
  function end(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return; var dx = drag.dx, v = dx / Math.max(1, performance.now() - drag.t); deck.classList.remove("drag");
    if (moved) { if (dx < -W * .18 || v < -.45) go(cur + 1); else if (dx > W * .18 || v > .45) go(cur - 1); else go(cur); }
    drag = null; setTimeout(function () { moved = false; }, 0);
  }
  window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
  deck.addEventListener("click", function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
  deck.addEventListener("dragstart", function (e) { e.preventDefault(); });
  slides.forEach(function (s) { if (!s.getAttribute("href")) s.addEventListener("click", function (e) { if (!e.target.closest("a")) e.preventDefault(); }); });
  document.getElementById("pv").onclick = function () { go(cur - 1); }; document.getElementById("nx").onclick = function () { go(cur + 1); };
  addEventListener("keydown", function (e) { if (e.key === "ArrowRight") go(cur + 1); else if (e.key === "ArrowLeft") go(cur - 1); });
  addEventListener("wheel", function (e) { if (Math.abs(e.deltaX) > 30 && !deck._w) { go(cur + (e.deltaX > 0 ? 1 : -1)); deck._w = 1; setTimeout(function () { deck._w = 0 }, 500); } }, { passive: true });
  addEventListener("resize", size);
  // как установить
  var how = document.getElementById("how"); document.getElementById("ins").onclick = function () { how.classList.add("on"); }; document.getElementById("hx").onclick = function () { how.classList.remove("on"); }; how.addEventListener("click", function (e) { if (e.target === how) how.classList.remove("on"); });
  // рисуем только видимые сцены
  var t0 = performance.now();
  function frame(now) {
    var t = (now - t0) / 1000, vis = [cur]; if (drag && moved || deck.classList.contains("drag")) vis = [cur - 1, cur, cur + 1]; else if (now - lastT < 0) vis = [cur];
    var offs = deck.getBoundingClientRect().left; var fr = -offs / W; vis = []; for (var k = 0; k < N; k++) if (Math.abs(k - fr) < 1) vis.push(k);
    vis.forEach(function (k) { var g = ctxs[k]; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, CW, H); window.SCENES[k](g, CW, H, rm ? window.SCENE_THUMB_T[k] : t); });
    requestAnimationFrame(frame);
  }
  size(); go(0, true);
  var rd = function () { thumbs(); }; if (document.fonts && document.fonts.ready) document.fonts.ready.then(rd);
  requestAnimationFrame(frame);
  window.__hub = { go: go, get cur() { return cur; } };
  if ("serviceWorker" in navigator && /^http/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(function () { });
})();
