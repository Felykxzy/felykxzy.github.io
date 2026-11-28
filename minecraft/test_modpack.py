import hashlib, io, json, os, sys, tempfile, zipfile, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
import zeksi_modpack as M

# 1. разбор описания
g, n = M.parse_wish("магия, оптимизация, шейдеры, create, миникарта")
assert g == ["magic", "optimization"], g
assert "Iris Shaders" in n and "create" in n and "Xaero's Minimap" in n, n
assert M.parse_wish("")==([],[])

JAR = {"a": b"jar-sodium", "b": b"jar-fabricapi", "c": b"jar-magic", "d": b"jar-cf"}
sha = lambda x: hashlib.sha1(x).hexdigest()

class Fake(M.Net):
    def __init__(self, key=""):
        super().__init__(key)
        self.urls = []
    def json(self, url, headers=None):
        self.urls.append(url)
        u = urllib.parse.urlparse(url); q = urllib.parse.parse_qs(u.query); p = u.path
        if p.endswith("/search") and "modrinth" in url:
            facets = json.loads(q["facets"][0]); flat = [x for f in facets for x in f]
            assert "categories:fabric" in flat and "versions:1.20.1" in flat and "categories!=library" in flat
            query = q.get("query", [""])[0].lower()
            if "categories:magic" in flat: return {"hits": [{"project_id": "PM", "title": "Magic Thing"}]}
            if "sodium" in query: return {"hits": [{"project_id": "PS", "title": "Sodium"}]}
            return {"hits": []}
        if "/project/PS/version" in p: return [{"version_type": "release", "files": [{"primary": True, "filename": "sodium.jar", "url": "http://x/a", "hashes": {"sha1": sha(JAR["a"])}}], "dependencies": [{"dependency_type": "required", "project_id": "PF"}, {"dependency_type": "optional", "project_id": "PO"}]}]
        if "/project/PF/version" in p: return [{"version_type": "release", "files": [{"filename": "fabric-api.jar", "url": "http://x/b", "hashes": {"sha1": sha(JAR["b"])}}], "dependencies": []}]
        if "/project/PM/version" in p: return [{"version_type": "beta", "files": [{"filename": "magic.jar", "url": "http://x/c", "hashes": {"sha1": "WRONG"}}], "dependencies": []}]
        if p.endswith("/project/PF"): return {"title": "Fabric API"}
        if "meta.fabricmc" in url: return [{"version": "0.99", "stable": False}, {"version": "0.15.11", "stable": True}]
        if "/mods/search" in p:
            assert headers["x-api-key"] == "K"
            if "xaero" in q["searchFilter"][0].lower(): return {"data": [{"id": 7, "name": "Xaero's Minimap", "slug": "xaeros", "links": {"websiteUrl": "https://cf/xaero"}}]}
            return {"data": []}
        if p.endswith("/mods/7/files"): return {"data": [{"releaseType": 1, "fileName": "xaero.jar", "downloadUrl": "http://x/d", "hashes": [{"algo": 1, "value": sha(JAR["d"])}], "dependencies": []}]}
        raise AssertionError("неожиданный url " + url)
    def bytes(self, url): return JAR[url[-1]]

logs = []
b = M.Builder(Fake("K"), "1.20.1", "fabric", logs.append, per_genre=2)
b.build("магия, sodium, xaero's minimap, несуществующий мод")
titles = [m["title"] for m in b.mods]
assert titles == ["Sodium", "Fabric API", "Xaero's Minimap", "Magic Thing"], titles
assert b.missing, b.missing  # несуществующий мод + базовые Lithium и т.д.
assert "несуществующий мод" in b.missing
with tempfile.TemporaryDirectory() as d:
    path, ok, rep = b.write_pack(d, "Тест")
    z = zipfile.ZipFile(path)
    names = z.namelist()
    assert ".minecraft/mods/sodium.jar" in names and ".minecraft/mods/xaero.jar" in names
    assert ".minecraft/mods/magic.jar" not in names  # контрольная сумма не совпала
    pack = json.loads(z.read("mmc-pack.json"))
    assert pack["components"][0]["version"] == "1.20.1" and pack["components"][1]["version"] == "0.15.11", pack
    assert b"name=\xd0\xa2\xd0\xb5\xd1\x81\xd1\x82" in z.read("instance.cfg")
    assert "Magic Thing" in rep and "Не скачалось" in rep and "не нашёл" in rep.lower()
    assert ok == 3
# без ключа CurseForge: мод только на CF уходит в «не нашёл»
b2 = M.Builder(Fake(""), "1.20.1", "fabric", lambda s: None, base_opt=False)
b2.build("xaero's minimap")
assert b2.missing == ["Xaero's Minimap"]
print("modpack: все проверки прошли")

# установка прямо в папку экземпляра + определение версии из mmc-pack.json
with tempfile.TemporaryDirectory() as d:
    inst = os.path.join(d, "Моя")
    os.makedirs(os.path.join(inst, ".minecraft", "mods"))
    json.dump({"components": [{"uid": "net.minecraft", "version": "1.20.1"}, {"uid": "net.neoforged", "version": "47"}], "formatVersion": 1}, open(os.path.join(inst, "mmc-pack.json"), "w"))
    mods, mc, ld = M.detect_instance(inst)
    assert mods == os.path.join(inst, ".minecraft", "mods") and mc == "1.20.1" and ld == "neoforge", (mods, mc, ld)
    assert M.detect_instance(os.path.join(inst, ".minecraft", "mods"))[0] == os.path.join(inst, ".minecraft", "mods")
    open(os.path.join(mods, "fabric-api.jar"), "wb").write(b"old")
    b3 = M.Builder(Fake("K"), "1.20.1", "fabric", lambda s: None, base_opt=False)
    b3.build("sodium")
    md, ok, rep = b3.install_to(inst)
    assert sorted(os.listdir(mods)) == ["fabric-api.jar", "sodium.jar"] and ok == 2
    assert open(os.path.join(mods, "fabric-api.jar"), "rb").read() == b"old"  # чужое не трогаем
print("modpack: установка в папку проверена")

# каталог и ручной выбор
b4 = M.Builder(Fake("K"), "1.20.1", "fabric", lambda s: None, base_opt=False)
cat = b4.catalog("", "magic")
assert cat and cat[0]["id"] == "PM" and cat[0]["title"] == "Magic Thing"
b4.build("", [("PS", "Sodium")])
assert [m["title"] for m in b4.mods] == ["Sodium", "Fabric API"], b4.mods
assert b4.mods[0]["why"] == "выбрано вручную"
print("modpack: каталог и ручной выбор проверены")

# размер иконок
import struct
png = b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", 512, 512) + b"\x08\x06\x00\x00\x00"
assert M.png_width(png) == 512 and M.shrink_factor(512) == 11 and M.shrink_factor(48) == 1 and M.png_width(b"RIFFxxxxWEBP") == 0
assert M.shrink_factor(0) == 1
cat = M.Builder(Fake("K"), "1.20.1", "fabric", lambda s: None).catalog("", "magic")
assert "icon" in cat[0]
print("modpack: иконки проверены")
