(function () {
  "use strict";
  var MR = "https://api.modrinth.com/v2";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function num(n) { return n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + "M" : n >= 1e3 ? Math.floor(n / 1e3) + "k" : String(n); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---- жанры и названия ----
  var CHIPS = [["Оптимизация", "оптимизация"], ["Шейдеры", "шейдеры"], ["Магия", "магия"], ["Техно", "техно"], ["Приключения", "приключения"], ["Мобы", "мобы"], ["Декор", "декор"], ["Еда", "еда"], ["Оружие и броня", "оружие"], ["Хранилища", "хранилища"], ["Миникарта", "миникарта"], ["Транспорт", "транспорт"], ["Выживание", "выживание"], ["Удобства", "утилиты"]];
  var GENRES = [
    ["optimization", ["оптимиз", "фпс", "fps", "лаг", "производитель", "optimiz", "perform", "быстр"]],
    ["magic", ["маг", "колдов", "заклин", "ведьм", "magic", "spell", "wizard"]],
    ["technology", ["техно", "механизм", "автоматиз", "завод", "tech", "automat", "machine", "factory"]],
    ["adventure", ["приключ", "данж", "босс", "подзем", "adventure", "dungeon", "quest", "квест"]],
    ["worldgen", ["генерац", "биом", "структур", "деревн", "worldgen", "biome", "structure"]],
    ["mobs", ["моб", "существа", "животн", "монстр", "creature", "animal"]],
    ["decoration", ["декор", "красив", "мебел", "строител", "строй", "decor", "furniture", "build"]],
    ["equipment", ["оружи", "брон", "инструмент", "weapon", "armor", "tool"]],
    ["food", ["еда", "готов", "кулинар", "food", "cook", "farm", "ферм"]],
    ["storage", ["хранил", "сундук", "инвентар", "storage", "chest", "backpack", "рюкзак"]],
    ["transportation", ["транспорт", "поезд", "машин", "самолёт", "самолет", "vehicle", "transport", "train"]],
    ["utility", ["утилит", "удобств", "utility", "qol"]],
    ["game-mechanics", ["механик", "выжива", "survival", "mechanic", "hardcore", "хардкор"]]
  ];
  var PRESETS = [
    [["шейдер", "shader", "график", "graphic", "реалист"], ["Iris Shaders", "Sodium"]],
    [["миникарт", "minimap", "карта"], ["Xaero's Minimap"]],
    [["рецепт", "jei", "recipe"], ["Just Enough Items"]]
  ];
  var BASE = { fabric: ["Sodium", "Lithium", "FerriteCore", "Mod Menu"], quilt: ["Sodium", "Lithium", "FerriteCore"], forge: ["Embeddium", "FerriteCore", "Canary"], neoforge: ["Sodium", "FerriteCore"] };
  var GENRE_LABELS = [["Любой жанр", ""], ["Оптимизация", "optimization"], ["Магия", "magic"], ["Техно", "technology"], ["Приключения", "adventure"], ["Мобы", "mobs"], ["Декор", "decoration"], ["Еда", "food"], ["Оружие и броня", "equipment"], ["Хранилища", "storage"], ["Транспорт", "transportation"], ["Генерация мира", "worldgen"], ["Удобства", "utility"], ["Механики", "game-mechanics"]];
  var DEP_KEY = { fabric: "fabric-loader", quilt: "quilt-loader", forge: "forge", neoforge: "neoforge" };

  function parseWish(text) {
    var genres = [], names = [];
    String(text || "").split(/[,;\n]+/).forEach(function (part) {
      var p = part.trim(); if (!p) return;
      var low = p.toLowerCase(), hit = false;
      GENRES.forEach(function (g) { if (g[1].some(function (k) { return low.indexOf(k) >= 0; })) { if (genres.indexOf(g[0]) < 0) genres.push(g[0]); hit = true; } });
      PRESETS.forEach(function (pr) { if (pr[0].some(function (k) { return low.indexOf(k) >= 0; })) { pr[1].forEach(function (m) { if (names.indexOf(m) < 0) names.push(m); }); hit = true; } });
      if (!hit && names.indexOf(p) < 0) names.push(p);
    });
    return { genres: genres, names: names };
  }

  // ---- сеть ----
  function api(url, tries) {
    tries = tries || 0;
    return fetch(url).then(function (r) {
      if (r.status === 429 && tries < 6) return sleep(((+r.headers.get("retry-after") || 0) * 1000) || (1500 + tries * 2000)).then(function () { return api(url, tries + 1); });
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  function catOf(loader) { return loader === "quilt" ? ["quilt", "fabric"] : [loader]; }
  function search(ctx, query, genre, limit, offset) {
    var facets = [["project_type:mod"], ["versions:" + ctx.mc], catOf(ctx.loader).map(function (l) { return "categories:" + l; }), ["categories!=library"]];
    if (genre) facets.push(["categories:" + genre]);
    return api(MR + "/search?query=" + encodeURIComponent(query || "") + "&facets=" + encodeURIComponent(JSON.stringify(facets)) + "&limit=" + (limit || 12) + (offset ? "&offset=" + offset : "") + "&index=" + (query ? "relevance" : "downloads")).then(function (r) { return r.hits || []; });
  }
  function version(ctx, pid) {
    return api(MR + "/project/" + pid + "/version?loaders=" + encodeURIComponent(JSON.stringify(catOf(ctx.loader))) + "&game_versions=" + encodeURIComponent(JSON.stringify([ctx.mc]))).then(function (vs) {
      if (!vs.length) return null;
      var rel = vs.filter(function (v) { return v.version_type === "release"; });
      return (rel.length ? rel : vs)[0];
    });
  }

  // ---- сборка ----
  function Ctx(mc, loader, log, per, base, target) {
    this.mc = mc; this.loader = loader; this.log = log; this.per = per; this.base = base;
    this.mods = []; this.missing = []; this.seen = {}; this.seenIds = {}; this.target = target || 0; this.max = Math.max(40, this.target + 40);
  }
  Ctx.prototype.addMr = function (pid, title, why, icon, depth) {
    var ctx = this; depth = depth || 0;
    if (ctx.seenIds[pid] || ctx.seen[norm(title)]) return Promise.resolve(true);
    return version(ctx, pid).then(function (v) {
      if (!v) return false;
      var f = (v.files || []).filter(function (x) { return x.primary; })[0] || (v.files || [])[0];
      if (!f) return false;
      if (ctx.seenIds[pid]) return true;
      ctx.seenIds[pid] = 1; ctx.seen[norm(title)] = 1;
      ctx.mods.push({ title: title, icon: icon || "", file: f, why: why });
      ctx.log("  + " + title, "ok");
      if (depth >= 4) return true;
      var deps = (v.dependencies || []).filter(function (d) { return d.dependency_type === "required" && d.project_id; });
      return deps.reduce(function (chain, d) {
        return chain.then(function () {
          return api(MR + "/project/" + d.project_id).then(function (p) { return ctx.addMr(d.project_id, p.title || d.project_id, "нужен для «" + title + "»", p.icon_url, depth + 1); }).catch(function () { });
        });
      }, Promise.resolve()).then(function () { return true; });
    });
  };
  Ctx.prototype.addByName = function (name, why) {
    var ctx = this;
    if (ctx.mods.length >= ctx.max) return Promise.resolve();
    return search(ctx, name, "", 5).then(function (hits) {
      var cand = hits.filter(function (h) { return norm(h.title).indexOf(norm(name)) >= 0 || norm(name).indexOf(norm(h.title)) >= 0; });
      return cand.reduce(function (chain, h) {
        return chain.then(function (done) { return done ? true : ctx.addMr(h.project_id, h.title, why, h.icon_url); });
      }, Promise.resolve(false));
    }).catch(function (e) { ctx.log("  Modrinth не ответил на «" + name + "»", "w"); return false; }).then(function (done) {
      if (!done) { ctx.missing.push(name); ctx.log("  – «" + name + "»: не нашёл для " + ctx.loader + " " + ctx.mc, "w"); }
    });
  };
  Ctx.prototype.addGenre = function (genre) {
    var ctx = this, got = 0;
    ctx.log("Жанр «" + genre + "»:", "h");
    return search(ctx, "", genre, ctx.per * 3 + 3).then(function (hits) {
      return hits.reduce(function (chain, h) {
        return chain.then(function () {
          if (got >= ctx.per || ctx.mods.length >= ctx.max) return;
          var n = ctx.mods.length;
          return ctx.addMr(h.project_id, h.title, "жанр «" + genre + "»", h.icon_url).then(function () { if (ctx.mods.length > n) got++; });
        });
      }, Promise.resolve());
    }).catch(function () { ctx.log("  Modrinth не ответил", "w"); }).then(function () { if (!got) ctx.log("  ничего подходящего для " + ctx.loader + " " + ctx.mc, "w"); });
  };
  Ctx.prototype.run = function (wish, manual) {
    var ctx = this, w = parseWish(wish), names = w.names.slice();
    ctx.log("Версия " + ctx.mc + ", загрузчик " + ctx.loader, "h");
    var base = BASE[ctx.loader] || [];
    if (ctx.base && w.genres.indexOf("optimization") < 0) names = base.concat(names.filter(function (n) { return base.indexOf(n) < 0; }));
    var chain = Promise.resolve();
    manual.forEach(function (m) {
      chain = chain.then(function () { ctx.log("Выбрано тобой: " + m.title, "h"); return ctx.addMr(m.id, m.title, "выбрано вручную", m.icon).then(function (ok) { if (!ok) { ctx.missing.push(m.title); ctx.log("  – «" + m.title + "»: нет версии для " + ctx.loader + " " + ctx.mc, "w"); } }); });
    });
    names.forEach(function (n) { chain = chain.then(function () { ctx.log("Ищу «" + n + "»:", "h"); return ctx.addByName(n, base.indexOf(n) >= 0 ? "базовая оптимизация" : "ты просил"); }); });
    w.genres.forEach(function (g) { chain = chain.then(function () { return ctx.addGenre(g); }); });
    if (ctx.target) chain = chain.then(function () { return ctx.topUp(w.genres); });
    return chain.then(function () { return ctx.mods; });
  };
  // Добор до нужного размера: самые популярные моды по жанрам, страница за страницей
  Ctx.prototype.topUp = function (chosen) {
    var ctx = this;
    if (ctx.mods.length >= ctx.target) return Promise.resolve();
    var order = chosen.concat(["utility", "optimization", "adventure", "decoration", "technology", "magic", "mobs", "equipment", "food", "storage", "worldgen", "transportation", "game-mechanics"].filter(function (g) { return chosen.indexOf(g) < 0; }));
    ctx.log("Добираю до " + ctx.target + " модов самыми популярными…", "h");
    var page = 0, idle = 0;
    function round() {
      if (ctx.mods.length >= ctx.target || page >= 6 || idle >= order.length) return Promise.resolve();
      var before = ctx.mods.length;
      var chain = Promise.resolve();
      order.forEach(function (g) {
        chain = chain.then(function () {
          if (ctx.mods.length >= ctx.target) return;
          return search(ctx, "", g, 20, page * 20).then(function (hits) {
            return hits.reduce(function (c, h) {
              return c.then(function () {
                if (ctx.mods.length >= ctx.target) return;
                var n = ctx.mods.length;
                return ctx.addMr(h.project_id, h.title, "популярный, жанр «" + g + "»", h.icon_url).then(function () { if (ctx.mods.length > n && ctx.mods.length % 10 < (ctx.mods.length - n)) ctx.log("  …уже " + ctx.mods.length + " модов", "ok"); });
              });
            }, Promise.resolve());
          }).catch(function () { });
        });
      });
      return chain.then(function () { idle = ctx.mods.length === before ? idle + 1 : 0; page++; return round(); });
    }
    return round().then(function () { if (ctx.mods.length < ctx.target) ctx.log("Нашлось только " + ctx.mods.length + ": для этой версии больше подходящих модов нет.", "w"); });
  };

  function loaderVersion(mc, loader) {
    if (loader === "fabric") return api("https://meta.fabricmc.net/v2/versions/loader").then(function (l) { var s = l.filter(function (x) { return x.stable; })[0]; if (!s) throw new Error("нет версии"); return s.version; });
    if (loader === "quilt") return api("https://meta.quiltmc.org/v3/versions/loader").then(function (l) { return l[0].version; });
    if (loader === "forge") return api("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json").then(function (r) { var v = r.promos[mc + "-recommended"] || r.promos[mc + "-latest"]; if (!v) throw new Error("нет версии"); return v; });
    var parts = mc.split("."), pre = parts[1] + "." + (parts[2] || "0") + ".";
    return api("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge").then(function (r) { var vs = r.versions.filter(function (v) { return v.indexOf(pre) === 0 && !/alpha|beta/.test(v); }); if (!vs.length) throw new Error("нет версии"); return vs[vs.length - 1]; });
  }

  // ---- простой zip без сжатия (для .mrpack) ----
  var CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function makeZip(files) {
    var enc = new TextEncoder(), parts = [], cd = [], off = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.data, crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      cd.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    });
    var cdSize = cd.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(cd, [new Uint8Array(end.buffer)]), { type: "application/x-modrinth-modpack+zip" });
  }
  function makePack(ctx, lv, name) {
    var deps = { minecraft: ctx.mc };
    if (lv) deps[DEP_KEY[ctx.loader]] = lv;
    var index = {
      formatVersion: 1, game: "minecraft", versionId: "1.0.0", name: name, summary: "Сборка из сборщика модов Зекси",
      files: ctx.mods.map(function (m) { return { path: "mods/" + m.file.filename, hashes: { sha1: m.file.hashes.sha1, sha512: m.file.hashes.sha512 }, env: { client: "required", server: "required" }, downloads: [m.file.url], fileSize: m.file.size }; }),
      dependencies: deps
    };
    return makeZip([{ name: "modrinth.index.json", data: new TextEncoder().encode(JSON.stringify(index, null, 2)) }]);
  }

  // ---- интерфейс ----
  var st = { chips: {}, manual: {}, running: false };
  function save() { try { localStorage.setItem("mcb", JSON.stringify({ chips: Object.keys(st.chips), extra: $("extra").value, mc: $("mc").value, ld: $("ld").value, per: $("per").value, size: $("size").value, base: $("base").checked })); } catch (e) { } }
  function load() { try { return JSON.parse(localStorage.getItem("mcb")) || {}; } catch (e) { return {}; } }
  function buildChips() {
    var box = $("chips"); box.innerHTML = "";
    CHIPS.forEach(function (c) {
      var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = c[0]; b.setAttribute("aria-pressed", !!st.chips[c[1]]);
      b.onclick = function () { if (st.chips[c[1]]) delete st.chips[c[1]]; else st.chips[c[1]] = 1; b.setAttribute("aria-pressed", !!st.chips[c[1]]); save(); };
      box.appendChild(b);
    });
  }
  function manualN() { var k = Object.keys(st.manual); $("manualN").textContent = "Вручную выбрано: " + k.length + (k.length ? " (" + k.slice(0, 3).map(function (i) { return st.manual[i].title; }).join(", ") + (k.length > 3 ? "…" : "") + ")" : ""); }
  function logLine(t, cls) { var l = $("log"); l.hidden = false; var s = document.createElement("div"); if (cls) s.className = cls; s.textContent = t; l.appendChild(s); l.scrollTop = l.scrollHeight; }
  function tile(m) { return m.icon ? '<img class="ic" loading="lazy" alt="" src="' + esc(m.icon) + '" onerror="this.outerHTML=\'<div class=ic>' + esc((m.title || "?").charAt(0).toUpperCase()) + '</div>\'">' : '<div class="ic">' + esc((m.title || "?").charAt(0).toUpperCase()) + "</div>"; }


  // ---- ИИ через OpenRouter (у каждого свой ключ) ----
  var AI_KEYS = ["optimization", "magic", "technology", "adventure", "worldgen", "mobs", "decoration", "equipment", "food", "storage", "transportation", "utility", "game-mechanics"];
  function aiCfg() { try { return JSON.parse(localStorage.getItem("mcbai")) || {}; } catch (e) { return {}; } }
  function aiAsk(key, model, text, mc, loader, want) {
    var sys = "Ты помощник по сборкам модов Minecraft. Игрок описывает, какую сборку хочет. Подбери до " + want + " реально существующих модов для Minecraft " + mc + " и загрузчика " + loader + ". Называй моды точно так, как они называются на Modrinth (например: Sodium, Create, Xaero's Minimap). Не придумывай несуществующих. Ответь ТОЛЬКО JSON без пояснений и без markdown: {\"mods\":[\"название\"],\"genres\":[ключи из списка: " + AI_KEYS.join(", ") + "],\"note\":\"одно короткое предложение по-русски, что получилось\"}.";
    return fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json", "HTTP-Referer": location.origin, "X-Title": "Zeksi modpack builder" },
      body: JSON.stringify({ model: model, temperature: 0.3, max_tokens: 3000, messages: [{ role: "system", content: sys }, { role: "user", content: text }] })
    }).then(function (r) {
      if (r.status === 401) throw new Error("Ключ не подошёл. Проверь, что скопировал его целиком.");
      if (r.status === 402) throw new Error("На ключе нет денег. Пополни баланс на openrouter.ai или выбери модель с :free.");
      if (r.status === 429) throw new Error("Слишком много запросов. Подожди минуту и попробуй ещё раз.");
      if (!r.ok) throw new Error("ИИ не ответил (код " + r.status + "). Попробуй другую модель.");
      return r.json();
    }).then(function (d) {
      var t = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content || "";
      var m = String(t).match(/\{[\s\S]*\}/);
      if (!m) throw new Error("ИИ ответил не так, как нужно. Попробуй ещё раз или другую модель.");
      var o; try { o = JSON.parse(m[0]); } catch (e) { throw new Error("ИИ ответил не так, как нужно. Попробуй ещё раз или другую модель."); }
      var mods = (Array.isArray(o.mods) ? o.mods : []).map(function (x) { return String(x).trim(); }).filter(function (x) { return x && x.length < 60 && x.indexOf(",") < 0; }).slice(0, want);
      var genres = (Array.isArray(o.genres) ? o.genres : []).filter(function (g) { return AI_KEYS.indexOf(g) >= 0; });
      return { mods: mods, genres: genres, note: String(o.note || "") };
    });
  }
  function aiGo() {
    if (st.running) return;
    var text = $("aiText").value.trim(), key = $("aiKey").value.trim(), model = $("aiModel").value.trim() || "openai/gpt-4o-mini";
    if (!text) { $("res").innerHTML = '<div class="err">Напиши, какую сборку хочешь.</div>'; return; }
    if (!key) { $("aiSet").open = true; $("res").innerHTML = '<div class="err">Вставь ключ OpenRouter в поле «Ключ и модель».</div>'; $("aiKey").focus(); return; }
    try { localStorage.setItem("mcbai", JSON.stringify($("aiSave").checked ? { key: key, model: model, save: true, text: text } : { model: model, text: text })); } catch (e) { }
    $("aiGo").disabled = true; $("aiGo").textContent = "ИИ думает…"; $("res").innerHTML = ""; $("log").innerHTML = "";
    aiAsk(key, model, text, $("mc").value, $("ld").value, Math.min(60, Math.max(12, +$("size").value || 12))).then(function (a) {
      var kw = a.genres.map(function (g) { return GENRES.filter(function (x) { return x[0] === g; })[0][1][0]; });
      var all = a.mods.concat(kw);
      if (!all.length) throw new Error("ИИ ничего не подобрал. Опиши подробнее.");
      $("extra").value = all.join(", "); st.chips = {}; buildChips(); save();
      $("aiGo").disabled = false; $("aiGo").textContent = "Подобрать с ИИ и собрать";
      go();
      logLine("ИИ подобрал: " + all.join(", "), "h"); if (a.note) logLine(a.note, "ok");
    }).catch(function (e) {
      $("aiGo").disabled = false; $("aiGo").textContent = "Подобрать с ИИ и собрать";
      $("res").innerHTML = '<div class="err">' + esc(e && e.message || "Не получилось. Проверь интернет.") + "</div>";
    });
  }
  function go() {
    if (st.running) return;
    var wish = Object.keys(st.chips).concat($("extra").value.split(",").map(function (x) { return x.trim(); }).filter(Boolean)).join(", ");
    var manual = Object.keys(st.manual).map(function (id) { return { id: id, title: st.manual[id].title, icon: st.manual[id].icon }; });
    if (!wish && !manual.length) { $("res").innerHTML = '<div class="err">Выбери жанры, впиши названия или добавь моды вручную.</div>'; return; }
    save(); st.running = true; $("go").disabled = true; $("bar").hidden = false; $("log").innerHTML = ""; $("res").innerHTML = "";
    var ctx = new Ctx($("mc").value, $("ld").value, logLine, +$("per").value, $("base").checked, +$("size").value);
    ctx.run(wish, manual).then(function () {
      if (!ctx.mods.length) { $("res").innerHTML = '<div class="err">Ничего не нашлось. Попробуй другую версию Minecraft, другой загрузчик или другие слова.</div>'; return; }
      logLine("Узнаю версию загрузчика…", "h");
      return loaderVersion(ctx.mc, ctx.loader).catch(function () { logLine("Версию загрузчика узнать не удалось, Prism предложит выбрать её сам.", "w"); return null; }).then(function (lv) {
        var blob = makePack(ctx, lv, "Моя сборка"), url = URL.createObjectURL(blob);
        logLine("Готово: модов " + ctx.mods.length, "ok");
        var h = '<div class="card"><h2>Сборка готова: ' + ctx.mods.length + " модов</h2><p class=\"hint\">Minecraft " + esc(ctx.mc) + ", " + esc(ctx.loader) + (lv ? " " + esc(lv) : "") + '</p><a class="btn go dl" href="' + url + '" download="my-modpack.mrpack">Скачать сборку (.mrpack)</a>' +
          '<p class="note">В Prism Launcher: Добавить экземпляр → Импорт → выбери этот файл. Prism сам скачает все моды. Если ты на телефоне, перешли файл на компьютер (AirDrop, Telegram).</p><div class="mods">' +
          ctx.mods.map(function (m) { return '<div class="m" style="cursor:default">' + tile(m) + "<div><b>" + esc(m.title) + "</b><span>" + esc(m.why) + "</span></div></div>"; }).join("") + "</div>";
        if (ctx.missing.length) h += '<p class="note">Не нашёл для этой версии и загрузчика: ' + ctx.missing.map(esc).join(", ") + ". Ищи их на CurseForge или попробуй программу для компьютера.</p>";
        $("res").innerHTML = h + "</div>";
      });
    }).catch(function (e) { $("res").innerHTML = '<div class="err">Ошибка: ' + esc(e.message || e) + ". Проверь интернет и попробуй ещё раз.</div>"; }).then(function () { st.running = false; $("go").disabled = false; $("bar").hidden = true; });
  }

  // каталог
  var cat = { token: 0, hits: [], sel: {} };
  function drawCat() {
    var l = $("dlist"); l.innerHTML = "";
    cat.hits.forEach(function (h) {
      var b = document.createElement("button"); b.type = "button"; b.className = "m" + (cat.sel[h.project_id] ? " sel" : "");
      var tag = st.manual[h.project_id] ? "✓ в сборке" : cat.sel[h.project_id] ? "выбрано" : "";
      b.innerHTML = tile({ icon: h.icon_url, title: h.title }) + "<div><b>" + esc(h.title) + "</b><span>" + esc((h.description || "").slice(0, 110)) + "</span><em>" + num(h.downloads || 0) + " скачиваний</em></div><div class=\"tag\">" + tag + "</div>";
      b.onclick = function () { if (cat.sel[h.project_id]) delete cat.sel[h.project_id]; else cat.sel[h.project_id] = h; drawCat(); };
      l.appendChild(b);
    });
  }
  function searchCat() {
    var t = ++cat.token;
    $("dinfo").textContent = "Ищу…";
    search({ mc: $("mc").value, loader: $("ld").value }, $("dq").value.trim(), $("dg").value, 40).then(function (hits) {
      if (t !== cat.token) return;
      cat.hits = hits; cat.sel = {}; $("dinfo").textContent = "Найдено: " + hits.length + (hits.length ? "" : ". Смени версию игры или слова."); drawCat(); $("dlist").parentNode.scrollTop = 0;
    }).catch(function () { $("dinfo").textContent = "Не получилось загрузить. Проверь интернет."; });
  }
  function init() {
    var cfg = load();
    (cfg.chips || []).forEach(function (k) { st.chips[k] = 1; });
    $("extra").value = cfg.extra || ""; if (cfg.per) $("per").value = cfg.per; if (cfg.size) $("size").value = cfg.size; if (cfg.ld) $("ld").value = cfg.ld; if (cfg.base === false) $("base").checked = false;
    buildChips(); manualN();
    var sel = $("mc"), want = cfg.mc || "1.20.1";
    function fill(list) { sel.innerHTML = list.map(function (v) { return "<option>" + esc(v) + "</option>"; }).join(""); sel.value = list.indexOf(want) >= 0 ? want : list[0]; }
    fill(["1.21.1", "1.20.4", "1.20.1", "1.19.2"]);
    api(MR + "/tag/game_version").then(function (vs) { var rel = vs.filter(function (v) { return v.version_type === "release"; }).map(function (v) { return v.version; }).slice(0, 80); if (rel.length) fill(rel); }).catch(function () { });
    $("dg").innerHTML = GENRE_LABELS.map(function (g) { return '<option value="' + g[1] + '">' + esc(g[0]) + "</option>"; }).join("");
    $("go").onclick = go; $("aiGo").onclick = aiGo;
    var ac = aiCfg(); $("aiKey").value = ac.key || ""; $("aiModel").value = ac.model || "openai/gpt-4o-mini"; $("aiSave").checked = !!ac.save; if (ac.text) $("aiText").value = ac.text;
    ["mc", "ld", "per", "base", "size"].forEach(function (id) { $(id).onchange = save; });
    $("extra").oninput = save;
    $("catBtn").onclick = function () { $("dhint").textContent = "Моды для Minecraft " + $("mc").value + " и " + $("ld").value + ". Нажимай на карточки, чтобы выбрать, потом «Добавить выбранные»."; $("dlg").showModal(); searchCat(); };
    $("dclose").onclick = function () { $("dlg").close(); };
    $("ds").onclick = searchCat; $("dq").onkeydown = function (e) { if (e.key === "Enter") searchCat(); }; $("dg").onchange = searchCat;
    $("dadd").onclick = function () { Object.keys(cat.sel).forEach(function (id) { st.manual[id] = { title: cat.sel[id].title, icon: cat.sel[id].icon_url }; }); cat.sel = {}; manualN(); drawCat(); $("dlg").close(); };
  }
  init();
})();
