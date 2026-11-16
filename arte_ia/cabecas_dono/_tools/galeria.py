"""Gera galeria/dados.json a partir dos index.json de conceitos/ e modelos/<modelo>/.
Abra com:  python -m http.server 8792 --bind 127.0.0.1 -d arte_ia/cabecas_dono  ->  http://127.0.0.1:8792/galeria/
"""
import glob, json, os

import trimesh

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODELS = {"trellis2": "TRELLIS.2 (forma + textura)", "hunyuan": "Hunyuan3D-2mini (só forma)"}


def load(p):
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}


def main():
    conc = load(os.path.join(ROOT, "conceitos", "index.json"))
    items = []
    for fname, c in sorted(conc.items()):
        stem = fname[:-4]
        it = dict(id=c["id"], concept="../conceitos/" + fname, model2d=c.get("model", "qwen21t"),
                  style=c.get("style", "foto"), seconds2d=c.get("seconds"), modelos=[])
        for mk, label in MODELS.items():
            idx = load(os.path.join(ROOT, "modelos", mk, "index.json"))
            glb = f"{stem}.glb"
            p = os.path.join(ROOT, "modelos", mk, glb)
            if not os.path.exists(p):
                continue
            meta = dict(idx.get(f"{stem}.glb", {}))
            meta.update(idx.get(glb, {}))
            try:
                m = trimesh.load(p, force="mesh")
                faces = int(len(m.faces))
            except Exception:
                faces = None
            it["modelos"].append(dict(key=mk, label=label, glb=f"../modelos/{mk}/{glb}", faces=faces,
                                      mb=round(os.path.getsize(p) / 1e6, 1), seconds=meta.get("seconds")))
        items.append(it)
    os.makedirs(os.path.join(ROOT, "galeria"), exist_ok=True)
    json.dump(dict(items=items), open(os.path.join(ROOT, "galeria", "dados.json"), "w", encoding="utf-8"),
              indent=1, ensure_ascii=False)
    n3d = sum(len(i["modelos"]) for i in items)
    print(f"galeria: {len(items)} concepts, {n3d} modelos 3D")


if __name__ == "__main__":
    main()
