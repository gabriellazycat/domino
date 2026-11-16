"""Imagem -> cabeça 3D (GLB) no ComfyUI local, só com nós nativos.

Modelos:
  trellis2  : TRELLIS.2 (Microsoft, MIT; pesos Comfy-Org int8) — forma + textura PBR baked (UV).
              Grafo = template oficial 3d_pixal3d_trellis2_image_to_model com o switch em Trellis2.
  hunyuan   : Hunyuan3D-2mini (Tencent) — só forma; cor por projeção frontal do concept (colorir.py).
Uso: python img3d.py <png> [<png>...] --model trellis2|hunyuan [--seed N] [--faces 40000]
Saída: arte_ia/cabecas_dono/modelos/<modelo>/<nome>.glb + index.json
"""
import argparse, json, os, sys, time, urllib.parse, urllib.request

sys.path.insert(0, r"C:\Users\gabri\Desktop\LastBoss\arte_ia\_tools")
import gen  # noqa: E402  (post(), upload_image())

HOST = gen.HOST
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def prep(g, img):
    """LoadImage -> BiRefNet -> recorte quadrado centrado no objeto, fundo branco."""
    g["122"] = {"class_type": "LoadImage", "inputs": {"image": img}}
    g["193"] = {"class_type": "LoadBackgroundRemovalModel", "inputs": {"bg_removal_name": "birefnet.safetensors"}}
    g["192"] = {"class_type": "RemoveBackground", "inputs": {"bg_removal_model": ["193", 0], "image": ["122", 0]}}
    g["312"] = {"class_type": "ImageCropToMask", "inputs": {"images": ["122", 0], "masks": ["192", 0], "width": 1024,
                                                             "height": 1024, "pad_factor": 1.1, "grow_mask": 0,
                                                             "background": "#ffffff"}}
    return ["312", 0]


def trellis2(img, seed, faces, tex):
    g = {}
    im = prep(g, img)
    g.update({
        "15": {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": "dino_v3_L_naf_fp32.safetensors"}},
        "299": {"class_type": "Trellis2Conditioning", "inputs": {"clip_vision_model": ["15", 0], "image": im}},
        "40": {"class_type": "UNETLoader", "inputs": {"unet_name": "trellis_2_int8_convrot.safetensors", "weight_dtype": "default"}},
        "117": {"class_type": "VAELoader", "inputs": {"vae_name": "trellis_2_shape_vae_bf16.safetensors"}},
        "118": {"class_type": "VAELoader", "inputs": {"vae_name": "trellis_2_texture_vae_bf16.safetensors"}},
        # estrutura (voxels 32^3)
        "199": {"class_type": "CFGOverride", "inputs": {"model": ["40", 0], "cfg": 1.0, "start_percent": 0.667, "end_percent": 1.0}},
        "125": {"class_type": "RescaleCFG", "inputs": {"model": ["199", 0], "multiplier": 0.7}},
        "108": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["125", 0], "shift": 5.0}},
        "87": {"class_type": "EmptyTrellis2LatentStructure", "inputs": {"batch_size": 1}},
        "3": {"class_type": "KSampler", "inputs": {"model": ["108", 0], "positive": ["299", 0], "negative": ["299", 1],
                                                   "latent_image": ["87", 0], "seed": seed, "steps": 12, "cfg": 7.5,
                                                   "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
        "119": {"class_type": "VaeDecodeStructureTrellis2", "inputs": {"samples": ["3", 0], "vae": ["117", 0], "resolution": "32"}},
        # forma
        "279": {"class_type": "CFGOverride", "inputs": {"model": ["40", 0], "cfg": 1.0, "start_percent": 0.769, "end_percent": 1.0}},
        "126": {"class_type": "RescaleCFG", "inputs": {"model": ["279", 0], "multiplier": 0.5}},
        "91": {"class_type": "Trellis2ShapeStage", "inputs": {"positive": ["299", 0], "negative": ["299", 1], "voxel": ["119", 0]}},
        "18": {"class_type": "KSampler", "inputs": {"model": ["126", 0], "positive": ["91", 0], "negative": ["91", 1],
                                                    "latent_image": ["91", 2], "seed": seed, "steps": 20, "cfg": 7.5,
                                                    "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
        "94": {"class_type": "Trellis2UpsampleStage", "inputs": {"positive": ["91", 0], "negative": ["91", 1],
                                                                 "shape_latent": ["18", 0], "vae": ["117", 0],
                                                                 "target_resolution": 1536}},
        "23": {"class_type": "KSampler", "inputs": {"model": ["126", 0], "positive": ["94", 0], "negative": ["94", 1],
                                                    "latent_image": ["94", 2], "seed": seed, "steps": 12, "cfg": 7.5,
                                                    "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "92": {"class_type": "VaeDecodeShapeTrellis", "inputs": {"samples": ["23", 0], "vae": ["117", 0]}},
        # textura (voxels de cor)
        "98": {"class_type": "Trellis2TextureStage", "inputs": {"positive": ["94", 0], "negative": ["94", 1], "shape_latent": ["23", 0]}},
        "12": {"class_type": "KSampler", "inputs": {"model": ["40", 0], "positive": ["98", 0], "negative": ["98", 1],
                                                    "latent_image": ["98", 2], "seed": seed + 1, "steps": 12, "cfg": 1.0,
                                                    "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
        "93": {"class_type": "VaeDecodeTextureTrellis", "inputs": {"samples": ["12", 0], "vae": ["118", 0], "shape_subdivides": ["92", 1]}},
        # limpeza -> malha leve para jogo -> UV -> bake
        "241": {"class_type": "RemeshMesh", "inputs": {"mesh": ["92", 0], "resolution": 512, "sign_mode": "solid",
                                                       "sign_mode.fill": 20.0, "sign_mode.qef": False, "band": 1.0,
                                                       "project_back": 0.0, "fix_poles": False, "smooth_iters": 20,
                                                       "drop_small_components": 0.01, "precluster_max_verts": 20000000}},
        "186": {"class_type": "DecimateMesh", "inputs": {"mesh": ["241", 0], "target_face_count": faces, "placement_mode": "midpoint"}},
        "238": {"class_type": "MeshSmoothNormals", "inputs": {"mesh": ["186", 0], "crease_angle": 180.0}},
        "196": {"class_type": "UnwrapMesh", "inputs": {"mesh": ["238", 0], "segmenter": "pec", "resolution": tex, "padding": 1, "weld_distance": 0.0002}},
        "147": {"class_type": "BakeTextureFromVoxel", "inputs": {"mesh": ["196", 0], "voxel_colors": ["93", 0],
                                                                 "reference_mesh": ["92", 0], "texture_size": tex}},
        "224": {"class_type": "BakeNormalMapFromMesh", "inputs": {"low_poly": ["196", 0], "high_poly": ["241", 0],
                                                                  "resolution": tex, "cage_distance": 0.05, "ignore_backfaces": True}},
        "210": {"class_type": "ApplyTextureToMesh", "inputs": {"mesh": ["196", 0], "base_color": ["147", 0], "metallic": ["147", 1],
                                                               "roughness": ["147", 2], "normal_map": ["224", 0]}},
        "260": {"class_type": "MeshSmoothNormals", "inputs": {"mesh": ["210", 0], "crease_angle": 180.0}},
        "500": {"class_type": "SaveGLB", "inputs": {"mesh": ["260", 0], "filename_prefix": "3d/domino_cabeca"}},
    })
    return g


def hunyuan(img, seed, faces, tex):
    g = {}
    im = prep(g, img)
    g.update({
        "54": {"class_type": "ImageOnlyCheckpointLoader", "inputs": {"ckpt_name": "hunyuan3d-dit-v2-mini_fp16.safetensors"}},
        "51": {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["54", 1], "image": im, "crop": "center"}},
        "80": {"class_type": "Hunyuan3Dv2Conditioning", "inputs": {"clip_vision_output": ["51", 0]}},
        "70": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["54", 0], "shift": 1.0}},
        "66": {"class_type": "EmptyLatentHunyuan3Dv2", "inputs": {"resolution": 3072, "batch_size": 1}},
        "3": {"class_type": "KSampler", "inputs": {"model": ["70", 0], "positive": ["80", 0], "negative": ["80", 1],
                                                   "latent_image": ["66", 0], "seed": seed, "steps": 30, "cfg": 5.0,
                                                   "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
        "61": {"class_type": "VAEDecodeHunyuan3D", "inputs": {"samples": ["3", 0], "vae": ["54", 2], "num_chunks": 8000, "octree_resolution": 256}},
        "81": {"class_type": "VoxelToMesh", "inputs": {"voxel": ["61", 0], "algorithm": "surface net", "threshold": 0.6}},
        "186": {"class_type": "DecimateMesh", "inputs": {"mesh": ["81", 0], "target_face_count": faces, "placement_mode": "midpoint"}},
        "500": {"class_type": "SaveGLB", "inputs": {"mesh": ["186", 0], "filename_prefix": "3d/domino_cabeca"}},
    })
    return g


BUILD = {"trellis2": trellis2, "hunyuan": hunyuan}


def run(g, timeout=20 * 60):
    # REGRA do Gabriel (13/nov/2026): nenhum modelo de IA trabalha por mais de 20 min. Estoura o limite → TimeoutError (o job no ComfyUI segue; interrompa com POST /interrupt).
    # no script embora tenham terminado no ComfyUI (~65-70 min). Ver também --recuperar.
    pid = gen.post("/prompt", {"prompt": g, "client_id": "domino_cabecas"})["prompt_id"]
    return wait(pid, timeout)


def wait(pid, timeout=20 * 60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        time.sleep(2.0)
        h = gen.post(f"/history/{pid}")
        if pid not in h:
            continue
        st = h[pid].get("status", {})
        if st.get("status_str") == "error":
            raise RuntimeError(json.dumps(st.get("messages"))[-3000:])
        for out in h[pid]["outputs"].values():
            for key, items in out.items():
                for it in items if isinstance(items, list) else []:
                    if isinstance(it, dict) and str(it.get("filename", "")).lower().endswith(".glb"):
                        q = urllib.parse.urlencode({"filename": it["filename"], "subfolder": it.get("subfolder", ""),
                                                    "type": it.get("type", "output")})
                        return urllib.request.urlopen(f"{HOST}/view?{q}").read()
        raise RuntimeError("sem GLB nas saídas: " + json.dumps(h[pid]["outputs"])[:1500])
    raise TimeoutError(pid)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+")
    ap.add_argument("--model", choices=list(BUILD), required=True)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--faces", type=int, default=40000)
    ap.add_argument("--tex", type=int, default=2048)
    ap.add_argument("--recuperar", metavar="PROMPT_ID",
                    help="baixa o GLB de um prompt que já terminou no ComfyUI (uma imagem só)")
    a = ap.parse_args()
    out = os.path.join(ROOT, "modelos", a.model)
    os.makedirs(out, exist_ok=True)
    ip = os.path.join(out, "index.json")
    for path in a.images:
        name = os.path.splitext(os.path.basename(path))[0]
        dst = os.path.join(out, f"{name}.glb")
        if os.path.exists(dst):
            print("skip", dst, flush=True)
            continue
        t = time.time()
        try:
            glb = (wait(a.recuperar) if a.recuperar
                   else run(BUILD[a.model](gen.upload_image(path), a.seed, a.faces, a.tex)))
        except Exception as e:  # registra e segue para a próxima
            print(f"ERRO {name}: {e}"[:3000], flush=True)
            continue
        open(dst, "wb").write(glb)
        idx = json.load(open(ip, encoding="utf-8")) if os.path.exists(ip) else {}
        idx[f"{name}.glb"] = dict(src=os.path.relpath(path, ROOT).replace("\\", "/"), model=a.model, seed=a.seed,
                                  faces=a.faces, tex=a.tex, seconds=round(time.time() - t, 1),
                                  created=time.strftime("%Y-%m-%d %H:%M:%S"))
        json.dump(idx, open(ip, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print(f"{a.model} {name}.glb {len(glb)/1e6:.1f} MB {time.time() - t:.0f}s", flush=True)


if __name__ == "__main__":
    main()
