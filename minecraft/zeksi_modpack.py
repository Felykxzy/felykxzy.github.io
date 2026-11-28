#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборщик модов для Майнкрафта (Prism Launcher).

Ты пишешь, какую сборку хочешь («магия, оптимизация, create»), а программа:
  1. ищет моды на Modrinth, а если там нет, то на CurseForge (нужен бесплатный ключ);
  2. добавляет нужные для них моды-зависимости;
  3. скачивает всё и собирает один файл-сборку (.zip), который Prism Launcher импортирует.

Ничего устанавливать не надо: только Python 3.8+ (на Windows в нём уже есть окно tkinter).
Запуск: дважды щёлкни по файлу или `python zeksi_modpack.py`.
Без окна: python zeksi_modpack.py --mc 1.20.1 --loader fabric --wish "магия, оптимизация" --out .
"""
import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

UA = "zeksi-modpack-builder/1.0 (github.com/Felykxzy)"
MR = "https://api.modrinth.com/v2"
CF = "https://api.curseforge.com/v1"
CF_GAME = 432          # Minecraft
CF_CLASS_MODS = 6      # раздел «Моды»
CF_LOADER = {"forge": 1, "fabric": 4, "quilt": 5, "neoforge": 6}
LOADER_UID = {"fabric": "net.fabricmc.fabric-loader", "forge": "net.minecraftforge", "neoforge": "net.neoforged"}
CONFIG = os.path.join(os.path.expanduser("~"), ".zeksi_modpack.json")

# слово из описания -> жанры Modrinth
GENRES = [
    ("optimization", ["оптимиз", "фпс", "fps", "лаг", "производитель", "optimiz", "perform", "быстр"]),
    ("magic", ["маг", "колдов", "заклин", "ведьм", "magic", "spell", "wizard"]),
    ("technology", ["техно", "механизм", "автоматиз", "завод", "tech", "automat", "machine", "factory"]),
    ("adventure", ["приключ", "данж", "босс", "подзем", "подзем", "adventure", "dungeon", "quest", "квест"]),
    ("worldgen", ["генерац", "биом", "структур", "деревн", "worldgen", "biome", "structure"]),
    ("mobs", ["моб", "существа", "животн", "монстр", "creature", "animal"]),
    ("decoration", ["декор", "красив", "мебел", "строител", "строй", "decor", "furniture", "build"]),
    ("equipment", ["оружи", "брон", "инструмент", "weapon", "armor", "tool"]),
    ("food", ["еда", "готов", "кулинар", "food", "cook", "farm", "ферм"]),
    ("storage", ["хранил", "сундук", "инвентар", "storage", "chest", "backpack", "рюкзак"]),
    ("transportation", ["транспорт", "поезд", "машин", "самолёт", "самолет", "vehicle", "transport", "train"]),
    ("utility", ["утилит", "удобств", "utility", "qol"]),
    ("game-mechanics", ["механик", "выжива", "survival", "mechanic", "hardcore", "хардкор"]),
]
# слово из описания -> конкретные моды
PRESETS = [
    (["шейдер", "shader", "график", "graphic", "реалист"], ["Iris Shaders", "Sodium"]),
    (["миникарт", "minimap", "карта"], ["Xaero's Minimap"]),
    (["рецепт", "jei", "recipe"], ["Just Enough Items"]),
]
BASE_OPT = {
    "fabric": ["Sodium", "Lithium", "FerriteCore", "Mod Menu"],
    "forge": ["Embeddium", "FerriteCore", "Canary"],
    "neoforge": ["Sodium", "FerriteCore"],
    "quilt": ["Sodium", "Lithium", "FerriteCore"],
}


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def parse_wish(text):
    """Из текста вида «магия, оптимизация, create» получаем жанры и названия модов."""
    genres, names = [], []
    for part in re.split(r"[,;\n]+", text or ""):
        p = part.strip()
        if not p:
            continue
        low = p.lower()
        hit = False
        for g, keys in GENRES:
            if any(k in low for k in keys):
                if g not in genres:
                    genres.append(g)
                hit = True
        for keys, mods in PRESETS:
            if any(k in low for k in keys):
                for m in mods:
                    if m not in names:
                        names.append(m)
                hit = True
        if not hit and p not in names:
            names.append(p)
    return genres, names


class Net:
    """Все обращения в интернет здесь (в тестах подменяется)."""

    def __init__(self, cf_key=""):
        self.cf_key = cf_key.strip()

    def _open(self, url, headers=None):
        h = {"User-Agent": UA}
        h.update(headers or {})
        for attempt in range(4):
            try:
                return urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=40).read()
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 3:
                    time.sleep(2 + attempt * 2)
                    continue
                raise
            except urllib.error.URLError:
                if attempt < 3:
                    time.sleep(1.5)
                    continue
                raise

    def json(self, url, headers=None):
        return json.loads(self._open(url, headers).decode("utf-8"))

    def cf(self, path, **params):
        if not self.cf_key:
            raise RuntimeError("нет ключа CurseForge")
        q = urllib.parse.urlencode(params)
        return self.json(CF + path + ("?" + q if q else ""), {"x-api-key": self.cf_key})

    def bytes(self, url):
        return self._open(url)


# ---------- загрузчик и версия ----------
def loader_version(net, mc, loader):
    if loader == "fabric":
        for v in net.json("https://meta.fabricmc.net/v2/versions/loader"):
            if v.get("stable"):
                return v["version"]
    if loader == "forge":
        promos = net.json("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json")["promos"]
        return promos.get(mc + "-recommended") or promos.get(mc + "-latest")
    if loader == "neoforge":
        parts = mc.split(".")
        pre = "%s.%s." % (parts[1], parts[2] if len(parts) > 2 else "0")
        vs = [v for v in net.json("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge")["versions"]
              if v.startswith(pre) and "beta" not in v and "alpha" not in v]
        return vs[-1] if vs else None
    return None


def release_versions(net):
    try:
        vs = net.json(MR + "/tag/game_version")
        return [v["version"] for v in vs if v.get("version_type") == "release"][:25]
    except Exception:
        return ["1.21.1", "1.20.4", "1.20.1", "1.19.2"]


# ---------- сборка ----------
class Builder:
    def __init__(self, net, mc, loader, log=print, per_genre=3, max_total=40, base_opt=True):
        self.net, self.mc, self.loader = net, mc, loader
        self.log, self.per_genre, self.max_total, self.base_opt = log, per_genre, max_total, base_opt
        self.mods = []        # то, что скачаем
        self.manual = []      # то, что надо скачать вручную
        self.missing = []     # не найдено нигде
        self.seen = set()     # нормализованные названия
        self.seen_ids = set()

    # --- Modrinth ---
    def mr_search(self, query, categories=None, limit=12):
        facets = [["project_type:mod"], ["versions:" + self.mc], ["categories:" + self.loader], ["categories!=library"]]
        if categories:
            facets.append(["categories:" + c for c in categories])
        q = urllib.parse.urlencode({"query": query, "facets": json.dumps(facets), "limit": limit,
                                    "index": "relevance" if query else "downloads"})
        return self.net.json(MR + "/search?" + q).get("hits", [])

    def mr_version(self, pid):
        q = urllib.parse.urlencode({"loaders": json.dumps([self.loader]), "game_versions": json.dumps([self.mc])})
        vs = self.net.json("%s/project/%s/version?%s" % (MR, pid, q))
        if not vs:
            return None
        rel = [v for v in vs if v.get("version_type") == "release"]
        return (rel or vs)[0]

    def add_mr(self, pid, title, why, depth=0):
        key = "mr:" + pid
        if key in self.seen_ids or norm(title) in self.seen:
            return True
        v = self.mr_version(pid)
        if not v:
            return False
        files = v.get("files") or []
        f = next((x for x in files if x.get("primary")), files[0] if files else None)
        if not f:
            return False
        self.seen_ids.add(key)
        self.seen.add(norm(title))
        self.mods.append({"title": title, "filename": f["filename"], "url": f["url"], "sha1": (f.get("hashes") or {}).get("sha1"), "src": "Modrinth", "why": why})
        self.log("  + %s (Modrinth)" % title)
        if depth < 4:
            for d in v.get("dependencies") or []:
                if d.get("dependency_type") == "required" and d.get("project_id"):
                    try:
                        p = self.net.json("%s/project/%s" % (MR, d["project_id"]))
                        self.add_mr(d["project_id"], p.get("title", d["project_id"]), "нужен для «%s»" % title, depth + 1)
                    except Exception:
                        pass
        return True

    # --- CurseForge ---
    def cf_ok(self):
        return bool(self.net.cf_key)

    def cf_search(self, query, limit=8):
        r = self.net.cf("/mods/search", gameId=CF_GAME, classId=CF_CLASS_MODS, searchFilter=query, gameVersion=self.mc,
                        modLoaderType=CF_LOADER[self.loader], sortField=2, sortOrder="desc", pageSize=limit)
        return r.get("data", [])

    def add_cf(self, mod, why, depth=0):
        title = mod.get("name", "?")
        key = "cf:%s" % mod["id"]
        if key in self.seen_ids or norm(title) in self.seen:
            return True
        r = self.net.cf("/mods/%s/files" % mod["id"], gameVersion=self.mc, modLoaderType=CF_LOADER[self.loader], pageSize=10)
        files = r.get("data", [])
        if not files:
            return False
        rel = [f for f in files if f.get("releaseType") == 1]
        f = (rel or files)[0]
        self.seen_ids.add(key)
        self.seen.add(norm(title))
        link = (mod.get("links") or {}).get("websiteUrl") or "https://www.curseforge.com/minecraft/mc-mods/" + mod.get("slug", "")
        if not f.get("downloadUrl"):
            self.manual.append({"title": title, "link": link, "why": "автор запретил скачивание программами"})
            self.log("  ! %s (CurseForge): скачай вручную" % title)
            return True
        sha1 = next((h["value"] for h in f.get("hashes", []) if h.get("algo") == 1), None)
        self.mods.append({"title": title, "filename": f["fileName"], "url": f["downloadUrl"], "sha1": sha1, "src": "CurseForge", "why": why})
        self.log("  + %s (CurseForge)" % title)
        if depth < 3:
            for d in f.get("dependencies") or []:
                if d.get("relationType") == 3:
                    try:
                        m = self.net.cf("/mods/%s" % d["modId"]).get("data")
                        if m:
                            self.add_cf(m, "нужен для «%s»" % title, depth + 1)
                    except Exception:
                        pass
        return True

    # --- по названию: сначала Modrinth, потом CurseForge ---
    def add_by_name(self, name, why):
        if len(self.mods) >= self.max_total:
            return
        try:
            for h in self.mr_search(name, limit=5):
                if norm(name) in norm(h["title"]) or norm(h["title"]) in norm(name):
                    if self.add_mr(h["project_id"], h["title"], why):
                        return
        except Exception as e:
            self.log("  Modrinth не ответил на «%s»: %s" % (name, e))
        if self.cf_ok():
            try:
                for m in self.cf_search(name, 5):
                    if norm(name) in norm(m["name"]) or norm(m["name"]) in norm(name):
                        if self.add_cf(m, why):
                            return
            except Exception as e:
                self.log("  CurseForge не ответил на «%s»: %s" % (name, e))
        self.missing.append(name)
        self.log("  - «%s»: не нашёл для %s %s" % (name, self.loader, self.mc) + ("" if self.cf_ok() else " (CurseForge выключен: нет ключа)"))

    def add_genre(self, genre):
        self.log("Жанр «%s»:" % genre)
        got = 0
        try:
            for h in self.mr_search("", [genre], limit=self.per_genre * 3 + 3):
                if got >= self.per_genre or len(self.mods) >= self.max_total:
                    break
                n = len(self.mods)
                if self.add_mr(h["project_id"], h["title"], "жанр «%s»" % genre):
                    if len(self.mods) > n:
                        got += 1
        except Exception as e:
            self.log("  Modrinth не ответил: %s" % e)
        if not got:
            self.log("  ничего подходящего для %s %s" % (self.loader, self.mc))

    def build(self, wish):
        genres, names = parse_wish(wish)
        self.log("Версия %s, загрузчик %s" % (self.mc, self.loader))
        self.log("Жанры: %s" % (", ".join(genres) or "нет") + " | Моды по названию: %s" % (", ".join(names) or "нет"))
        if self.base_opt and "optimization" not in genres:
            names = BASE_OPT.get(self.loader, []) + [n for n in names if n not in BASE_OPT.get(self.loader, [])]
        for n in names:
            self.log("Ищу «%s»:" % n)
            self.add_by_name(n, "ты просил" if n not in BASE_OPT.get(self.loader, []) else "базовая оптимизация")
        for g in genres:
            self.add_genre(g)
        return self.mods

    # --- файл сборки ---
    def write_pack(self, out_dir, name):
        lv = loader_version(self.net, self.mc, self.loader)
        if not lv:
            self.log("Не удалось узнать версию загрузчика %s. Prism предложит выбрать её сам." % self.loader)
        comps = [{"uid": "net.minecraft", "version": self.mc, "important": True}]
        if lv:
            comps.append({"uid": LOADER_UID[self.loader], "version": lv})
        safe = re.sub(r'[\\/:*?"<>|]', "", name).strip() or "Моя сборка"
        path = os.path.join(out_dir, safe + ".zip")
        ok, bad = 0, []
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("instance.cfg", "InstanceType=OneSix\nname=%s\niconKey=default\nOverrideMemory=true\nMaxMemAlloc=4096\nMinMemAlloc=1024\n" % safe)
            z.writestr("mmc-pack.json", json.dumps({"components": comps, "formatVersion": 1}, indent=2))
            z.writestr(".minecraft/mods/.keep", "")
            for i, m in enumerate(self.mods, 1):
                self.log("Скачиваю %d/%d: %s" % (i, len(self.mods), m["filename"]))
                try:
                    data = self.net.bytes(m["url"])
                    if m.get("sha1") and hashlib.sha1(data).hexdigest() != m["sha1"].lower():
                        raise ValueError("не совпала контрольная сумма")
                    z.writestr(".minecraft/mods/" + m["filename"], data)
                    ok += 1
                except Exception as e:
                    bad.append((m["title"], str(e)))
                    self.log("  ошибка: %s (%s)" % (m["title"], e))
            report = self.report(bad)
            z.writestr("ОТЧЁТ.txt", report)
        with io.open(os.path.join(out_dir, safe + " — отчёт.txt"), "w", encoding="utf-8") as f:
            f.write(report)
        self.log("Готово: %s (модов: %d)" % (path, ok))
        return path, ok, report

    def report(self, bad):
        L = ["Сборка: Minecraft %s, %s" % (self.mc, self.loader), "", "Моды в сборке:"]
        for m in self.mods:
            L.append("  - %s [%s] — %s" % (m["title"], m["src"], m["why"]))
        if self.manual:
            L += ["", "Скачай вручную и положи в папку mods:"]
            L += ["  - %s: %s (%s)" % (x["title"], x["link"], x["why"]) for x in self.manual]
        if self.missing:
            L += ["", "Не нашёл (для этой версии и загрузчика):"] + ["  - " + x for x in self.missing]
        if bad:
            L += ["", "Не скачалось:"] + ["  - %s: %s" % b for b in bad]
        return "\n".join(L) + "\n"


def load_cfg():
    try:
        with io.open(CONFIG, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_cfg(d):
    try:
        with io.open(CONFIG, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False)
    except Exception:
        pass


# ---------- окно ----------
def gui():
    import threading
    import queue
    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox
    cfg = load_cfg()
    root = tk.Tk()
    root.title("Сборщик модов для Prism Launcher")
    root.geometry("720x680")
    pad = {"padx": 12, "pady": 4}
    q = queue.Queue()
    ttk.Label(root, text="Какую сборку хочешь? Через запятую: жанры или названия модов", font=("Segoe UI", 11, "bold")).pack(anchor="w", **pad)
    ttk.Label(root, text="Например: магия, оптимизация, шейдеры, create, миникарта").pack(anchor="w", padx=12)
    wish = tk.Text(root, height=4, wrap="word")
    wish.pack(fill="x", **pad)
    wish.insert("1.0", cfg.get("wish", "оптимизация, шейдеры, миникарта"))
    row = ttk.Frame(root)
    row.pack(fill="x", **pad)
    ttk.Label(row, text="Версия Minecraft:").pack(side="left")
    mc = ttk.Combobox(row, width=10, values=["1.21.1", "1.20.4", "1.20.1", "1.19.2"])
    mc.set(cfg.get("mc", "1.20.1"))
    mc.pack(side="left", padx=6)
    ttk.Label(row, text="Загрузчик:").pack(side="left", padx=(12, 0))
    ld = ttk.Combobox(row, width=9, values=["fabric", "forge", "neoforge"], state="readonly")
    ld.set(cfg.get("loader", "fabric"))
    ld.pack(side="left", padx=6)
    ttk.Label(row, text="Модов на жанр:").pack(side="left", padx=(12, 0))
    pg = ttk.Spinbox(row, from_=1, to=10, width=4)
    pg.set(cfg.get("per_genre", 3))
    pg.pack(side="left", padx=6)
    row2 = ttk.Frame(root)
    row2.pack(fill="x", **pad)
    ttk.Label(row2, text="Название сборки:").pack(side="left")
    nm = ttk.Entry(row2, width=26)
    nm.insert(0, cfg.get("name", "Моя сборка"))
    nm.pack(side="left", padx=6)
    base = tk.BooleanVar(value=cfg.get("base", True))
    ttk.Checkbutton(row2, text="Добавить базовую оптимизацию", variable=base).pack(side="left", padx=12)
    ttk.Label(root, text="Ключ CurseForge (нужен, только если мода нет на Modrinth; можно оставить пустым):").pack(anchor="w", **pad)
    key = ttk.Entry(root, show="•")
    key.insert(0, cfg.get("cf_key", ""))
    key.pack(fill="x", **pad)
    row3 = ttk.Frame(root)
    row3.pack(fill="x", **pad)
    out = tk.StringVar(value=cfg.get("out", os.path.join(os.path.expanduser("~"), "Desktop") if os.path.isdir(os.path.join(os.path.expanduser("~"), "Desktop")) else os.getcwd()))
    ttk.Label(row3, text="Куда сохранить:").pack(side="left")
    ttk.Entry(row3, textvariable=out, width=48).pack(side="left", padx=6)
    ttk.Button(row3, text="Выбрать", command=lambda: out.set(filedialog.askdirectory() or out.get())).pack(side="left")
    btn = ttk.Button(root, text="Собрать сборку")
    btn.pack(**pad)
    log = tk.Text(root, height=18, state="disabled", wrap="word", bg="#101018", fg="#e8e8ff")
    log.pack(fill="both", expand=True, **pad)

    def put(s):
        q.put(s)

    def pump():
        try:
            while True:
                s = q.get_nowait()
                if s is None:
                    btn.config(state="normal")
                    continue
                log.config(state="normal")
                log.insert("end", s + "\n")
                log.see("end")
                log.config(state="disabled")
        except queue.Empty:
            pass
        root.after(120, pump)

    def work(args):
        try:
            b = Builder(Net(args["cf_key"]), args["mc"], args["loader"], put, args["per_genre"], base_opt=args["base"])
            b.build(args["wish"])
            if not b.mods:
                put("Ничего не нашлось. Попробуй другую версию Minecraft или другие слова.")
            else:
                path, ok, rep = b.write_pack(args["out"], args["name"])
                put("")
                put("КАК ДОБАВИТЬ В PRISM: Добавить экземпляр → Импорт → выбери файл «%s»." % os.path.basename(path))
        except Exception as e:
            put("Ошибка: %s" % e)
        put(None)

    def go():
        a = {"wish": wish.get("1.0", "end").strip(), "mc": mc.get().strip(), "loader": ld.get(), "per_genre": int(pg.get() or 3),
             "name": nm.get().strip() or "Моя сборка", "base": base.get(), "cf_key": key.get().strip(), "out": out.get()}
        if not a["wish"]:
            messagebox.showinfo("Сборщик", "Напиши, какую сборку хочешь.")
            return
        save_cfg(dict(a, per_genre=a["per_genre"]))
        btn.config(state="disabled")
        log.config(state="normal")
        log.delete("1.0", "end")
        log.config(state="disabled")
        threading.Thread(target=work, args=(a,), daemon=True).start()

    btn.config(command=go)
    pump()
    root.mainloop()


def main(argv):
    if "--wish" in argv:
        def arg(n, d=""):
            return argv[argv.index(n) + 1] if n in argv else d
        cfg = load_cfg()
        b = Builder(Net(arg("--key", cfg.get("cf_key", ""))), arg("--mc", "1.20.1"), arg("--loader", "fabric"), print, int(arg("--per", "3")))
        b.build(arg("--wish"))
        if b.mods:
            b.write_pack(arg("--out", "."), arg("--name", "Моя сборка"))
        else:
            print("Ничего не нашлось.")
        return 0
    try:
        gui()
    except ImportError:
        print("Нет окна tkinter. Используй: python zeksi_modpack.py --mc 1.20.1 --loader fabric --wish \"магия, оптимизация\" --out .")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
