"""Pós-processo dos GLB do TRELLIS.2: madeira/tinta não é metal.

O TRELLIS.2 prevê metalicidade de 0,3 a 0,7 na pele pintada, e o boneco renderiza escuro como bronze. Aqui o canal
B (metallic) do mapa metallicRoughness vai a 0; a rugosidade (G) fica como está. O original é guardado em
modelos/trellis2/bruto/.
Uso: python ajustar.py [glb...]   (padrão: todos os modelos/trellis2/*.glb ainda não ajustados)
"""
import glob, os, shutil, sys

import numpy as np
import trimesh
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIR = os.path.join(ROOT, "modelos", "trellis2")


def ajustar(path):
    raw = os.path.join(DIR, "bruto", os.path.basename(path))
    os.makedirs(os.path.dirname(raw), exist_ok=True)
    if not os.path.exists(raw):
        shutil.copy2(path, raw)
    s = trimesh.load(raw)
    for g in s.geometry.values():
        m = g.visual.material
        t = getattr(m, "metallicRoughnessTexture", None)
        if t is not None:
            a = np.asarray(t.convert("RGB")).copy()
            a[..., 2] = 0
            m.metallicRoughnessTexture = Image.fromarray(a)
        m.metallicFactor = 0.0
    s.export(path)
    print("ajustado", os.path.basename(path))


if __name__ == "__main__":
    files = sys.argv[1:] or [f for f in glob.glob(os.path.join(DIR, "*.glb"))
                             if not os.path.exists(os.path.join(DIR, "bruto", os.path.basename(f)))]
    for f in files:
        ajustar(f)
