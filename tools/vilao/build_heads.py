# Dono da mesa: 3 variações de cabeça de boneco de ventríloquo, esculpidas por script no Blender.
#
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python tools/vilao/build_heads.py -- [1 2 3]
#
# Cada cabeça é UMA malha contínua (esfera subdividida "esculpida" por empurrões suaves: testa, órbitas,
# nariz, maçãs, queixo, orelhas, cabelo), pintada por vértice (pele, blush, lábios, sobrancelhas, cabelo).
# O queixo articulado é recortado da própria cabeça (a fenda clássica do boneco), então ele encaixa
# perfeito e pode girar. Olhos e pálpebras são peças soltas (para animar no jogo).
# Saída: tools/vilao/out/vilao-N-*.png (prévias) e tools/vilao/out/vilao-N.blend.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix
import numpy as np

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
WHICH = [int(a) for a in argv if a.isdigit()] or [1, 2, 3]
PREVIEW = 'draft' in argv


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(lerp(c1[i], c2[i], t) for i in range(3))


def srgb(hexs):
    h = hexs.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# ------------------------------------------------------------------ variações
BASE = dict(
    name='base',
    scale=(0.90, 0.98, 1.06),      # largura, profundidade, altura do crânio
    jaw_w=0.80, jaw_y=0.92,        # afinamento para o queixo (1 = sem afinar)
    chin=0.10, chin_z=-0.74, chin_s=0.20,
    cheek=0.09, cheek_x=0.50, cheek_z=-0.18, cheek_s=0.20,
    brow=0.06, brow_z=0.33,
    socket=-0.09, eye_x=0.335, eye_z=0.16, eye_r=0.19, eye_in=0.14,
    nose=0.26, nose_w=0.10, nose_h=0.17, nose_z=-0.02, nose_tip=0.11, nose_tip_z=-0.10, nostril=0.05,
    muzzle=0.06, mouth_z=-0.44, mouth_w=0.36, lip=0.035,
    ear=0.24, ear_z=0.04, ear_h=0.19,
    temple=-0.03,
    hairline=0.66, hair_back=-0.35, hair_amp=0.055, hair_groove=0.012, part=0.30, widow=0.0, bald=0.0,
    sideburn=0.0, mustache=0.0, brow_bush=0.0,
    skin='#e3bd96', skin2='#c9966e', blush='#d2625a', blush_a=0.55, lips='#9a2420', hair='#2b170c',
    brow_col='#2b170c', brow_tilt=0.0, brow_arc=0.05, brow_th=0.030, shadow=0.0, shadow_col='#5a3040',
    freckles=0, iris='#4f7f8c', wear=0.0, rough=0.34,
    lid=0.30, jaw_open=7.0, smile=0.0,
    hat=None, monocle=False, suit='#17141c', shirt='#e2d8c2', bow='#8a1622',
)

VARIANTS = {
    # 1 · O GAROTO: boneco clássico de teatro de variedades. Rosto redondo, bochechas de maçã, sardas,
    #     cabelo laqueado com risca, cartola. Simpático demais para ser confiável.
    1: dict(BASE, name='garoto', scale=(0.95, 0.99, 1.02), jaw_w=0.86, cheek=0.12, cheek_s=0.23, chin=0.08,
            nose=0.20, nose_tip=0.13, nose_w=0.11, nose_h=0.13, eye_r=0.205, eye_x=0.34, brow_arc=0.075,
            blush_a=0.8, freckles=26, hat='top', lid=0.22, smile=0.05, mouth_w=0.40, jaw_open=9.0),
    # 2 · O SINISTRO: rosto comprido e magro, maçãs altas, órbitas fundas com sombra, cabelo preto com bico
    #     de viúva, sobrancelhas finas e caídas para dentro. Tinta pálida. É o que mais mete medo.
    2: dict(BASE, name='sinistro', scale=(0.82, 0.96, 1.16), jaw_w=0.66, jaw_y=0.88, chin=0.15, chin_z=-0.78, chin_s=0.15,
            cheek=0.10, cheek_x=0.47, cheek_z=-0.05, cheek_s=0.14, socket=-0.12, brow=0.09, eye_r=0.20, eye_x=0.32, eye_z=0.17,
            nose=0.30, nose_w=0.075, nose_h=0.22, nose_tip=0.07, nose_tip_z=-0.14, nostril=0.035,
            mouth_w=0.42, mouth_z=-0.46, lip=0.022, temple=-0.07, hairline=0.70, widow=0.20, hair='#0c0a0e', brow_col='#0c0a0e',
            brow_tilt=0.42, brow_arc=0.02, brow_th=0.032, shadow=0.75, skin='#dccdb6', skin2='#a89880', blush_a=0.12,
            lips='#6e1218', iris='#b9c26a', lid=0.30, jaw_open=11.0, part=0.0, bow='#5a0d14', rough=0.28),
    # 3 · O VELHO: madeira escura envernizada e gasta, nariz grande, sobrancelhas e bigode entalhados
    #     e pintados de branco, careca com cabelo só dos lados, monóculo. Um avô que trapaceia.
    3: dict(BASE, name='velho', scale=(0.96, 0.98, 1.00), jaw_w=0.94, jaw_y=0.96, chin=0.13, chin_s=0.24, chin_z=-0.70,
            cheek=0.10, cheek_z=-0.24, cheek_s=0.24, brow=0.10, brow_bush=0.07, socket=-0.10, eye_r=0.205,
            nose=0.34, nose_w=0.13, nose_h=0.19, nose_tip=0.17, nose_tip_z=-0.12, nostril=0.08, mustache=0.10,
            mouth_z=-0.50, mouth_w=0.34, hairline=0.40, bald=1.0, hair_back=-0.30, hair='#d9d2c0', brow_col='#e4dccb',
            brow_arc=0.05, brow_th=0.055, brow_tilt=-0.12, skin='#b98858', skin2='#7a4f2c', blush='#b3503c', blush_a=0.45,
            lips='#7a2a22', iris='#6a4a2a', wear=1.0, rough=0.42, lid=0.24, jaw_open=6.0, monocle=True, bow='#2f4a3a',
            part=0.0, sideburn=0.25),
}


# ------------------------------------------------------------------ escultura
def sculpt(p, V):
    """Ponto da esfera unitária (x direita, -y frente, z cima) -> posição esculpida + cor."""
    x, y, z = p
    front = smooth(0.15, -0.35, y)             # 1 na frente, 0 atrás
    sx, sy, sz = V['scale']
    # afina para o queixo
    t = smooth(-0.05, -0.85, z)
    # cabeça em bloco: superelipsoide (boxy 2 = esfera; 3 a 4 = caixa de cantos redondos)
    kb = V.get('boxy', 2.0)
    rb = (abs(x) ** kb + abs(y) ** kb + abs(z) ** kb) ** (-1.0 / kb) if kb != 2.0 else 1.0
    P = Vector((x * rb * sx * lerp(1, V['jaw_w'], t), y * rb * sy * lerp(1, V['jaw_y'], t), z * rb * sz))
    n = Vector(p)
    fwd = Vector((0, -1, 0))

    def g(cx, cz, sxx, szz, both=True):
        """peso gaussiano em volta de (±cx, cz) na frente do rosto"""
        w = 0.0
        for s in ((-1, 1) if both and cx else (1,)):
            w = max(w, math.exp(-(((x - s * cx) / sxx) ** 2 + ((z - cz) / szz) ** 2)))
        return w * front

    # testa/sobrancelha (crista), órbitas (côncavo), têmporas
    wb = g(0, V['brow_z'], 0.50, 0.085)
    P += n * V['brow'] * wb
    wbb = g(V['eye_x'], V['brow_z'] + 0.02, 0.17, 0.06)
    P += fwd * V['brow_bush'] * wbb
    P += n * V['socket'] * g(V['eye_x'], V['eye_z'], 0.17, 0.14)
    side = smooth(0.55, 0.9, abs(x))
    P += n * V['temple'] * side * math.exp(-((z - 0.25) / 0.2) ** 2)
    # maçãs do rosto e bochechas
    P += n * V['cheek'] * g(V['cheek_x'], V['cheek_z'], V['cheek_s'], V['cheek_s'] * 0.9)
    # nariz: dorso + ponta em bola + asas
    P += fwd * V['nose'] * g(0, V['nose_z'], V['nose_w'], V['nose_h'])
    P += fwd * V['nose_tip'] * g(0, V['nose_tip_z'], V['nose_w'] * 1.15, 0.09)
    P += fwd * V['nostril'] * g(V['nose_w'] * 1.05, V['nose_tip_z'] - 0.01, 0.055, 0.05)
    # focinho (volume da boca), bigode entalhado, queixo
    P += fwd * V['muzzle'] * g(0, V['mouth_z'] + 0.04, 0.30, 0.13)
    wm = g(0.13, V['mouth_z'] + 0.105, 0.17, 0.045)
    P += fwd * V['mustache'] * wm
    P += (n * 0.5 + fwd * 0.5) * V['chin'] * g(0, V['chin_z'], V['chin_s'], V['chin_s'] * 0.8)
    # sorriso: cantos da boca puxados para cima e para fora
    P += Vector((0, 0, 1)) * V['smile'] * g(V['mouth_w'] * 0.95, V['mouth_z'], 0.1, 0.08)
    # orelhas: abas para fora, com a concha côncava na frente
    for s in (-1, 1):
        we = math.exp(-(((y - 0.04) / 0.15) ** 4 + ((z - V['ear_z']) / V['ear_h']) ** 4)) * smooth(0.55, 0.97, x * s)
        P += Vector((s, 0.18, 0)) * V['ear'] * we

    # ---- cabelo: volume acima da linha do cabelo, com sulcos de pente
    back = smooth(-0.35, 0.45, y)
    hl = lerp(V['hairline'], V['hair_back'], back)
    hl -= V['widow'] * math.exp(-(x / 0.13) ** 2) * (1 - back)            # bico de viúva
    hl += 0.10 * math.exp(-((abs(x) - 0.42) / 0.16) ** 2) * (1 - back)    # entradas
    hl -= V['sideburn'] * smooth(0.55, 0.85, abs(x)) * math.exp(-((y + 0.05) / 0.3) ** 2)
    hair = smooth(hl - 0.012, hl + 0.022, z)
    if V['bald']:
        # careca: só uma coroa de cabelo dos lados e atrás
        crown = smooth(0.62, 0.50, z) * smooth(-0.30, 0.05, y + 0.25 * (1 - abs(x)))
        hair *= crown
    hair_raw = hair
    if V.get('hair_mode') == 'none':   # boneco montado: a cabeça fica careca e o cabelo é uma peça à parte
        hair = 0.0
    comb = x * 1.0 + y * 0.6 if V['part'] else math.atan2(x, -y + 0.001) * 0.6
    if V['part']:
        part = math.exp(-((x - V['part']) / 0.02) ** 2) * smooth(0.2, -0.3, y)
        P -= n * 0.03 * part * hair
    P += n * hair * (V['hair_amp'] + V['hair_groove'] * math.sin(comb * 70 + math.sin(z * 9) * 2))

    # ---- pintura
    skin, skin2 = srgb(V['skin']), srgb(V['skin2'])
    col = mix(skin, skin2, smooth(0.0, -0.9, z) * 0.55 + (1 - front) * 0.25)
    # sombra em volta das órbitas
    col = mix(col, srgb(V['shadow_col']), V['shadow'] * g(V['eye_x'], V['eye_z'] - 0.01, 0.2, 0.17) * 0.8)
    # blush
    col = mix(col, srgb(V['blush']), V['blush_a'] * g(V['cheek_x'] + 0.04, V['cheek_z'] - 0.02, 0.16, 0.12))
    col = mix(col, srgb(V['blush']), 0.35 * g(0, V['nose_tip_z'], 0.09, 0.07))
    # sobrancelhas pintadas: arco acima do olho
    for s in (-1, 1):
        u = (x * s - V['eye_x']) / 0.20
        if -1.05 < u < 1.05 and front > 0.5:
            zc = V['brow_z'] + 0.055 + V['brow_arc'] * (1 - u * u) + V['brow_tilt'] * 0.14 * (-u)
            th = V['brow_th'] * (1.0 - 0.45 * abs(u))
            col = mix(col, srgb(V['brow_col']), smooth(th, th * 0.55, abs(z - zc)))
    # bigode
    if V['mustache']:
        col = mix(col, srgb(V['brow_col']), smooth(0.35, 0.6, wm))
    # lábios: uma faixa em volta da linha da boca (o de baixo fica no queixo móvel)
    mw = V['mouth_w']
    lipw = smooth(mw * 0.98, mw * 0.80, abs(x)) * front
    dz = z - V['mouth_z']
    up = V['lip'] * (1.0 + 0.5 * math.exp(-((abs(x) - 0.07) / 0.06) ** 2) - 0.35 * math.exp(-(x / 0.035) ** 2))
    if 0 <= dz < up * 1.3:
        col = mix(col, srgb(V['lips']), smooth(up * 1.25, up * 0.9, dz) * lipw)
    if -V['lip'] * 1.9 < dz < 0:
        col = mix(col, srgb(V['lips']), smooth(-V['lip'] * 1.8, -V['lip'] * 1.3, dz) * lipw)
    # sardas
    if V['freckles']:
        for i in range(V['freckles']):
            fx = 0.30 + 0.34 * ((i * 0.618) % 1.0)
            fz = V['cheek_z'] + 0.02 + 0.16 * ((i * 0.377) % 1.0)
            s = 1 if i % 2 else -1
            if (x - s * fx) ** 2 + (z - fz) ** 2 < 0.012 ** 2 and front > 0.5:
                col = mix(col, (0.25, 0.10, 0.05), 0.55)
    # desgaste do verniz (velho): manchas mais claras nas partes altas
    if V['wear']:
        wn = 0.5 + 0.5 * math.sin(x * 23 + z * 17) * math.sin(y * 19 - z * 11)
        col = mix(col, srgb('#d8b890'), V['wear'] * 0.22 * smooth(0.55, 0.95, wn))
    col = mix(col, srgb(V['hair']), hair)
    return P, col, hair_raw


def new_obj(name, mesh):
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    return o


def paint_mat(name, rough, coat=0.2):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    for k in ('Coat Weight', 'Coat'):
        if k in bsdf.inputs:
            bsdf.inputs[k].default_value = coat
            break
    if 'Coat Roughness' in bsdf.inputs:
        bsdf.inputs['Coat Roughness'].default_value = 0.12
    return m


def flat_mat(name, color, rough=0.5, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    c = srgb(color) if isinstance(color, str) else color
    bsdf.inputs['Base Color'].default_value = (*c, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*c, 1)
        bsdf.inputs['Emission Strength'].default_value = emit
    return m


def mesh_from(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def shade(me, angle=40):
    bm = bmesh.new()
    bm.from_mesh(me)
    lim = math.radians(angle)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > lim)
    bm.to_mesh(me)
    bm.free()


def boolean(a, b, op):
    m = a.modifiers.new('bool', 'BOOLEAN')
    m.operation = op
    m.object = b
    try:
        m.solver = 'EXACT'
    except TypeError:
        pass
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(a.evaluated_get(dg))
    a.modifiers.remove(m)
    old = a.data
    a.data = me
    bpy.data.meshes.remove(old)


def box_obj(name, lo, hi, mat=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    lo, hi = Vector(lo), Vector(hi)
    for v in bm.verts:
        v.co = Vector((lerp(lo.x, hi.x, v.co.x + 0.5), lerp(lo.y, hi.y, v.co.y + 0.5), lerp(lo.z, hi.z, v.co.z + 0.5)))
    o = new_obj(name, mesh_from(bm, name))
    if mat:
        o.data.materials.append(mat)
    return o


def sphere_obj(name, center, r, seg=48, rings=32):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    o = new_obj(name, mesh_from(bm, name))
    o.location = center
    return o


def build_head(V):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=7 if not PREVIEW else 6, radius=1.0)
    layer = bm.loops.layers.color.new('Col')
    cols = {}
    dirs = []
    for v in bm.verts:
        d = v.co.normalized()
        dirs.append(tuple(d))
        P, c, _hair = sculpt(tuple(d), V)
        v.co = P
        cols[v.index] = c
    if V.get('facet'):
        # talha: a superfície vira um mosaico de planos (cada vértice vai para o plano da "goivada" mais
        # próxima), como madeira cortada a formão. A malha continua fina, então a pintura não perde detalhe.
        import random
        rnd = random.Random(V.get('facet_seed', 5))
        M = V.get('facet_n', 150)
        cells = []
        while len(cells) < M:
            c3 = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
            if 0.2 < c3.length < 1:
                cells.append(c3.normalized())
        cn = np.array([tuple(c3) for c3 in cells])
        cp = np.array([tuple(sculpt(tuple(c3), V)[0]) for c3 in cells])
        plane = (cp * cn).sum(axis=1)                    # distância de cada plano à origem
        D = np.array(dirs)
        Pn = np.array([tuple(v.co) for v in bm.verts])
        idx = (D @ cn.T).argmax(axis=1)
        den = (Pn * cn[idx]).sum(axis=1)
        tscale = np.clip(plane[idx] / np.maximum(den, 1e-4), 0.8, 1.2)
        # o miolo do rosto (olhos, nariz, boca) fica menos facetado para não quebrar as feições
        face = np.exp(-((D[:, 0] / 0.45) ** 2 + ((D[:, 2] - 0.0) / 0.5) ** 2)) * (D[:, 1] < 0)
        k = V['facet'] * (1 - 0.65 * face)
        Pn = Pn * (1 + (tscale - 1) * k)[:, None]
        for v, p in zip(bm.verts, Pn):
            v.co = Vector(p)
    for f in bm.faces:
        for l in f.loops:
            l[layer] = (*cols[l.vert.index], 1.0)
    head = new_obj('cabeca', mesh_from(bm, 'cabeca'))
    skin = paint_mat('pintura', V['rough'])
    cav = flat_mat('boca', '#0a0203', 0.9)
    head.data.materials.append(skin)
    head.data.materials.append(cav)

    def at(x, z, y=-0.9):
        d = Vector((x, y, z)).normalized()
        return sculpt(tuple(d), V)[0]

    # ---- órbitas (recorte), olhos e pálpebras
    eyes = []
    for s in (-1, 1):
        surf = at(s * V['eye_x'], V['eye_z'])
        c = surf + Vector((-s * 0.01, V['eye_in'], 0))
        cut = sphere_obj('corte', c, V['eye_r'] * 1.07)
        cut.data.materials.append(skin)
        boolean(head, cut, 'DIFFERENCE')
        bpy.data.objects.remove(cut)
        eyes.append((s, c))

    # ---- boca: fenda do queixo (o queixo é a própria cabeça recortada)
    pm = at(0, V['mouth_z'])
    wide = at(V['mouth_w'], V['mouth_z']).x
    zm = pm.z
    depth = pm.y + 0.62
    gap = 0.014
    jaw = new_obj('queixo', head.data.copy())
    slot = box_obj('fenda', (-wide, -3, -3), (wide, depth, zm), cav)
    boolean(jaw, slot, 'INTERSECT')
    bpy.data.objects.remove(slot)
    slot = box_obj('fenda', (-wide - gap, -3, -3), (wide + gap, depth + gap, zm + gap * 0.6), cav)
    # dentes de cima: uma lâmina da própria cabeça, logo abaixo do lábio
    teeth = new_obj('dentes', head.data.copy())
    tcut = box_obj('tc', (-wide * 0.86, -3, zm - 0.085), (wide * 0.86, pm.y + 0.2, zm + 0.01))
    boolean(teeth, tcut, 'INTERSECT')
    bpy.data.objects.remove(tcut)
    teeth.data.materials.clear()
    teeth.data.materials.append(flat_mat('dente', '#e9e0c8', 0.3))
    teeth.scale = (0.97, 0.965, 1.0)
    teeth.location = (0, 0.02, 0)
    boolean(head, slot, 'DIFFERENCE')
    bpy.data.objects.remove(slot)
    # fundo da boca (parede escura atrás dos dentes)
    back = box_obj('fundo', (-wide * 0.8, pm.y + 0.27, zm - 0.15), (wide * 0.8, pm.y + 0.31, zm), cav)
    back.parent = head
    # dobradiça do queixo: atrás, na altura da boca
    hinge = Vector((0, depth - 0.05, zm - 0.02))
    jaw.data.transform(Matrix.Translation(-hinge))
    jaw.location = hinge
    jaw.rotation_euler = (math.radians(V['jaw_open']), 0, 0)
    jaw.parent = head
    teeth.parent = head
    for o in (head, jaw, teeth):
        shade(o.data, V.get('shade', 40))

    # ---- olhos de vidro pintados + pálpebras
    eye_mat = paint_mat('olho', 0.06, 1.0)
    lid_mat = flat_mat('palpebra', mix(srgb(V['skin']), srgb(V['shadow_col']), V['shadow'] * 0.6), V['rough'])
    for s, c in eyes:
        bmx = bmesh.new()
        bmesh.ops.create_uvsphere(bmx, u_segments=48, v_segments=48, radius=V['eye_r'])
        lay = bmx.loops.layers.color.new('Col')
        iris, white = srgb(V['iris']), srgb('#efe6d2')
        for f in bmx.faces:
            for l in f.loops:
                a = l.vert.co.normalized().angle(Vector((0, 0, 1)))
                col = white
                if a < 0.62:
                    col = mix(iris, (0.02, 0.02, 0.02), smooth(0.50, 0.62, a) * 0.9)
                    col = mix(col, mix(iris, (1, 1, 1), 0.25), smooth(0.3, 0.2, a) * 0.5)
                if a < 0.24:
                    col = (0.004, 0.004, 0.004)
                if 0.62 <= a < 0.75:
                    col = mix((0.25, 0.12, 0.08), white, smooth(0.62, 0.75, a))
                l[lay] = (*col, 1)
            f.smooth = True
        eye = new_obj('olho', mesh_from(bmx, 'olho'))
        eye.data.materials.append(eye_mat)
        eye.location = c
        # o polo (íris) aponta para a frente, um pouco para baixo e para dentro (olhando a mesa)
        eye.rotation_euler = (math.radians(90 + 9), 0, math.radians(-s * 5))
        eye.parent = head
        # pálpebra de cima: meia casca
        bml = bmesh.new()
        bmesh.ops.create_uvsphere(bml, u_segments=40, v_segments=24, radius=V['eye_r'] * 1.045)
        bmesh.ops.delete(bml, geom=[v for v in bml.verts if v.co.z < -0.001], context='VERTS')
        for f in bml.faces:
            f.smooth = True
        lid = new_obj('palpebra', mesh_from(bml, 'palpebra'))
        lid.data.materials.append(lid_mat)
        sol = lid.modifiers.new('esp', 'SOLIDIFY')
        sol.thickness = 0.012
        lid.location = c
        # fechada = casca virada para a frente; `lid` 0..1 = quanto está caída
        lid.rotation_euler = (math.radians(lerp(-62, 55, V['lid'])), 0, math.radians(s * V['brow_tilt'] * 20))
        lid.parent = head

    # ---- pescoço de madeira, busto com paletó pintado, gravata-borboleta
    wood = flat_mat('madeira', '#6a4426', 0.6)
    bmn = bmesh.new()
    bmesh.ops.create_cone(bmn, segments=32, radius1=0.36, radius2=0.30, depth=0.8, cap_ends=True)
    neck = new_obj('pescoco', mesh_from(bmn, 'pescoco'))
    neck.location = (0, 0.05, -1.15 * V['scale'][2])
    neck.data.materials.append(wood)
    shade(neck.data)
    neck.parent = head
    bmb = bmesh.new()
    bmesh.ops.create_icosphere(bmb, subdivisions=6, radius=1.0)
    lay = bmb.loops.layers.color.new('Col')
    suit, shirt = srgb(V['suit']), srgb(V['shirt'])
    for v in bmb.verts:
        x, y, z = v.co.normalized()
        sh = smooth(0.2, 0.9, z)             # ombros caem
        P = Vector((x * 1.55 * lerp(1.0, 0.72, sh), y * 0.80, z * 0.95))
        # gola: um degrau em volta do pescoço
        r = math.hypot(x, y)
        P.z += 0.10 * smooth(0.50, 0.34, r) * (1 if z > 0 else 0)
        v.co = P
    for f in bmb.faces:
        f.smooth = True
        for l in f.loops:
            x, y, z = l.vert.co
            col = suit
            if y < 0:
                vdepth = (0.95 - z) * 0.42            # V da camisa
                if abs(x) < vdepth:
                    col = shirt
                    if abs(x) < 0.022 and z < 0.6:      # carreira de botões
                        col = mix(shirt, (0.2, 0.2, 0.2), 0.6 if (z * 9) % 1 < 0.3 else 0.0)
                elif abs(x) < vdepth + 0.16:
                    col = mix(suit, (0.0, 0.0, 0.0), 0.5)   # lapela de cetim
            r = math.hypot(x, y)
            if r < 0.52 and z > 0.7:
                col = shirt                              # colarinho
            l[lay] = (*col, 1)
    bust = new_obj('busto', mesh_from(bmb, 'busto'))
    bust.data.materials.append(paint_mat('roupa', 0.85, 0.0))
    bust.location = (0, 0.08, -2.35 * V['scale'][2])
    bust.parent = head
    bow_mat = flat_mat('gravata', V['bow'], 0.55)
    for s in (-1, 1):
        bmw = bmesh.new()
        bmesh.ops.create_icosphere(bmw, subdivisions=3, radius=1.0)
        for v in bmw.verts:
            x, y, z = v.co
            k = smooth(-1, 1, x * s)                 # estreita no nó, abre na ponta
            v.co = Vector((x * 0.26, y * 0.06 * (0.6 + k), z * lerp(0.05, 0.19, k)))
        for f in bmw.faces:
            f.smooth = True
        w = new_obj('laco', mesh_from(bmw, 'laco'))
        w.location = (s * 0.24, -0.50, -1.44 * V['scale'][2])
        w.data.materials.append(bow_mat)
        w.parent = head
    knot = sphere_obj('no', (0, -0.52, -1.44 * V['scale'][2]), 0.085, 20, 14)
    knot.data.materials.append(bow_mat)
    for f in knot.data.polygons:
        f.use_smooth = True
    knot.parent = head

    # ---- acessórios
    top = sculpt((0, 0, 1), V)[0].z
    if V['hat'] == 'top':
        felt = flat_mat('feltro', '#0e0c12', 0.75)
        pts = [(0, 0), (0.86, 0.0), (0.90, 0.03), (0.86, 0.06), (0.56, 0.07), (0.54, 0.12), (0.57, 0.85), (0.60, 0.95), (0.58, 0.98), (0, 0.98)]
        bmh = bmesh.new()
        seg = 48
        rings = []
        for (r, h) in pts:
            rings.append([bmh.verts.new((math.cos(i / seg * 2 * math.pi) * r, math.sin(i / seg * 2 * math.pi) * r * 0.92, h)) for i in range(seg)])
        for a, b in zip(rings, rings[1:]):
            for i in range(seg):
                try:
                    bmh.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i]))
                except ValueError:
                    pass
        bmesh.ops.remove_doubles(bmh, verts=bmh.verts, dist=1e-5)
        hat = new_obj('cartola', mesh_from(bmh, 'cartola'))
        hat.data.materials.append(felt)
        shade(hat.data, 50)
        hat.location = (0.04, 0.05, top - 0.20)
        hat.rotation_euler = (math.radians(-9), math.radians(7), 0)
        hat.parent = head
        band = new_obj('fita', hat.data.copy())
        band.data.materials.clear()
        band.data.materials.append(flat_mat('fitam', V['bow'], 0.4))
        cutb = box_obj('cb', (-2, -2, 0.13), (2, 2, 0.30))
        boolean(band, cutb, 'INTERSECT')
        bpy.data.objects.remove(cutb)
        band.scale = (1.02, 1.02, 1.0)
        band.parent = hat
    if V['monocle']:
        s, c = eyes[1]
        gold = flat_mat('ouro', '#d0a040', 0.25, 1.0)
        bmm = bmesh.new()
        ring = []
        R, r, n1, n2 = V['eye_r'] * 1.25, 0.018, 40, 10
        for i in range(n1):
            a = i / n1 * 2 * math.pi
            ring.append([bmm.verts.new(((R + r * math.cos(j / n2 * 2 * math.pi)) * math.cos(a), r * math.sin(j / n2 * 2 * math.pi), (R + r * math.cos(j / n2 * 2 * math.pi)) * math.sin(a))) for j in range(n2)])
        for i in range(n1):
            for j in range(n2):
                bmm.faces.new((ring[i][j], ring[(i + 1) % n1][j], ring[(i + 1) % n1][(j + 1) % n2], ring[i][(j + 1) % n2]))
        for f in bmm.faces:
            f.smooth = True
        mono = new_obj('monoculo', mesh_from(bmm, 'monoculo'))
        mono.data.materials.append(gold)
        mono.location = c + Vector((0, -V['eye_in'] - 0.03, -0.01))
        mono.rotation_euler = (math.radians(6), 0, 0)
        mono.parent = head
        # correntinha: uma curva caindo até a lapela
        cu = bpy.data.curves.new('corrente', 'CURVE')
        cu.dimensions = '3D'
        cu.bevel_depth = 0.008
        sp = cu.splines.new('BEZIER')
        sp.bezier_points.add(2)
        p0 = mono.location + Vector((R, 0, -0.05))
        ptsc = [p0, p0 + Vector((0.42, 0.25, -0.75)), Vector((0.75, -0.35, -1.75 * V['scale'][2]))]
        for bp, co in zip(sp.bezier_points, ptsc):
            bp.co = co
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
        ch = bpy.data.objects.new('corrente', cu)
        bpy.context.scene.collection.objects.link(ch)
        ch.data.materials.append(gold)
        ch.parent = head
    return head


# ------------------------------------------------------------------ cena e render
def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'CYCLES'):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    sc.render.resolution_x = 900
    sc.render.resolution_y = 1000
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'PNG'
    if sc.render.engine == 'CYCLES':
        sc.cycles.samples = 48
    else:
        try:
            sc.eevee.taa_render_samples = 48
        except Exception:
            pass
    w = bpy.data.worlds.new('breu')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.012, 0.006, 0.02, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    sc.world = w
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass

    def light(name, kind, loc, energy, color, size=1.5):
        d = bpy.data.lights.new(name, kind)
        d.energy = energy
        d.color = color
        if kind == 'AREA':
            d.size = size
        o = bpy.data.objects.new(name, d)
        sc.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, -0.4)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        return o
    light('vela', 'AREA', (0.9, -3.2, -2.6), 300, (1.0, 0.62, 0.34), 1.6)       # luz de vela vinda da mesa
    light('cima', 'AREA', (-2.4, -2.6, 2.6), 130, (1.0, 0.92, 0.82), 2.5)       # preenchimento suave
    light('contra', 'AREA', (2.6, 3.0, 1.6), 600, (0.55, 0.45, 1.0), 2.0)       # contraluz roxa
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 62
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam


def aim(cam, loc, target):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


def load(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)


def save(arr, path):
    h, w, _ = arr.shape
    img = bpy.data.images.new('folha', w, h, alpha=False)
    img.pixels.foreach_set(arr.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


if os.environ.get('VILAO_LIB') == '1':   # importado por build_montado.py: só as funções, sem renderizar
    WHICH = []
sheets = []
for n in WHICH:
    V = VARIANTS[n]
    sc, cam = setup_scene()
    head = build_head(V)
    views = {
        'mesa': ((0.9, -6.6, -2.3), (0, 0, -0.55)),      # como o jogador vê: de baixo, do outro lado da mesa
        'frente': ((0, -7.0, -0.2), (0, 0, -0.45)),
        'perfil': ((6.6, -2.2, 0.1), (0, 0, -0.45)),
    }
    row = []
    for vn, (loc, tg) in views.items():
        aim(cam, loc, tg)
        path = os.path.join(OUT, f"vilao-{n}-{V['name']}-{vn}.png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        row.append(load(path))
    sheet = np.concatenate(row, axis=1)
    save(sheet, os.path.join(OUT, f"vilao-{n}-{V['name']}.png"))
    sheets.append(sheet)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"vilao-{n}-{V['name']}.blend"))
    print('OK', n, V['name'], 'engine', sc.render.engine)
if len(sheets) > 1:
    save(np.concatenate(sheets[::-1], axis=0), os.path.join(OUT, 'vilao-todas.png'))
