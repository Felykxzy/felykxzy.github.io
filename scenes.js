/* Пять живых сцен. Каждая рисуется по времени t (секунды) и не хранит состояния. */
(function () {
  "use strict";
  var TAU = Math.PI * 2;
  function cl(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function ea(x) { x = cl(x, 0, 1); return 1 - Math.pow(1 - x, 3); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function rnd(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function glow(g, x, y, r, rgb, a) { var q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, "rgba(" + rgb + "," + a + ")"); q.addColorStop(1, "rgba(" + rgb + ",0)"); g.fillStyle = q; g.fillRect(x - r, y - r, r * 2, r * 2); }
  function stars(g, w, h, t, n, speed, col) {
    for (var i = 0; i < n; i++) {
      var x = rnd(i) * w, y = (rnd(i + 99) * h + t * speed * (.3 + rnd(i + 5))) % h, tw = .35 + .65 * Math.abs(Math.sin(t * (1 + rnd(i + 3) * 2) + i));
      g.fillStyle = "rgba(" + col + "," + (tw * (.25 + rnd(i + 7) * .6)) + ")"; var s = .8 + rnd(i + 17) * 1.8; g.fillRect(x, y, s, s);
    }
  }
  var FONT = '"Unbounded","Manrope","Segoe UI","DejaVu Sans",sans-serif';
  // общая сетка: сцена занимает верхние ~62% экрана
  function geo(w, h) { var ah = h * (window.HUB_WIDE ? .8 : .62); var u = Math.min(w, ah * .95) / 380; return { ah: ah, u: u, cx: w / 2 }; }

  /* 1. СЛОВОПАД */
  function s1(g, w, h, t) {
    var G = geo(w, h), u = G.u, ah = G.ah;
    var bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#241a7a"); bg.addColorStop(.55, "#0a0b2a"); bg.addColorStop(1, "#05061a"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    glow(g, w * .2, h * .12, h * .5, "120,70,255", .3); glow(g, w * .9, h * .55, h * .45, "255,79,216", .2);
    stars(g, w, h, t, 70, 14, "210,235,255");
    var sy = ah * .74, flash = 0;
    var W = [["ЛУНА", .18, 0], ["ЗВЕЗДА", .62, .25], ["ЩИТ", .3, .5], ["КОМЕТА", .66, .75]], P = 7;
    var span = G.cx - 10, laneW = Math.min(w, 520 * u / 1);
    W.forEach(function (o, k) {
      var ph = ((t / P + o[2]) % 1), len = o[0].length, fs = 26 * u, fw = 31 * u, pw = len * fw + 52 * u, ph0 = 56 * u;
      var x = G.cx + (o[1] - .5) * Math.min(w * .9, 330 * u) * 1.15 - pw / 2; x = cl(x, 12, w - 12 - pw);
      var y0 = 60 * u, y1 = sy - 70 * u, ty0 = .38, ty1 = .66;
      var y = y0 + (y1 - y0) * cl(ph / ty1, 0, 1);
      if (ph < ty1) {
        var typing = ph > ty0, prog = cl((ph - ty0) / (ty1 - ty0), 0, 1), tn = Math.floor(prog * len), a = ea(ph / .08);
        g.save(); g.globalAlpha = a;
        if (typing) glow(g, x + pw / 2, y, pw * .8, "94,242,255", .22);
        rr(g, x, y - ph0 / 2, pw, ph0, ph0 / 2); g.fillStyle = "rgba(10,14,40,.9)"; g.fill();
        g.lineWidth = 2; g.strokeStyle = typing ? "rgba(94,242,255,.95)" : "rgba(160,170,255,.35)"; if (typing) { g.shadowColor = "#5ef2ff"; g.shadowBlur = 18; } g.stroke(); g.shadowBlur = 0;
        g.font = "800 " + fs + "px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
        for (var q = 0; q < len; q++) { g.fillStyle = q < tn ? "#5ef2ff" : "#fff"; var cw = g.measureText(o[0][q]).width; g.fillText(o[0][q], x + 26 * u + q * fw + (fw - cw) / 2, y + 2 * u); }
        g.restore();
      } else if (ph < ty1 + .14) {
        var a2 = (ph - ty1) / .14, cx = x + pw / 2; flash = Math.max(flash, 1 - a2);
        glow(g, cx, y, 150 * u * ea(a2), "94,242,255", .45 * (1 - a2));
        for (var p = 0; p < 22; p++) { var an = rnd(k * 40 + p) * TAU, v = (.3 + rnd(k * 40 + p + 9)) * 330 * u * a2, px = cx + Math.cos(an) * v, py = y + Math.sin(an) * v + 160 * u * a2 * a2; g.fillStyle = (p % 3 ? "rgba(94,242,255," : "rgba(255,79,216,") + (1 - a2) + ")"; g.fillRect(px, py, 5 * u, 5 * u); }
        g.font = "800 " + 34 * u + "px " + FONT; g.textAlign = "center"; g.fillStyle = "rgba(255,255,255," + (1 - a2) + ")"; g.fillText("+" + len * 40, cx, y - 30 * u - a2 * 50 * u);
      }
    });
    glow(g, w / 2, sy + 40 * u, 420 * u, "94,242,255", .15 + flash * .2);
    var sg = g.createLinearGradient(0, 0, w, 0); sg.addColorStop(0, "#5ef2ff"); sg.addColorStop(.5, "#a77bff"); sg.addColorStop(1, "#ff4fd8");
    g.save(); g.shadowColor = "rgba(94,242,255,.9)"; g.shadowBlur = 26 + flash * 30; g.lineWidth = 9 * u; g.strokeStyle = sg; g.lineCap = "round";
    g.beginPath(); g.ellipse(w / 2, sy + 300 * u, Math.min(w * .47, 380 * u), 300 * u, 0, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); g.restore();
    g.font = 30 * u + "px " + FONT; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillStyle = "#ff4fd8"; g.fillText("♥  ♥  ♥", w / 2, sy + 62 * u);
  }

  /* 2. Стопка: башня растёт, небо меняется */
  var SKY = [[[212, 62, 40], [22, 88, 70]], [[262, 56, 30], [338, 78, 56]], [[244, 58, 14], [266, 56, 32]], [[226, 62, 10], [172, 62, 24]], [[256, 62, 8], [286, 56, 22]]];
  function hsl(c) { return "hsl(" + c[0] + "," + c[1] + "%," + c[2] + "%)"; }
  function s2(g, w, h, t) {
    var G = geo(w, h), u = G.u, ah = G.ah, T = 1.7, c = Math.floor(t / T), p = (t / T) % 1, n = 3 + c;
    var sk = (t / 6.5) % SKY.length, i0 = Math.floor(sk), i1 = (i0 + 1) % SKY.length, f = sk - i0; f = f * f * (3 - 2 * f);
    var top = [], bot = []; for (var k = 0; k < 3; k++) { top[k] = mix(SKY[i0][0][k], SKY[i1][0][k], f); bot[k] = mix(SKY[i0][1][k], SKY[i1][1][k], f); }
    var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, hsl(top)); gr.addColorStop(1, hsl(bot)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    var night = top[2] < 20 ? 1 : cl((24 - top[2]) / 8, 0, 1); if (night > .02) stars(g, w, h, t, 70, 10, "255,255,255");
    if (sk < 1.6) { var sa = 1 - cl(sk / 1.6, 0, 1); glow(g, w * .72, ah * .45, 220 * u, "255,200,120", .5 * sa); g.fillStyle = "rgba(255,231,179," + sa + ")"; g.beginPath(); g.arc(w * .72, ah * .45, 34 * u, 0, TAU); g.fill(); }
    var BH = 32 * u, Y0 = ah * .46, bw = 200 * u;
    function wd(i) { return bw * (1 - .07 * ((i * 7) % 5)); }
    function xo(i) { return (rnd(i + 3) - .5) * 30 * u; }
    var landed = p >= .7, e = landed ? ea((p - .7) / .15) : 1, cnt = landed ? n + 1 : n;
    function blk(x, y, ww, hue, a) { g.globalAlpha = a == null ? 1 : a; g.fillStyle = "hsl(" + hue + ",70%,58%)"; rr(g, x, y, ww, BH - 2, 8 * u); g.fill(); g.fillStyle = "rgba(255,255,255,.28)"; rr(g, x, y, ww, 7 * u, 4 * u); g.fill(); g.globalAlpha = 1; }
    for (var j = 0; j < 12; j++) {
      var idx = cnt - 1 - j; if (idx < 0) break;
      var y = Y0 + BH * (j + (landed ? 0 : 1)) + (landed ? BH * e : 0); if (landed) y = Y0 + BH * j + BH * e - 0;
      blk(w / 2 - wd(idx) / 2 + xo(idx), y, wd(idx), (idx * 17 + 200) % 360);
    }
    if (!landed) {
      var tx = w / 2 - wd(n) / 2 + xo(n), mp = p / .7, mx = tx + 150 * u * Math.cos(mp * 2.5 * Math.PI) * (1 - mp * .15);
      blk(mx, Y0, wd(n), (n * 17 + 200) % 360, ea(p / .1));
    } else if (p < .78) { var ra = 1 - (p - .7) / .08; g.strokeStyle = "rgba(255,255,255," + ra * .8 + ")"; g.lineWidth = 3 * u; g.beginPath(); g.ellipse(w / 2, Y0 + BH, bw * .5 + (1 - ra) * 80 * u, 18 * u + (1 - ra) * 20 * u, 0, 0, TAU); g.stroke(); }
    g.font = "800 " + 58 * u + "px " + FONT; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillStyle = "rgba(255,255,255,.95)"; g.fillText(String(n - 2 + (landed ? 1 : 0)), w / 2, 60 * u + Math.min(h * .08, 70));
  }

  /* 3. Словозмей */
  function s3(g, w, h, t) {
    var G = geo(w, h), u = G.u, ah = G.ah;
    var bg = g.createRadialGradient(w / 2, ah * .5, 20, w / 2, ah * .5, h * .8); bg.addColorStop(0, "#0f5a43"); bg.addColorStop(.6, "#08221f"); bg.addColorStop(1, "#04100f"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    stars(g, w, h, t, 40, 6, "180,255,210");
    var cols = 7, rows = 8, cs = Math.min(w * .78 / cols, ah * .8 / rows), gx = w / 2 - cols * cs / 2, gy = ah * .5 - rows * cs / 2 + 10 * u;
    g.fillStyle = "rgba(94,230,138,.1)"; rr(g, gx - 10, gy - 10, cols * cs + 20, rows * cs + 20, 18); g.fill();
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) { g.fillStyle = "rgba(94,230,138,.13)"; g.beginPath(); g.arc(gx + (x + .5) * cs, gy + (y + .5) * cs, 2 * u + 1, 0, TAU); g.fill(); }
    var ring = []; for (x = 0; x < cols; x++) ring.push([x, 0]); for (y = 1; y < rows; y++) ring.push([cols - 1, y]); for (x = cols - 2; x >= 0; x--) ring.push([x, rows - 1]); for (y = rows - 2; y >= 1; y--) ring.push([0, y]);
    var L = ring.length, sp = 3.4, head = (t * sp) % L, WORD = "СЛОВО", at = [2, 7, 12, 18, 24];
    function pos(s) { s = ((s % L) + L) % L; var i = Math.floor(s), f = s - i, a = ring[i], b = ring[(i + 1) % L]; return [gx + (mix(a[0], b[0], f) + .5) * cs, gy + (mix(a[1], b[1], f) + .5) * cs]; }
    var eaten = 0; at.forEach(function (c, k) { if (head > c + .5) eaten = k + 1; });
    at.forEach(function (c, k) {
      if (k < eaten) return; var p = ring[c], px = gx + p[0] * cs + 3, py = gy + p[1] * cs + 3, pulse = 1 + .06 * Math.sin(t * 5 + k);
      g.save(); g.translate(px + cs / 2 - 3, py + cs / 2 - 3); g.scale(pulse, pulse); rr(g, -cs * .42, -cs * .42, cs * .84, cs * .84, 9 * u); g.fillStyle = k === eaten ? "#ffd166" : "rgba(255,255,255,.14)"; g.fill();
      g.fillStyle = k === eaten ? "#2a1b00" : "#d6ffe6"; g.font = "800 " + cs * .5 + "px " + FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(WORD[k], 0, 2); g.restore();
    });
    for (var i = 9; i >= 0; i--) { var q = pos(head - i * .55), r = (i === 0 ? .46 : .4 - i * .018) * cs; g.fillStyle = i === 0 ? "#c9ffdc" : "hsl(" + (140 - i * 3) + ",65%," + (58 - i * 2) + "%)"; g.beginPath(); g.arc(q[0], q[1], r, 0, TAU); g.fill();
      if (i === 0) { var q2 = pos(head + .4), dx = q2[0] - q[0], dy = q2[1] - q[1], d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d; g.fillStyle = "#06220f"; [[-dy, dx], [dy, -dx]].forEach(function (o) { g.beginPath(); g.arc(q[0] + dx * r * .35 + o[0] * r * .4, q[1] + dy * r * .35 + o[1] * r * .4, r * .17, 0, TAU); g.fill(); }); } }
    var tw = 40 * u, tx0 = w / 2 - (WORD.length * (tw + 8 * u) - 8 * u) / 2, ty = Math.max(70, h * .09) ;
    for (var k = 0; k < WORD.length; k++) { var on = k < eaten; rr(g, tx0 + k * (tw + 8 * u), ty, tw, tw * 1.2, 10 * u); g.fillStyle = on ? "#5ee68a" : "rgba(255,255,255,.1)"; g.fill(); g.fillStyle = on ? "#04170c" : "rgba(255,255,255,.7)"; g.font = "800 " + tw * .55 + "px " + FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(WORD[k], tx0 + k * (tw + 8 * u) + tw / 2, ty + tw * .62); }
  }

  /* 4. Notely */
  function s4(g, w, h, t) {
    var G = geo(w, h), u = G.u, ah = G.ah;
    var bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#5a1f7e"); bg.addColorStop(.6, "#16113a"); bg.addColorStop(1, "#080618"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    glow(g, w * .25, h * .1, h * .5, "255,79,216", .28); glow(g, w * .85, h * .45, h * .4, "94,242,255", .16);
    var cx = w / 2, cy = ah * .42, R = Math.min(w * .36, 150 * u * 1.1);
    glow(g, cx, cy, R * 2, "255,79,216", .3);
    g.save(); g.translate(cx, cy); g.rotate(t * .9);
    var co = g.createConicGradient ? g.createConicGradient(0, 0, 0) : null;
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fillStyle = "#0c0a1f"; g.fill();
    for (var i = 1; i < 9; i++) { g.strokeStyle = "rgba(255,255,255," + (.05 + (i % 2) * .04) + ")"; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, R * (.42 + i * .065), 0, TAU); g.stroke(); }
    var lg = g.createLinearGradient(-R * .4, -R * .4, R * .4, R * .4); lg.addColorStop(0, "#ff4fd8"); lg.addColorStop(.5, "#a77bff"); lg.addColorStop(1, "#5ef2ff");
    g.beginPath(); g.arc(0, 0, R * .36, 0, TAU); g.fillStyle = lg; g.fill();
    g.fillStyle = "rgba(255,255,255,.9)"; g.font = "800 " + R * .2 + "px " + FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("♪", 0, 2);
    g.fillStyle = "#0c0a1f"; g.beginPath(); g.arc(0, 0, R * .05, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,.12)"; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, -.5, .2); g.closePath(); g.fill(); g.restore();
    var nb = 26, bw = Math.min(w * .9, 560) / nb, bx = w / 2 - nb * bw / 2, by = ah * .93;
    for (i = 0; i < nb; i++) { var v = .2 + .8 * Math.abs(Math.sin(t * (1.8 + rnd(i) * 1.6) + i * .7)) * (.55 + .45 * Math.sin(i / nb * Math.PI)), bh = v * ah * .24; var bgr = g.createLinearGradient(0, by - bh, 0, by); bgr.addColorStop(0, "#ff4fd8"); bgr.addColorStop(1, "#7a52ff"); g.fillStyle = bgr; rr(g, bx + i * bw + bw * .15, by - bh, bw * .7, bh, bw * .35); g.fill(); }
    for (i = 0; i < 7; i++) { var ph = ((t * .13 + i / 7) % 1), nx = cx + (rnd(i + 20) - .5) * w * .8 + Math.sin(t + i) * 14 * u, ny = ah * .9 - ph * ah * .95; g.fillStyle = "rgba(255,255,255," + Math.sin(ph * Math.PI) * .7 + ")"; g.font = (20 + rnd(i) * 22) * u + "px " + FONT; g.textAlign = "center"; g.fillText(i % 2 ? "♪" : "♫", nx, ny); }
  }
  /* 5. Обо мне: северное сияние, лучи, фото и орбиты с цветами игр */
  var AV = new Image(); AV.src = "avatar.jpg?v=8"; window.HUB_AV = AV;
  function s5(g, w, h, t) {
    var G = geo(w, h), u = G.u, ah = G.ah, i, k;
    var bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#0d0a33"); bg.addColorStop(.55, "#0a0824"); bg.addColorStop(1, "#06051a"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    var cx = w / 2, cy = ah * .335, R = 68 * u, kk = document.querySelector(".kicker"), kt = kk ? kk.getBoundingClientRect().top : 0; if (kt > 120) { var topY = 74, room = kt - topY - 16; R = Math.max(40, Math.min(R, room * .42)); cy = topY + room / 2; } var cols_unused, cols = ["94,242,255", "255,209,102", "94,230,138", "255,79,216"];
    // северное сияние: три лёгкие волны
    g.save(); g.globalCompositeOperation = "lighter";
    var au = ["94,242,255", "167,123,255", "255,79,216"];
    for (k = 0; k < 3; k++) {
      var base = ah * (.2 + k * .12), amp = 26 * u * (1 + k * .3);
      var gr = g.createLinearGradient(0, base - amp * 2, 0, base + ah * .3); gr.addColorStop(0, "rgba(" + au[k] + ",0)"); gr.addColorStop(.35, "rgba(" + au[k] + ",.2)"); gr.addColorStop(1, "rgba(" + au[k] + ",0)");
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, h);
      for (var x = 0; x <= w; x += 12) { var y = base + Math.sin(x / (110 * u) + t * (.5 + k * .2) + k * 2) * amp + Math.sin(x / (47 * u) - t * .8 + k) * amp * .35; g.lineTo(x, y); }
      g.lineTo(w, h); g.closePath(); g.fill();
    }
    g.restore();
    glow(g, w * .2, ah * .15, h * .35, "167,123,255", .22); glow(g, w * .85, ah * .6, h * .3, "255,79,216", .16);
    stars(g, w, ah * 1.05, t, 70, 5, "210,220,255");
    // вращающиеся лучи за фото
    g.save(); g.translate(cx, cy); g.rotate(t * .12);
    for (i = 0; i < 14; i++) { g.rotate(TAU / 14); var rg = g.createLinearGradient(0, 0, R * 4.6, 0); rg.addColorStop(0, "rgba(167,123,255,.2)"); rg.addColorStop(1, "rgba(167,123,255,0)"); g.fillStyle = rg; g.beginPath(); g.moveTo(0, 0); g.lineTo(R * 4.6, -R * .2); g.lineTo(R * 4.6, R * .2); g.closePath(); g.fill(); }
    g.restore();
    glow(g, cx, cy, R * 2.8, "167,123,255", .3);
    // орбиты и точки игр с хвостами
    for (i = 0; i < 4; i++) {
      var rad = R * (1.38 + i * .36), sp = (.55 - i * .08), a0 = t * sp + i * 1.7;
      g.strokeStyle = "rgba(" + cols[i] + ",.2)"; g.lineWidth = 1.4 * u; g.beginPath(); g.ellipse(cx, cy, rad, rad * .4, 0, 0, TAU); g.stroke();
      for (k = 14; k >= 0; k--) { var aa = a0 - k * .05, px = cx + Math.cos(aa) * rad, py = cy + Math.sin(aa) * rad * .4; g.fillStyle = "rgba(" + cols[i] + "," + (.5 * (1 - k / 15)) + ")"; g.beginPath(); g.arc(px, py, (8 - k * .4) * u, 0, TAU); g.fill(); }
      var x2 = cx + Math.cos(a0) * rad, y2 = cy + Math.sin(a0) * rad * .4; glow(g, x2, y2, 30 * u, cols[i], .55); g.fillStyle = "#fff"; g.beginPath(); g.arc(x2, y2, 4 * u, 0, TAU); g.fill();
    }
    // падающие звёзды
    for (i = 0; i < 3; i++) { var ph = ((t * .22 + i * .37) % 1); if (ph < .35) { var q = ph / .35, sx = w * (.15 + i * .35) + q * 160 * u, sy = ah * .05 + i * 30 * u + q * 110 * u; var tg = g.createLinearGradient(sx - 90 * u, sy - 40 * u, sx, sy); tg.addColorStop(0, "rgba(255,255,255,0)"); tg.addColorStop(1, "rgba(255,255,255," + (1 - q) + ")"); g.strokeStyle = tg; g.lineWidth = 2 * u; g.beginPath(); g.moveTo(sx - 90 * u, sy - 40 * u); g.lineTo(sx, sy); g.stroke(); } }
    // фото в круге с градиентным кольцом
    var lg = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R); lg.addColorStop(0, "#5ef2ff"); lg.addColorStop(.5, "#a77bff"); lg.addColorStop(1, "#ff4fd8");
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
    if (AV.complete && AV.naturalWidth) g.drawImage(AV, cx - R, cy - R, R * 2, R * 2); else { g.fillStyle = "#12102f"; g.fillRect(cx - R, cy - R, R * 2, R * 2); }
    g.restore();
    g.lineWidth = 5 * u; g.strokeStyle = lg; g.beginPath(); g.arc(cx, cy, R + 2.5 * u, 0, TAU); g.stroke();
    var pu = 1 + .03 * Math.sin(t * 2); g.strokeStyle = "rgba(167,123,255," + (.35 - .15 * Math.sin(t * 2)) + ")"; g.lineWidth = 2 * u; g.beginPath(); g.arc(cx, cy, (R + 14 * u) * pu, 0, TAU); g.stroke();
  }
  /* 6. Секрет: тёмная пустота, глитч и таинственный шар */
  function s6(g, w, h, t) {
    var G = geo(w, h), u = G.u, ah = G.ah, i, k;
    g.fillStyle = "#05040f"; g.fillRect(0, 0, w, h);
    var cx = w / 2, cy = ah * .44, R = 70 * u;
    glow(g, cx, cy, R * 3.4, "255,60,90", .16 + .05 * Math.sin(t * 2)); glow(g, cx, cy, R * 2.2, "167,123,255", .22);
    // шумовые пиксели
    for (i = 0; i < 90; i++) { var x = rnd(i + 3) * w, y = rnd(i + 40) * ah * 1.1, fl = Math.abs(Math.sin(t * (2 + rnd(i) * 5) + i)); g.fillStyle = "rgba(255,255,255," + (fl * .35 * rnd(i + 9)) + ")"; var sz = (1 + rnd(i + 5) * 3) * u; g.fillRect(x, y, sz, sz); }
    // кольца-замок
    for (i = 0; i < 3; i++) { g.save(); g.translate(cx, cy); g.rotate(t * (.35 + i * .2) * (i % 2 ? -1 : 1)); g.strokeStyle = "rgba(255,255,255," + (.22 - i * .05) + ")"; g.lineWidth = 2 * u; g.setLineDash([(18 + i * 10) * u, (12 + i * 6) * u]); g.beginPath(); g.arc(0, 0, R * (1.35 + i * .32), 0, TAU); g.stroke(); g.restore(); }
    g.setLineDash([]);
    // шар
    var og = g.createRadialGradient(cx - R * .3, cy - R * .35, R * .1, cx, cy, R); og.addColorStop(0, "#3b2a78"); og.addColorStop(1, "#0b0820");
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = og; g.fill(); g.lineWidth = 3 * u; g.strokeStyle = "rgba(167,123,255,.7)"; g.stroke();
    var gl = (Math.sin(t * 7) > .93) ? (rnd(Math.floor(t * 30)) - .5) * 10 * u : 0;
    g.font = "800 " + R * 1.25 + "px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "rgba(255,60,90,.55)"; g.fillText("?", cx + 3 * u + gl, cy + R * .06); g.fillStyle = "rgba(94,242,255,.55)"; g.fillText("?", cx - 3 * u - gl, cy + R * .06);
    g.fillStyle = "#fff"; g.fillText("?", cx, cy + R * .06);
    // «засекреченные» строки
    for (i = 0; i < 4; i++) { var bw = (80 + rnd(i + 70) * 110) * u, bx = cx - bw / 2, by = ah * .86 + i * 12 * u; g.fillStyle = "rgba(255,255,255," + (.1 + .06 * Math.sin(t + i)) + ")"; rr(g, bx, by, bw, 6 * u, 3 * u); g.fill(); }
    // бегущая полоса глитча
    var sy = ((t * .18) % 1.2) * ah; g.fillStyle = "rgba(167,123,255,.07)"; g.fillRect(0, sy, w, 22 * u);
    for (i = 0; i < ah; i += 4) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, i, w, 1); }
  }
  /* 7. Утилиты: чертёж с шестерёнками */
  function gear(g, cx, cy, r, n, rot, col, u) {
    g.save(); g.translate(cx, cy); g.rotate(rot); g.beginPath();
    for (var i = 0; i < n * 2; i++) { var a = i * Math.PI / n, rr = i % 2 ? r : r * 1.16; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = "rgba(" + col + ",.12)"; g.fill(); g.lineWidth = 2.5 * u; g.strokeStyle = "rgba(" + col + ",.85)"; g.stroke();
    g.beginPath(); g.arc(0, 0, r * .38, 0, TAU); g.stroke();
    for (i = 0; i < 4; i++) { g.beginPath(); g.moveTo(Math.cos(i * 1.5708) * r * .38, Math.sin(i * 1.5708) * r * .38); g.lineTo(Math.cos(i * 1.5708) * r * .8, Math.sin(i * 1.5708) * r * .8); g.stroke(); }
    g.restore();
  }
  function s7(g, w, h, t) {
    var G = geo(w, h), u = G.u, ah = G.ah, i;
    var bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#06242b"); bg.addColorStop(1, "#050d18"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(94,242,255,.08)"; g.lineWidth = 1; var s = 36 * u, off = (t * 8 * u) % s;
    for (i = -1; i < w / s + 1; i++) { g.beginPath(); g.moveTo(i * s + off, 0); g.lineTo(i * s + off, h); g.stroke(); }
    for (i = -1; i < h / s + 1; i++) { g.beginPath(); g.moveTo(0, i * s + off); g.lineTo(w, i * s + off); g.stroke(); }
    var cx = w / 2, cy = ah * .4;
    glow(g, cx, cy, 190 * u, "94,242,255", .2);
    gear(g, cx - 42 * u, cy + 6 * u, 66 * u, 12, t * .5, "94,242,255", u);
    gear(g, cx + 70 * u, cy - 44 * u, 44 * u, 9, -t * .5 * 12 / 9 + .2, "255,209,102", u);
    gear(g, cx + 58 * u, cy + 66 * u, 30 * u, 7, t * .5 * 12 / 7 + .1, "94,230,138", u);
    g.font = "800 " + 22 * u + "px " + FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "rgba(94,242,255,.9)"; g.fillText("</>", cx - 42 * u, cy + 6 * u);
    for (i = 0; i < 18; i++) { var px = (rnd(i + 1) * w + t * 10 * u * (1 + rnd(i))) % w, py = rnd(i + 31) * ah; g.fillStyle = "rgba(94,242,255," + (.15 + .25 * Math.abs(Math.sin(t + i))) + ")"; g.fillRect(px, py, 3 * u, 3 * u); }
  }
  window.SCENES = [s5, s1, s2, s3, s4, s7, s6];
  window.SCENE_THUMB_T = [1.4, 3.2, 5.1, 6.4, 2.6, 1.2, 4.2];
})();
