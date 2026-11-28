// Раз в день сохраняет сводку винрейтов героев, чтобы страница могла сравнивать «до» и «после» патча.
// Запускается GitHub Actions (node 20). Для проверки можно передать файлы: node snapshot.js hs.json patch.json
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "data", "history.json");
const KEEP_DAYS = 75;
const groups = { low: [1, 2, 3], mid: [4, 5], high: [6, 7, 8] };
async function load(arg, url) {
  if (arg) return JSON.parse(fs.readFileSync(arg, "utf8"));
  const r = await fetch(url, { headers: { "User-Agent": "zeksi-hub-dota" } });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}
(async () => {
  const stats = await load(process.argv[2], "https://api.opendota.com/api/heroStats");
  let patches = [];
  try { patches = await load(process.argv[3], "https://api.opendota.com/api/constants/patch"); } catch (e) { console.log("patch: пропуск", e.message); }
  if (!Array.isArray(stats) || stats.length < 50) throw new Error("heroStats выглядит неправильно");
  const h = {};
  for (const x of stats) {
    const a = [];
    for (const id of ["low", "mid", "high"]) {
      let p = 0, w = 0;
      for (const i of groups[id]) { p += x[i + "_pick"] || 0; w += x[i + "_win"] || 0; }
      a.push(p, w);
    }
    h[x.id] = a;
  }
  const today = new Date().toISOString().slice(0, 10);
  const last = patches.length ? patches[patches.length - 1] : null;
  let hist = { snaps: [] };
  try { hist = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) { }
  hist.snaps = (hist.snaps || []).filter(s => s.d !== today);
  hist.snaps.push({ d: today, p: last ? last.name : "", h });
  const cut = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  hist.snaps = hist.snaps.filter(s => s.d >= cut).sort((a, b) => a.d < b.d ? -1 : 1);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(hist));
  console.log("снимков:", hist.snaps.length, "героев:", Object.keys(h).length);
})().catch(e => { console.error(e); process.exit(1); });
