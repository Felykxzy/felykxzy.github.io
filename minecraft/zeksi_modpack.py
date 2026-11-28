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

    def catalog(self, query="", genre=None, limit=40):
        """Список модов для окна выбора вручную."""
        hits = self.mr_search(query.strip(), [genre] if genre else None, limit=limit)
        return [{"id": h["project_id"], "title": h["title"], "downloads": h.get("downloads", 0), "desc": h.get("description", "")} for h in hits]

    def build(self, wish, manual=None):
        genres, names = parse_wish(wish)
        for pid, title in (manual or []):
            if len(self.mods) < self.max_total + len(manual or []):
                self.log("Выбрано тобой: %s" % title)
                if not self.add_mr(pid, title, "выбрано вручную"):
                    self.missing.append(title)
                    self.log("  - «%s»: нет версии для %s %s" % (title, self.loader, self.mc))
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

    def install_to(self, folder):
        """Кладёт моды прямо в папку mods выбранного экземпляра (Prism, официальный лаунчер и т.д.)."""
        mods_dir, _, _ = detect_instance(folder)
        os.makedirs(mods_dir, exist_ok=True)
        ok, bad = 0, []
        for i, m in enumerate(self.mods, 1):
            dest = os.path.join(mods_dir, m["filename"])
            if os.path.exists(dest):
                self.log("Уже есть: %s" % m["filename"])
                ok += 1
                continue
            self.log("Скачиваю %d/%d: %s" % (i, len(self.mods), m["filename"]))
            try:
                data = self.net.bytes(m["url"])
                if m.get("sha1") and hashlib.sha1(data).hexdigest() != m["sha1"].lower():
                    raise ValueError("не совпала контрольная сумма")
                with open(dest, "wb") as f:
                    f.write(data)
                ok += 1
            except Exception as e:
                bad.append((m["title"], str(e)))
                self.log("  ошибка: %s (%s)" % (m["title"], e))
        report = self.report(bad)
        with io.open(os.path.join(os.path.dirname(mods_dir.rstrip("/\\")) or folder, "отчёт сборщика модов.txt"), "w", encoding="utf-8") as f:
            f.write(report)
        self.log("Готово: моды лежат в %s (модов: %d)" % (mods_dir, ok))
        return mods_dir, ok, report

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


def detect_instance(folder):
    """По выбранной папке находим папку mods и, если это экземпляр Prism, версию игры и загрузчик."""
    folder = os.path.abspath(folder)
    mc = loader = None
    for base in (folder, os.path.dirname(folder)):
        p = os.path.join(base, "mmc-pack.json")
        if os.path.exists(p):
            try:
                with io.open(p, encoding="utf-8") as f:
                    for c in json.load(f).get("components", []):
                        if c.get("uid") == "net.minecraft":
                            mc = c.get("version")
                        for ld, uid in LOADER_UID.items():
                            if c.get("uid") == uid:
                                loader = ld
            except Exception:
                pass
            break
    if os.path.basename(folder).lower() == "mods":
        mods = folder
    else:
        mods = None
        for sub in (".minecraft", "minecraft", ""):
            cand = os.path.join(folder, sub) if sub else folder
            if os.path.isdir(os.path.join(cand, "mods")):
                mods = os.path.join(cand, "mods")
                break
        if not mods:
            for sub in (".minecraft", "minecraft"):
                if os.path.isdir(os.path.join(folder, sub)):
                    mods = os.path.join(folder, sub, "mods")
                    break
        mods = mods or os.path.join(folder, "mods")
    return mods, mc, loader


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
BG, CARD, FIELD, LINE = "#120f1f", "#1c1830", "#27223f", "#3b3562"
INK, MUT, GREEN, GREEN_H, VIOLET = "#f1f0ff", "#a7a3d0", "#5ee68a", "#7bf0a2", "#a77bff"
CHIPS = [("Оптимизация", "оптимизация"), ("Шейдеры", "шейдеры"), ("Магия", "магия"), ("Техно", "техно"), ("Приключения", "приключения"),
         ("Мобы", "мобы"), ("Декор", "декор"), ("Еда", "еда"), ("Оружие и броня", "оружие"), ("Хранилища", "хранилища"),
         ("Миникарта", "миникарта"), ("Транспорт", "транспорт"), ("Выживание", "выживание"), ("Удобства", "утилиты")]


GENRE_LABELS = [("Любой жанр", None), ("Оптимизация", "optimization"), ("Магия", "magic"), ("Техно", "technology"), ("Приключения", "adventure"),
                ("Мобы", "mobs"), ("Декор", "decoration"), ("Еда", "food"), ("Оружие и броня", "equipment"), ("Хранилища", "storage"),
                ("Транспорт", "transportation"), ("Генерация мира", "worldgen"), ("Удобства", "utility"), ("Механики", "game-mechanics")]


def fmt_num(n):
    return ("%.1fM" % (n / 1e6) if n >= 1e6 else "%dk" % (n // 1000) if n >= 1000 else str(n)).replace(".0M", "M")


def gui():
    import threading
    import queue
    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox
    cfg = load_cfg()
    root = tk.Tk()
    root.title("Сборщик модов")
    root.configure(bg=BG)
    root.geometry("780x860")
    root.minsize(720, 760)
    F = "Segoe UI"
    q = queue.Queue()

    st = ttk.Style()
    try:
        st.theme_use("clam")
    except Exception:
        pass
    st.configure("TCombobox", fieldbackground=FIELD, background=FIELD, foreground=INK, arrowcolor=GREEN, bordercolor=LINE, lightcolor=FIELD, darkcolor=FIELD, padding=6)
    st.map("TCombobox", fieldbackground=[("readonly", FIELD)], foreground=[("readonly", INK)])
    st.configure("TSpinbox", fieldbackground=FIELD, background=FIELD, foreground=INK, arrowcolor=GREEN, bordercolor=LINE, padding=6)
    st.configure("Green.Horizontal.TProgressbar", troughcolor=FIELD, background=GREEN, bordercolor=FIELD, lightcolor=GREEN, darkcolor=GREEN)
    root.option_add("*TCombobox*Listbox.background", FIELD)
    root.option_add("*TCombobox*Listbox.foreground", INK)
    root.option_add("*TCombobox*Listbox.selectBackground", VIOLET)

    def card(parent, title, hint=""):
        outer = tk.Frame(parent, bg=CARD, highlightthickness=1, highlightbackground=LINE)
        outer.pack(fill="x", padx=18, pady=7)
        tk.Label(outer, text=title, bg=CARD, fg=INK, font=(F, 12, "bold")).pack(anchor="w", padx=14, pady=(10, 0))
        if hint:
            tk.Label(outer, text=hint, bg=CARD, fg=MUT, font=(F, 9), justify="left", wraplength=700).pack(anchor="w", padx=14)
        inner = tk.Frame(outer, bg=CARD)
        inner.pack(fill="x", padx=14, pady=(6, 12))
        return inner

    def entry(parent, var=None, width=30, show=None):
        return tk.Entry(parent, textvariable=var, width=width, show=show, bg=FIELD, fg=INK, insertbackground=GREEN, relief="flat",
                        font=(F, 11), highlightthickness=1, highlightbackground=LINE, highlightcolor=GREEN)

    class Btn(tk.Label):
        def __init__(self, parent, text, cmd, primary=False):
            self.bg = GREEN if primary else FIELD
            self.hv = GREEN_H if primary else LINE
            self.fg = "#07210f" if primary else INK
            tk.Label.__init__(self, parent, text=text, bg=self.bg, fg=self.fg, font=(F, 11, "bold"), padx=16, pady=10, cursor="hand2")
            self.cmd, self.on = cmd, True
            self.bind("<Enter>", lambda e: self.on and self.config(bg=self.hv))
            self.bind("<Leave>", lambda e: self.config(bg=self.bg if self.on else LINE))
            self.bind("<Button-1>", lambda e: self.on and self.cmd())

        def enable(self, v):
            self.on = v
            self.config(bg=self.bg if v else LINE, fg=self.fg if v else MUT, cursor="hand2" if v else "arrow")

    # заголовок
    head = tk.Frame(root, bg=BG)
    head.pack(fill="x", padx=18, pady=(16, 4))
    tk.Label(head, text="Сборщик модов", bg=BG, fg=GREEN, font=(F, 22, "bold")).pack(anchor="w")
    tk.Label(head, text="Выбери, что хочешь в сборке. Программа найдёт моды, скачает их и положит в нужное место.", bg=BG, fg=MUT, font=(F, 10)).pack(anchor="w")

    # 1. что хочешь
    c1 = card(root, "1. Что должно быть в сборке", "Нажми на нужные жанры. Если нужен конкретный мод, впиши его название через запятую.")
    picked = set(cfg.get("chips", []))
    chip_w = {}
    grid = tk.Frame(c1, bg=CARD)
    grid.pack(fill="x")

    def paint(key):
        w = chip_w[key]
        on = key in picked
        w.config(bg=VIOLET if on else FIELD, fg="#10061f" if on else INK)

    def toggle(key):
        picked.symmetric_difference_update({key})
        paint(key)
    for i, (label, key) in enumerate(CHIPS):
        w = tk.Label(grid, text=label, font=(F, 10, "bold"), padx=12, pady=6, cursor="hand2", bg=FIELD, fg=INK)
        w.grid(row=i // 5, column=i % 5, padx=3, pady=3, sticky="w")
        w.bind("<Button-1>", lambda e, k=key: toggle(k))
        chip_w[key] = w
        paint(key)
    extra = entry(c1, width=60)
    extra.insert(0, cfg.get("extra", "create"))
    extra.pack(fill="x", pady=(8, 0), ipady=5)
    manual = {}   # id -> название: моды, выбранные в окне каталога
    mrow = tk.Frame(c1, bg=CARD)
    mrow.pack(fill="x", pady=(10, 0))
    man_lbl = tk.Label(mrow, text="Вручную выбрано: 0", bg=CARD, fg=MUT, font=(F, 10))

    def refresh_manual():
        man_lbl.config(text="Вручную выбрано: %d" % len(manual) + ((" (" + ", ".join(list(manual.values())[:4]) + ("…" if len(manual) > 4 else "") + ")") if manual else ""))

    def clear_manual():
        manual.clear()
        refresh_manual()

    def open_catalog():
        top = tk.Toplevel(root)
        top.title("Каталог модов")
        top.configure(bg=BG)
        top.geometry("760x640")
        tk.Label(top, text="Каталог модов", bg=BG, fg=GREEN, font=(F, 18, "bold")).pack(anchor="w", padx=16, pady=(14, 0))
        tk.Label(top, text="Показаны моды для Minecraft %s и %s. Выдели нужные (Ctrl или Shift для нескольких) и нажми «Добавить»." % (mc.get(), ld.get()),
                 bg=BG, fg=MUT, font=(F, 10), wraplength=720, justify="left").pack(anchor="w", padx=16)
        srow = tk.Frame(top, bg=BG)
        srow.pack(fill="x", padx=16, pady=8)
        qv = tk.StringVar()
        qe = entry(srow, qv, 30)
        qe.pack(side="left", fill="x", expand=True, ipady=5)
        gv = ttk.Combobox(srow, width=16, values=[x[0] for x in GENRE_LABELS], state="readonly")
        gv.set(GENRE_LABELS[0][0])
        gv.pack(side="left", padx=8)
        info = tk.Label(top, text="", bg=BG, fg=MUT, font=(F, 10))
        lf = tk.Frame(top, bg=CARD, highlightthickness=1, highlightbackground=LINE)
        lb = tk.Listbox(lf, selectmode="extended", bg="#0c0a16", fg=INK, selectbackground=VIOLET, selectforeground="#10061f", relief="flat",
                        font=(F, 11), activestyle="none", highlightthickness=0)
        sb = tk.Scrollbar(lf, command=lb.yview)
        lb.config(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        lb.pack(fill="both", expand=True)
        hits = []
        box = {"res": None}

        def show():
            lb.delete(0, "end")
            for h in hits:
                lb.insert("end", ("✓ " if h["id"] in manual else "   ") + "%s   ·  %s скач.  ·  %s" % (h["title"], fmt_num(h["downloads"]), h["desc"][:70]))

        def search():
            info.config(text="Ищу…")
            box["res"] = None
            genre = dict(GENRE_LABELS).get(gv.get())
            qtxt, m_, l_ = qv.get(), mc.get().strip(), ld.get()

            def job():
                try:
                    box["res"] = Builder(Net(), m_, l_, lambda s: None).catalog(qtxt, genre)
                except Exception as e:
                    box["res"] = str(e)
            threading.Thread(target=job, daemon=True).start()

            def check():
                if box["res"] is None:
                    top.after(150, check)
                    return
                if isinstance(box["res"], str):
                    info.config(text="Не получилось загрузить: %s" % box["res"])
                    return
                hits[:] = box["res"]
                info.config(text="Найдено: %d. Если пусто, смени версию игры или слова." % len(hits))
                show()
            top.after(150, check)

        def add():
            for i in lb.curselection():
                manual[hits[i]["id"]] = hits[i]["title"]
            refresh_manual()
            show()
        Btn(srow, "Искать", search).pack(side="left")
        info.pack(anchor="w", padx=16)
        lf.pack(fill="both", expand=True, padx=16, pady=8)
        brow2 = tk.Frame(top, bg=BG)
        brow2.pack(fill="x", padx=16, pady=(0, 14))
        Btn(brow2, "Добавить выбранные в сборку", add, primary=True).pack(side="left")
        Btn(brow2, "Закрыть", top.destroy).pack(side="left", padx=10)
        qe.bind("<Return>", lambda e: search())
        search()

    Btn(mrow, "Выбрать моды вручную…", open_catalog).pack(side="left")
    man_lbl.pack(side="left", padx=12)
    Btn(mrow, "Сбросить", clear_manual).pack(side="right")

    # 2. игра
    c2 = card(root, "2. Какая игра", "Версия и загрузчик должны совпадать со сборкой в лаунчере. Для Prism они подставятся сами.")
    r2 = tk.Frame(c2, bg=CARD)
    r2.pack(fill="x")
    tk.Label(r2, text="Minecraft", bg=CARD, fg=MUT, font=(F, 10)).pack(side="left")
    mc = ttk.Combobox(r2, width=8, values=["1.21.1", "1.20.4", "1.20.1", "1.19.2"])
    mc.set(cfg.get("mc", "1.20.1"))
    mc.pack(side="left", padx=(6, 16))
    tk.Label(r2, text="Загрузчик", bg=CARD, fg=MUT, font=(F, 10)).pack(side="left")
    ld = ttk.Combobox(r2, width=9, values=["fabric", "forge", "neoforge"], state="readonly")
    ld.set(cfg.get("loader", "fabric"))
    ld.pack(side="left", padx=(6, 16))
    tk.Label(r2, text="Модов на жанр", bg=CARD, fg=MUT, font=(F, 10)).pack(side="left")
    pg = ttk.Spinbox(r2, from_=1, to=10, width=4)
    pg.set(cfg.get("per_genre", 3))
    pg.pack(side="left", padx=6)
    base = tk.BooleanVar(value=cfg.get("base", True))
    tk.Checkbutton(c2, text="Добавить базовую оптимизацию (Sodium, Lithium и похожие)", variable=base, bg=CARD, fg=INK, selectcolor=FIELD,
                   activebackground=CARD, activeforeground=INK, font=(F, 10)).pack(anchor="w", pady=(8, 0))

    # 3. куда
    c3 = card(root, "3. Куда положить", "Prism: правый клик на сборке → «Папка» → скопируй путь. Подойдёт и просто папка mods.")
    r3 = tk.Frame(c3, bg=CARD)
    r3.pack(fill="x")
    inst = tk.StringVar(value=cfg.get("inst", ""))
    entry(r3, inst, 50).pack(side="left", fill="x", expand=True, ipady=5)

    def pick_inst():
        d = filedialog.askdirectory()
        if not d:
            return
        inst.set(d)
        _, m_, l_ = detect_instance(d)
        if m_:
            mc.set(m_)
        if l_:
            ld.set(l_)
    Btn(r3, "Выбрать", pick_inst).pack(side="left", padx=(8, 0))
    tk.Label(c3, text="Ключ CurseForge (по желанию, чтобы искать и там, где нет на Modrinth)", bg=CARD, fg=MUT, font=(F, 9)).pack(anchor="w", pady=(10, 2))
    key = entry(c3, width=50, show="•")
    key.insert(0, cfg.get("cf_key", ""))
    key.pack(fill="x", ipady=5)
    out = cfg.get("out") or (os.path.join(os.path.expanduser("~"), "Desktop") if os.path.isdir(os.path.join(os.path.expanduser("~"), "Desktop")) else os.getcwd())

    # кнопки
    brow = tk.Frame(root, bg=BG)
    brow.pack(fill="x", padx=18, pady=(8, 2))
    btn = Btn(brow, "Положить моды в папку экземпляра", lambda: go("folder"), primary=True)
    btn.pack(side="left")
    btn2 = Btn(brow, "Собрать файл для Prism", lambda: go("zip"))
    btn2.pack(side="left", padx=10)
    bar = ttk.Progressbar(root, mode="indeterminate", style="Green.Horizontal.TProgressbar")
    bar.pack(fill="x", padx=18, pady=(8, 0))

    # журнал
    logf = tk.Frame(root, bg=CARD, highlightthickness=1, highlightbackground=LINE)
    logf.pack(fill="both", expand=True, padx=18, pady=8)
    log = tk.Text(logf, height=10, state="disabled", wrap="word", bg="#0c0a16", fg=INK, relief="flat", font=("Consolas", 10), padx=10, pady=8)
    log.pack(fill="both", expand=True)
    log.tag_configure("ok", foreground=GREEN)
    log.tag_configure("warn", foreground="#ffcf6b")
    log.tag_configure("head", foreground=VIOLET)

    def put(s):
        q.put(s)

    def pump():
        try:
            while True:
                s = q.get_nowait()
                if s is None:
                    btn.enable(True)
                    btn2.enable(True)
                    bar.stop()
                    continue
                tag = "ok" if s.startswith("  +") or s.startswith("Готово") else "warn" if s.startswith("  !") or s.startswith("  -") or s.startswith("Ошибка") else "head" if s.startswith("Жанр") or s.startswith("Ищу") else ""
                log.config(state="normal")
                log.insert("end", s + "\n", tag)
                log.see("end")
                log.config(state="disabled")
        except queue.Empty:
            pass
        root.after(120, pump)

    def work(args):
        try:
            b = Builder(Net(args["cf_key"]), args["mc"], args["loader"], put, args["per_genre"], base_opt=args["base"])
            b.build(args["wish"], args["manual"])
            if not b.mods:
                put("Ничего не нашлось. Попробуй другую версию Minecraft или другие слова.")
            elif args["mode"] == "folder":
                b.install_to(args["inst"])
                put("")
                put("Запусти игру в лаунчере. У экземпляра должны быть: Minecraft %s и %s." % (args["mc"], args["loader"]))
            else:
                path, ok, rep = b.write_pack(args["out"], "Моя сборка")
                put("")
                put("В PRISM: Добавить экземпляр → Импорт → выбери файл «%s»." % os.path.basename(path))
        except Exception as e:
            put("Ошибка: %s" % e)
        put(None)

    def go(mode):
        words = ", ".join([k for _, k in CHIPS if k in picked] + [x.strip() for x in extra.get().split(",") if x.strip()])
        a = {"mode": mode, "inst": inst.get().strip(), "wish": words, "mc": mc.get().strip(), "loader": ld.get(),
             "per_genre": int(pg.get() or 3), "base": base.get(), "cf_key": key.get().strip(), "out": out,
             "manual": list(manual.items())}
        if not a["wish"] and not a["manual"]:
            messagebox.showinfo("Сборщик", "Выбери жанры или впиши названия модов.")
            return
        if mode == "folder" and not a["inst"]:
            messagebox.showinfo("Сборщик", "Сначала выбери папку экземпляра в лаунчере.")
            return
        save_cfg({"chips": sorted(picked), "extra": extra.get(), "mc": a["mc"], "loader": a["loader"], "per_genre": a["per_genre"],
                  "base": a["base"], "cf_key": a["cf_key"], "inst": a["inst"], "out": out})
        btn.enable(False)
        btn2.enable(False)
        bar.start(12)
        log.config(state="normal")
        log.delete("1.0", "end")
        log.config(state="disabled")
        threading.Thread(target=work, args=(a,), daemon=True).start()

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
