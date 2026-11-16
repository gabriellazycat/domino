"""Pinta as malhas do Hunyuan3D-2mini (só forma) com o concept que as gerou.

Projeção frontal: a silhueta da malha (eixo de vista escolhido por IoU com a máscara do concept) é encaixada no
recorte do objeto na imagem. Lados e nuca recebem a cor da borda da silhueta naquela altura (cabelo em cima,
pele/pescoço embaixo), para o rosto não aparecer espelhado atrás da cabeça.
Uso: python colorir.py [glb...]   (padrão: modelos/hunyuan/*.glb sem "__cor")
"""
import glob, json, os, sys

import numpy as np
import trimesh
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def mask_of(img):
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    m = np.linalg.norm(a - bg, axis=2) > 18
    # fecha buracos pequenos: linha a linha, preenche entre o primeiro e o último pixel do objeto
    out = np.zeros_like(m)
    for y in range(m.shape[0]):
        xs = np.nonzero(m[y])[0]
        if len(xs) > 3:
            out[y, xs[0]:xs[-1] + 1] = True
    return a, out


def bbox(m):
    ys, xs = np.nonzero(m)
    return xs.min(), xs.max(), ys.min(), ys.max()


def raster(u, v, n=96):
    g = np.zeros((n, n), bool)
    iu = np.clip((u * (n - 1)).astype(int), 0, n - 1)
    iv = np.clip((v * (n - 1)).astype(int), 0, n - 1)
    g[iv, iu] = True
    for _ in range(2):  # dilata
        g = g | np.roll(g, 1, 0) | np.roll(g, -1, 0) | np.roll(g, 1, 1) | np.roll(g, -1, 1)
    return g


VIEWS = {  # nome: (eixo horizontal, sinal, eixo de profundidade, sinal)  com Y para cima
    "+z": (0, 1, 2, 1), "-z": (0, -1, 2, -1), "+x": (2, -1, 0, 1), "-x": (2, 1, 0, -1),
}


def colorir(path):
    scene = trimesh.load(path, force="mesh")
    mesh = scene if isinstance(scene, trimesh.Trimesh) else scene.dump(concatenate=True)
    stem = os.path.basename(path)[:-4]
    src = None
    for c in glob.glob(os.path.join(ROOT, "conceitos", stem + ".png")):
        src = c
    if not src:
        print("sem concept para", stem)
        return
    img, m = mask_of(Image.open(src))
    H, W = m.shape
    x0, x1, y0, y1 = bbox(m)
    sub = m[y0:y1 + 1, x0:x1 + 1]
    target = np.asarray(Image.fromarray(sub.astype(np.uint8) * 255).resize((96, 96))) > 127

    V = mesh.vertices
    best = None
    for name, (h, hs, d, ds) in VIEWS.items():
        uu = V[:, h] * hs
        vv = -V[:, 1]
        un = (uu - uu.min()) / (np.ptp(uu) + 1e-9)
        vn = (vv - vv.min()) / (np.ptp(vv) + 1e-9)
        r = raster(un, vn)
        iou = (r & target).sum() / max((r | target).sum(), 1)
        if best is None or iou > best[0]:
            best = (iou, name, un, vn, h, hs, d, ds)
    iou, name, un, vn, h, hs, d, ds = best
    px = np.clip(x0 + un * (x1 - x0), 0, W - 1)
    py = np.clip(y0 + vn * (y1 - y0), 0, H - 1)
    front = img[py.astype(int), px.astype(int)]

    # cor de borda por linha: alguns pixels para dentro da silhueta, à esquerda e à direita
    edgeL = np.zeros((H, 3), np.float32); edgeR = np.zeros((H, 3), np.float32)
    inset = max(4, (x1 - x0) // 25)
    for y in range(H):
        xs = np.nonzero(m[y])[0]
        if len(xs):
            edgeL[y] = img[y, min(xs[0] + inset, xs[-1])]
            edgeR[y] = img[y, max(xs[-1] - inset, xs[0])]
        elif y > 0:
            edgeL[y] = edgeL[y - 1]; edgeR[y] = edgeR[y - 1]
    yi = py.astype(int)
    edge = np.where((un < 0.5)[:, None], edgeL[yi], edgeR[yi])

    nrm = mesh.vertex_normals
    facing = nrm[:, d] * ds  # 1 = olhando para a câmera do concept
    w = np.clip((facing + 0.15) / 0.5, 0, 1)[:, None]
    col = front * w + edge * (1 - w)
    rgba = np.concatenate([np.clip(col, 0, 255), np.full((len(col), 1), 255)], 1).astype(np.uint8)
    mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=rgba)
    dst = path[:-4] + "__cor.glb"
    mesh.export(dst)
    print(f"{stem}: vista {name} IoU {iou:.2f} -> {os.path.basename(dst)}")
    ip = os.path.join(os.path.dirname(path), "index.json")
    idx = json.load(open(ip, encoding="utf-8")) if os.path.exists(ip) else {}
    idx.setdefault(os.path.basename(dst), {}).update(colorido_de=os.path.basename(path), vista=name, iou=round(float(iou), 3))
    json.dump(idx, open(ip, "w", encoding="utf-8"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    files = sys.argv[1:] or [f for f in glob.glob(os.path.join(ROOT, "modelos", "hunyuan", "*.glb")) if "__cor" not in f]
    for f in files:
        if len(sys.argv) == 1 and os.path.exists(f[:-4] + "__cor.glb"):
            continue
        colorir(f)
