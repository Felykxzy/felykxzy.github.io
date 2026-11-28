(function () {
  "use strict";
  var API = "https://api.opendota.com/api/", CDN = "https://cdn.cloudflare.steamstatic.com";
  var GROUPS = [
    { id: "all", n: "Все ранги", b: [1, 2, 3, 4, 5, 6, 7, 8] },
    { id: "low", n: "Рекрут–Рыцарь", b: [1, 2, 3] },
    { id: "mid", n: "Герой–Легенда", b: [4, 5] },
    { id: "high", n: "Властелин–Титан", b: [6, 7, 8] }
  ];
  var BR = ["Рекрут", "Страж", "Рыцарь", "Герой", "Легенда", "Властелин", "Божество", "Титан"];
  var ATTR = [["", "Все"], ["str", "Сила"], ["agi", "Ловкость"], ["int", "Интеллект"], ["all", "Универсал"]];
  var st = { grp: "all", attr: "", q: "", sort: "wr", cmp: "", heroes: [], byId: {}, hist: [], patch: null };
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pct(x) { return (x * 100).toFixed(1).replace(".", ",") + "%"; }
  function get(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function cached(key, url, ttl) {
    try { var c = JSON.parse(sessionStorage.getItem(key)); if (c && Date.now() - c.t < (ttl || 6e5)) return Promise.resolve(c.v); } catch (e) { }
    return get(url).then(function (v) { try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v: v })); } catch (e) { } return v; });
  }

  // сколько игр и побед у героя в группе рангов
  function sumGrp(h, g) {
    var p = 0, w = 0;
    g.b.forEach(function (i) { p += h[i + "_pick"] || 0; w += h[i + "_win"] || 0; });
    return [p, w];
  }
  function grpArr(h) { // 6 чисел для снимка: low, mid, high
    var o = [];
    ["low", "mid", "high"].forEach(function (id) { var s = sumGrp(h, GROUPS.filter(function (g) { return g.id === id; })[0]); o.push(s[0], s[1]); });
    return o;
  }
  function snapGrp(arr, gid) { // из снимка в нужную группу
    var idx = { low: [0], mid: [1], high: [2], all: [0, 1, 2] }[gid], p = 0, w = 0;
    idx.forEach(function (k) { p += arr[k * 2]; w += arr[k * 2 + 1]; });
    return [p, w];
  }

  function buildChips() {
    var r = $("rk"); r.innerHTML = "";
    GROUPS.forEach(function (g) { r.appendChild(chip(g.n, st.grp === g.id, function () { st.grp = g.id; buildChips(); render(); })); });
    var a = $("at"); a.innerHTML = "";
    ATTR.forEach(function (x) { a.appendChild(chip(x[1], st.attr === x[0], function () { st.attr = x[0]; buildChips(); render(); })); });
  }
  function chip(t, on, fn) { var b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.textContent = t; b.setAttribute("aria-pressed", on); b.onclick = fn; return b; }

  function baseSnap() {
    if (!st.cmp) return null;
    return st.hist.filter(function (s) { return s.d === st.cmp; })[0] || null;
  }
  function render() {
    var g = GROUPS.filter(function (x) { return x.id === st.grp; })[0], base = baseSnap(), rows = [], tot = [];
    st.heroes.forEach(function (h) { tot.push(sumGrp(h, g)[0]); });
    tot.sort(function (a, b) { return a - b; });
    var minPick = Math.max(150, (tot[tot.length >> 1] || 0) * 0.25);
    st.heroes.forEach(function (h) {
      if (st.attr && h.primary_attr !== st.attr) return;
      if (st.q && h.localized_name.toLowerCase().indexOf(st.q) < 0) return;
      var s = sumGrp(h, g), wr = s[0] ? s[1] / s[0] : 0, d = null;
      if (base && base.h[h.id]) { var b = snapGrp(base.h[h.id], g.id); if (b[0] > 100 && s[0] > 100) d = (wr - b[1] / b[0]) * 100; }
      rows.push({ h: h, p: s[0], wr: wr, d: d, low: s[0] < minPick });
    });
    var so = st.sort;
    rows.sort(function (a, b) {
      if (so === "pk") return b.p - a.p;
      if (so === "dl" || so === "dd") { var x = a.d === null ? -99 * (so === "dl" ? 1 : -1) : a.d, y = b.d === null ? -99 * (so === "dl" ? 1 : -1) : b.d; return so === "dl" ? y - x : x - y; }
      if (a.low !== b.low) return a.low ? 1 : -1;
      return b.wr - a.wr;
    });
    var ls = $("ls"); ls.innerHTML = "";
    if (!rows.length) { ls.innerHTML = '<p class="note">Ничего не найдено.</p>'; return; }
    rows.forEach(function (r, i) {
      var b = document.createElement("button"); b.type = "button"; b.className = "h";
      var dd = r.d === null ? "" : '<span class="d ' + (r.d > 0.05 ? "up" : r.d < -0.05 ? "dn" : "fl") + '">' + (r.d > 0.05 ? "▲ +" : r.d < -0.05 ? "▼ " : "• ") + r.d.toFixed(1).replace(".", ",") + '</span>';
      b.innerHTML = '<img class="ic" loading="lazy" alt="" src="' + CDN + esc(r.h.icon.replace(/\?.*$/, "")) + '"><div><div class="nm">' + esc(r.h.localized_name) + '</div><div class="sub">' + r.p.toLocaleString("ru") + " игр" + (r.low ? " · мало данных" : "") + '</div><div class="bar"><i style="width:' + Math.max(4, Math.min(100, (r.wr - .4) / .2 * 100)) + '%"></i></div></div><div class="wr">' + pct(r.wr) + dd + "</div>";
      b.onclick = function () { openHero(r.h); };
      ls.appendChild(b);
    });
  }

  // карточка героя
  var ITEMS = null;
  function loadItems() {
    if (ITEMS) return Promise.resolve(ITEMS);
    try { var c = JSON.parse(localStorage.getItem("dota_items")); if (c && Date.now() - c.t < 7 * 864e5) { ITEMS = c.v; return Promise.resolve(ITEMS); } } catch (e) { }
    return get(API + "constants/items").then(function (all) {
      var m = {};
      Object.keys(all).forEach(function (k) { var it = all[k]; if (it && it.id) m[it.id] = { n: it.dname || k, i: (it.img || "").replace(/\?.*$/, ""), c: it.cost || 0, q: it.qual || "", k: k }; });
      ITEMS = m; try { localStorage.setItem("dota_items", JSON.stringify({ t: Date.now(), v: m })); } catch (e) { }
      return m;
    });
  }
  function openHero(h) {
    var dl = $("dl"), sh = $("sh");
    var g = GROUPS[0], br = [];
    for (var i = 1; i <= 8; i++) { var p = h[i + "_pick"] || 0; br.push([p, p ? (h[i + "_win"] || 0) / p : 0]); }
    var s = sumGrp(h, g);
    sh.innerHTML = '<div class="top"><img class="ic" alt="" src="' + CDN + esc(h.icon.replace(/\?.*$/, "")) + '"><div><div class="nm" style="font:700 20px var(--head)">' + esc(h.localized_name) + '</div><div class="sub">' + esc((h.roles || []).join(", ")) + " · винрейт " + pct(s[1] / s[0]) + '</div></div><button class="x" type="button" aria-label="Закрыть" id="cl">×</button></div>' +
      "<h3>Винрейт по рангам</h3>" + '<div class="rk">' + br.map(function (x, k) { return "<div>" + (x[0] > 200 ? "<span>" + (x[1] * 100).toFixed(0) + "</span><b style=\"height:" + Math.max(4, Math.min(100, (x[1] - .4) / .2 * 100)) + '%"></b>' : "<span>–</span><b style=\"height:3px;opacity:.3\"></b>") + "<small>" + BR[k].slice(0, 4) + "</small></div>"; }).join("") + "</div>" +
      '<div id="det"><div class="sk" style="margin-top:16px"></div></div>';
    $("cl").onclick = function () { dl.close(); };
    if (!dl.open) dl.showModal();
    Promise.all([loadItems(), cached("ip" + h.id, API + "heroes/" + h.id + "/itemPopularity"),
      cached("mu" + h.id, API + "heroes/" + h.id + "/matchups").catch(function () { return []; }),
      cached("tm" + h.id, API + "scenarios/itemTimings?hero_id=" + h.id).catch(function () { return []; })]).then(function (r) {
      var items = r[0], pop = r[1], mu = r[2], tm = r[3], out = "";
      var PH = [["start_game_items", "Старт"], ["early_game_items", "Начало игры"], ["mid_game_items", "Середина"], ["late_game_items", "Конец игры"]];
      out += "<h3>Что собирать</h3>";
      PH.forEach(function (ph) {
        var o = pop[ph[0]] || {}, arr = Object.keys(o).map(function (id) { return [items[id], o[id]]; }).filter(function (x) {
          var it = x[0]; if (!it) return false; if (/^recipe/.test(it.k)) return false;
          if (ph[0] !== "start_game_items" && (it.q === "consumable" || it.c < 400)) return false; return true;
        }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);
        if (!arr.length) return;
        out += '<div class="ph">' + ph[1] + '</div><div class="items">' + arr.map(function (x) { return '<div class="it"><img loading="lazy" alt="" src="' + CDN + esc(x[0].i) + '" onerror="this.style.visibility=\'hidden\'">' + esc(x[0].n) + "</div>"; }).join("") + "</div>";
      });
      // тайминги: во сколько куплен предмет и какой винрейт, если успел к этому времени
      var byKey = {}; Object.keys(items).forEach(function (id) { byKey[items[id].k] = items[id]; });
      var tg = {}, times = {};
      (tm || []).forEach(function (x) { var g = +x.games, w = +x.wins; if (!byKey[x.item] || !g) return; (tg[x.item] = tg[x.item] || { n: 0, c: {} }).n += g; tg[x.item].c[x.time] = [g, w]; times[x.time] = 1; });
      var tl = Object.keys(times).map(Number).sort(function (a, b) { return a - b; });
      var ti = Object.keys(tg).filter(function (k) { return tg[k].n >= 80; }).sort(function (a, b) { return tg[b].n - tg[a].n; }).slice(0, 7);
      if (ti.length) {
        out += "<h3>Тайминги предметов</h3><p class=\"sub\" style=\"margin:0 0 8px\">Цифра в клетке: винрейт героя, если предмет собран к этой минуте. Зелёная клетка значит, что так играть выгоднее. Серая значит, что данных мало.</p>";
        ti.forEach(function (k) {
          var it = byKey[k], row = tg[k], best = -1, bw = 0;
          tl.forEach(function (t) { var c = row.c[t]; if (c && c[0] >= 25) { var w = c[1] / c[0]; if (w > bw) { bw = w; best = t; } } });
          out += '<div class="tmr"><div class="tmh"><img class="ic" loading="lazy" alt="" src="' + CDN + esc(it.i) + '" onerror="this.style.visibility=\'hidden\'"><b>' + esc(it.n) + "</b></div><div class=\"tmg\" style=\"grid-template-columns:repeat(" + tl.length + ',1fr)">' +
            tl.map(function (t) { var c = row.c[t], lbl = Math.floor(t / 60) + (t % 60 ? ":" + String(t % 60).padStart(2, "0") : ""); if (!c || c[0] < 25) return '<div class="tc0"><small>' + lbl + "</small><span>–</span></div>"; var w = c[1] / c[0]; return '<div class="' + (t === best ? "tcb" : w >= .5 ? "tcu" : "tcd") + '"><small>' + lbl + "</small><span>" + Math.round(w * 100) + "</span></div>"; }).join("") + "</div></div>";
        });
      }
      // матчапы: игр мало, поэтому считаем со сглаживанием и прячем совсем редкие
      var list = mu.filter(function (m) { return m.games_played >= 12 && st.byId[m.hero_id]; }).map(function (m) { return { h: st.byId[m.hero_id], wr: m.wins / m.games_played, n: m.games_played, s: (m.wins + 8) / (m.games_played + 16) }; });
      list.sort(function (a, b) { return b.s - a.s; });
      function vr(arr) { return arr.map(function (x) { return '<div class="vr"><img class="ic" alt="" src="' + CDN + esc(x.h.icon.replace(/\?.*$/, "")) + '">' + esc(x.h.localized_name) + "<em class=\"" + (x.wr >= .5 ? "up" : "dn") + '">' + pct(x.wr) + " <small>" + x.n + " игр</small></em></div>"; }).join(""); }
      out += '<h3>Против кого играть</h3>';
      if (list.length >= 4) out += '<div class="vs"><div><div class="ph">Силён против</div>' + vr(list.slice(0, 6)) + '</div><div><div class="ph">Слаб против</div>' + vr(list.slice(-6).reverse()) + "</div></div><p class=\"sub\">Игр на каждую пару мало, поэтому цифры примерные.</p>";
      else out += '<p class="sub">Пока мало данных по этому герою.</p>';
      $("det").innerHTML = out;
    }).catch(function () { $("det").innerHTML = '<div class="err">Не получилось загрузить подробности. Проверь интернет и нажми на героя ещё раз.</div>'; });
  }

  function init() {
    buildChips();
    $("q").oninput = function () { st.q = this.value.trim().toLowerCase(); render(); };
    $("so").onchange = function () { st.sort = this.value; render(); };
    $("cmp").onchange = function () { st.cmp = this.value; render(); };
    $("dl").addEventListener("click", function (e) { if (e.target === this) this.close(); });
    Promise.all([
      cached("hs", API + "heroStats", 3e5),
      get("data/history.json").catch(function () { return { snaps: [] }; }),
      cached("pt", API + "constants/patch", 36e5).catch(function () { return []; })
    ]).then(function (r) {
      st.heroes = r[0]; r[0].forEach(function (h) { st.byId[h.id] = h; });
      st.hist = (r[1].snaps || []).slice().sort(function (a, b) { return a.d < b.d ? -1 : 1; });
      var pt = r[2]; st.patch = pt && pt.length ? pt[pt.length - 1] : null;
      var meta = "Патч " + (st.patch ? st.patch.name : "?");
      if (st.patch && st.patch.date) meta += " · вышел " + new Date(st.patch.date).toLocaleDateString("ru", { day: "numeric", month: "long" });
      $("meta").textContent = meta + " · нажми на героя, чтобы увидеть сборку";
      // варианты сравнения
      var sel = $("cmp"), today = new Date(), opts = [];
      function dayBefore(n) { var t = new Date(today.getTime() - n * 864e5).toISOString().slice(0, 10); var c = st.hist.filter(function (s) { return s.d <= t; }); return c.length ? c[c.length - 1] : null; }
      var o7 = dayBefore(7), o30 = dayBefore(30), pp = null;
      if (st.patch && st.patch.date) { var pd = new Date(st.patch.date).toISOString().slice(0, 10); var cs = st.hist.filter(function (s) { return s.d <= pd; }); pp = cs.length ? cs[cs.length - 1] : null; }
      if (pp) opts.push([pp.d, "Изменение с патча " + st.patch.name]);
      if (o7) opts.push([o7.d, "Изменение за неделю"]);
      if (o30) opts.push([o30.d, "Изменение за месяц"]);
      sel.innerHTML = '<option value="">Без сравнения</option>' + opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("");
      if (!opts.length) { sel.innerHTML = '<option value="">Сравнение появится через пару дней</option>'; sel.disabled = true; }
      else { st.cmp = opts[0][0]; sel.value = st.cmp; }
      render();
    }).catch(function () {
      $("meta").textContent = "";
      $("ls").innerHTML = '<div class="err">Не получилось загрузить данные OpenDota. Проверь интернет и обнови страницу. Иногда сервис сам просит подождать минуту.</div>';
    });
  }
  init();
})();
