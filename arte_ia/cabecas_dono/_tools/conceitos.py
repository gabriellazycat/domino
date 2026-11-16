"""Concepts 2D das cabeças do "dono da mesa" (teste de pipeline IA -> 3D).

Usa o ComfyUI local (127.0.0.1:8188) e o grafo Qwen-Image 2.1 Turbo de LastBoss/arte_ia/_tools/gen.py
(importado só para leitura). Saída: arte_ia/cabecas_dono/conceitos/<id>.png + index.json.
Uso: python conceitos.py [ids...] [--seed N] [--size 768]
"""
import argparse, json, os, sys, time

sys.path.insert(0, r"C:\Users\gabri\Desktop\LastBoss\arte_ia\_tools")
import gen  # noqa: E402  (workflow(), run())

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "conceitos")

# Bloco fixo: o que torna a imagem boa de virar 3D (uma cabeça, de frente, centrada, fundo liso, luz suave).
FRAME = ("Studio product photograph of a single antique ventriloquist dummy head with its short neck, "
         "seen straight from the front at eye level, perfectly centered, the whole head and neck visible with "
         "empty space around it, isolated on a plain flat light grey seamless background, soft even diffuse "
         "lighting, no strings, no body, no hands, no text, sharp focus, realistic materials. ")
# Estilos: mesmo enquadramento (bom para 3D), acabamento diferente.
STYLES = {
    "foto": FRAME,
    "jogo": ("Stylized 3D game character asset render of a single ventriloquist dummy head with its short neck, "
             "slightly exaggerated cartoon proportions with a big head and large eyes, hand-painted textures, "
             "seen straight from the front at eye level, perfectly centered, whole head and neck visible, isolated "
             "on a plain flat light grey background, soft even lighting, no body, no text. "),
    "pintado": ("Hand-painted concept art of a single ventriloquist dummy head with its short neck, painterly "
                "brushwork, dark fairy-tale toy mood, seen straight from the front at eye level, perfectly "
                "centered, whole head and neck visible, isolated on a plain flat light grey background, even "
                "lighting, no body, no text. "),
}

HEADS = {
    "entalhado": "Hand-carved wooden head with visible knife facets, carved side-parted auburn hair in chunky "
                 "grooves, painted rosy round cheeks, glossy glass eyes with blue irises, thick painted eyebrows, "
                 "a hinged jaw with two vertical seam lines from the mouth corners to the chin, wide painted grin "
                 "showing a row of carved teeth, worn cream paint over pale wood.",
    "rachado": "Old cracked painted wooden head, the cream face paint peeling in flakes and showing dark wood "
               "underneath, a long crack across the forehead, sunken dark eye sockets with glossy staring glass "
               "eyes, faded red lips in a stiff grin, hinged jaw with vertical seam lines, slick dark brown "
               "carved hair, unsettling and eerie.",
    "marionete": "Rustic folk-art wooden puppet head carved in big blocky facets, short orange carved hair, "
                 "sleepy half-closed painted eyelids over pale blue eyes, a bulbous red-painted nose, small "
                 "freckles, a thin painted smile, hinged jaw with seam lines, raw pale wood with thin washes of "
                 "colour and visible tool marks.",
    "cavalheiro": "Distinguished old gentleman ventriloquist dummy head, carved wood with ivory paint, "
                  "a monocle on a thin chain over the right glass eye, a curled waxed painted moustache, grey "
                  "carved hair combed back, raised arched eyebrow, hinged jaw with seam lines, smug thin-lipped "
                  "smile, varnish yellowed with age.",
    "palhaco": "Antique carnival clown ventriloquist dummy head, carved wood, faded white face paint with "
               "chipped red diamond shapes around the glass eyes, a small round red nose, painted wide red "
               "mouth with a hinged jaw and seam lines, tufts of carved curly hair painted faded green, cracked "
               "old varnish, slightly sinister.",
    "apostador": "Gambler ventriloquist dummy head, carved wood with tan paint, slicked-back glossy black "
                 "carved hair, one painted gold tooth in a crooked grin, a thin pencil moustache, a black eye "
                 "patch over the left eye and a glass eye on the right, hinged jaw with seam lines, a small "
                 "domino tile carved as an earring, worn and scratched paint.",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*", default=list(HEADS))
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--size", type=int, default=768)
    ap.add_argument("--model", default="qwen21t", choices=list(gen.MODELS))
    ap.add_argument("--style", default="foto", choices=list(STYLES))
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    ip = os.path.join(OUT, "index.json")
    for hid in a.ids:
        # o primeiro lote (qwen21t + foto) ficou com o nome curto <id>__s<seed>.png
        name = (f"{hid}__s{a.seed}.png" if (a.model, a.style) == ("qwen21t", "foto")
                else f"{hid}__{a.model}__{a.style}__s{a.seed}.png")
        if os.path.exists(os.path.join(OUT, name)):
            print("skip", name, flush=True)
            continue
        prompt = STYLES[a.style] + HEADS[hid]
        g, _ = gen.workflow(a.model, prompt, a.seed, a.size, a.size)
        g["13"]["inputs"]["filename_prefix"] = "domino_cabeca_tmp"
        t = time.time()
        png = gen.run(g)
        open(os.path.join(OUT, name), "wb").write(png)
        idx = json.load(open(ip, encoding="utf-8")) if os.path.exists(ip) else {}
        idx[name] = dict(id=hid, seed=a.seed, size=a.size, model=a.model, style=a.style, prompt=prompt,
                         seconds=round(time.time() - t, 1), created=time.strftime("%Y-%m-%d %H:%M:%S"))
        json.dump(idx, open(ip, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print(f"{name} {time.time() - t:.0f}s", flush=True)


if __name__ == "__main__":
    main()
