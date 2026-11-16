# Dono da mesa — o GAROTO montado em peças, como um boneco de verdade.
#
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python tools/vilao/build_montado.py -- [1 2 3] [draft]
#
# A cabeça continua esculpida (build_heads.py), mas agora é só o "miolo": careca, sem orelhas, nariz curto.
# O resto são peças soltas encaixadas nela — peruca entalhada, orelhas com pino, nariz de bola, sobrancelhas
# de ripa, pinos de latão na dobradiça do queixo, pescoço de bola numa gola torneada — e um corpo de boneco
# com braços articulados. Três jeitos de montar:
#   1 · VENTRÍLOQUO  encaixes justos, pintado, sentado com as mãos na borda da mesa
#   2 · MARIONETE    juntas de bola de madeira crua à mostra, fios e cruzeta, braços suspensos
#   3 · DE CORDA     brinquedo de corda: peças gordas, pinos aparentes, bochechas de disco, chave de dar corda
# Saída: tools/vilao/out/montado-N-*.png e montado-todas.png
import bpy, bmesh, math, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ['VILAO_LIB'] = '1'
sys.path.insert(0, HERE)
import build_heads as H  # noqa: E402
import numpy as np  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
WHICH = [int(a) for a in argv if a.isdigit()] or [1, 2, 3]

GAROTO = dict(H.VARIANTS[1], ear=0.0, hair_mode='none', nose=0.13, nose_tip=0.02, nostril=0.0, hat=None)

STYLES = {
    1: dict(name='ventriloquo', gap=0.030, joints='painted', strings=False, hat='top', arms='table', key=False, discs=False,
            wood='#6a4426', V=dict(GAROTO)),
    2: dict(name='marionete', gap=0.040, joints='raw', strings=True, hat='top', arms='hang', key=False, discs=False,
            wood='#a8743c', V=dict(GAROTO, jaw_open=13.0, lid=0.16)),
    3: dict(name='corda', gap=0.055, joints='raw', strings=False, hat='top', arms='peg', key=True, discs=True,
            wood='#b88848', V=dict(GAROTO, scale=(1.0, 1.0, 0.98), cheek=0.07, blush_a=0.0, freckles=0, jaw_open=10.0, lid=0.12,
                                   eye_r=0.22, brow_arc=0.09)),
}

# O Ventríloquo (1) de cabeça QUADRADA: crânio em bloco, mandíbula larga que não afina, queixo reto,
# sobrancelhas grossas e quase retas, topete alto penteado para trás.
QUADRADO = dict(GAROTO, boxy=3.4, scale=(0.80, 0.84, 0.92), jaw_w=0.97, jaw_y=0.97, chin=0.05, chin_s=0.30, chin_z=-0.72,
                cheek=0.05, cheek_s=0.24, brow=0.08, brow_arc=0.025, brow_th=0.050, brow_tilt=-0.10, temple=0.0,
                mouth_w=0.46, mouth_z=-0.47, lip=0.04, jaw_open=11.0, lid=0.26, eye_r=0.20, eye_x=0.34, eye_z=0.15,
                hairline=0.60, hair_amp=0.10, hair_groove=0.016, part=0.0, hair='#5a2416', brow_col='#5a2416',
                freckles=0, blush_a=0.45)
#   4 · QUADRADO LISO     pintado e envernizado, como boneco de fábrica
#   5 · QUADRADO TALHADO  madeira clara cortada a formão: planos de talha à mostra e tinta rala
STYLES[4] = dict(STYLES[1], name='quadrado', V=dict(QUADRADO))
STYLES[5] = dict(STYLES[1], name='talhado', wood='#b88a52', joints='raw',
                 V=dict(QUADRADO, facet=0.9, facet_n=170, shade=9, skin='#e2c79a', skin2='#b98f5a', wear=0.7, rough=0.5,
                        blush='#c9523c', blush_a=0.6, hair='#b9772e', brow_col='#b9772e'))


def smooth_all(o):
    for f in o.data.polygons:
        f.use_smooth = True


def ball(name, c, r, mat, seg=28):
    o = H.sphere_obj(name, Vector(c), r, seg, seg // 2 + 2)
    o.data.materials.append(mat)
    smooth_all(o)
    return o


def limb(name, a, b, r1, r2, mat, seg=24):
    """Tronco de cone entre dois pontos (raio r1 em a, r2 em b)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, segments=seg, radius1=r1, radius2=r2, depth=d.length, cap_ends=True)
    o = H.new_obj(name, H.mesh_from(bm, name))
    o.location = (a + b) / 2
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    o.data.materials.append(mat)
    H.shade(o.data, 50)
    return o


def lathe(name, pts, mat, seg=40, loc=(0, 0, 0)):
    bm = bmesh.new()
    rings = [[bm.verts.new((math.cos(i / seg * 2 * math.pi) * r, math.sin(i / seg * 2 * math.pi) * r, h)) for i in range(seg)] for r, h in pts]
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            bm.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    o = H.new_obj(name, H.mesh_from(bm, name))
    o.location = loc
    o.data.materials.append(mat)
    H.shade(o.data, 45)
    return o


def string(name, a, b, mat, r=0.006):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    sp = cu.splines.new('POLY')
    sp.points.add(1)
    sp.points[0].co = (*a, 1)
    sp.points[1].co = (*b, 1)
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


def build(S):
    V = dict(S['V'], hat=S['hat'])
    gap = S['gap']
    sz = V['scale'][2]
    head = H.build_head(V)
    # o corpo de build_heads sai: aqui o boneco tem corpo próprio, em peças
    for o in list(head.children):
        if o.name.split('.')[0] in ('pescoco', 'busto', 'laco', 'no'):
            bpy.data.objects.remove(o)

    def at(x, z, y=-0.9):
        return H.sculpt(tuple(Vector((x, y, z)).normalized()), V)[0]

    skin = H.mix(H.srgb(V['skin']), H.srgb(V['skin2']), 0.5)
    skin_m = H.flat_mat('pele', skin, V['rough'])
    wood_m = H.flat_mat('madeira', S['wood'], 0.55)
    joint_m = wood_m if S['joints'] == 'raw' else H.flat_mat('junta', '#2a2026', 0.5)
    brass = H.flat_mat('latao', '#c9983e', 0.28, 1.0)
    hair_m = H.flat_mat('cabelo', V['hair'], 0.22)
    dark = H.flat_mat('escuro', '#0a0608', 0.9)

    # ---- peruca entalhada: casca de madeira pintada, assentada na cabeça careca com folga
    VW = dict(V, hair_mode='full', hair_amp=0.02, hair_groove=0.016)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=6, radius=1.0)
    kill = []
    for v in bm.verts:
        n = v.co.normalized()
        P, _c, hair = H.sculpt(tuple(n), VW)
        if hair < 0.45:
            kill.append(v)
        v.co = P + n * (gap + 0.02)
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    for f in bm.faces:
        f.smooth = True
    wig = H.new_obj('peruca', H.mesh_from(bm, 'peruca'))
    wig.data.materials.append(hair_m)
    sol = wig.modifiers.new('esp', 'SOLIDIFY')
    sol.thickness = 0.07
    sol.offset = -1
    wig.parent = head

    # ---- orelhas: peças com concha, presas por um pino de madeira
    for s in (-1, 1):
        base = H.sculpt((s * 0.999, 0.03, V['ear_z'] * 0.5), V)[0]
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
        for v in bm.verts:
            x, y, z = v.co
            P = Vector((x * 0.075, y * 0.17, z * 0.24))
            # concha: afunda o miolo da face de fora
            w = math.exp(-((y + 0.15) ** 2 + (z * 0.8) ** 2) / 0.22) * max(0.0, x * s)
            P.x -= s * 0.05 * w
            v.co = P
        for f in bm.faces:
            f.smooth = True
        ear = H.new_obj('orelha', H.mesh_from(bm, 'orelha'))
        ear.data.materials.append(skin_m)
        ear.location = base + Vector((s * (gap + 0.07), 0.02, 0.03))
        ear.rotation_euler = (0, math.radians(s * 8), math.radians(-s * 16))
        ear.parent = head
        limb('pino', base - Vector((s * 0.08, 0, -0.03)), base + Vector((s * (gap + 0.05), 0.02, 0.03)), 0.035, 0.035, wood_m, 12).parent = head

    # ---- nariz de bola encaixado (com um colarinho de sombra em volta)
    tip = at(0, V['nose_tip_z'])
    nose = ball('nariz', tip + Vector((0, -0.075 - gap * 0.5, 0.0)), 0.135, H.flat_mat('nariz', '#c9564a', 0.25))
    nose.scale = (1.0, 1.05, 0.95)
    nose.parent = head
    ring = lathe('anel', [(0.0, 0.0), (0.105, 0.0), (0.105, 0.03), (0.0, 0.03)], dark, 24, tip + Vector((0, 0.0, 0)))
    ring.rotation_euler = (math.radians(90), 0, 0)
    ring.parent = head

    # ---- sobrancelhas de ripa, afastadas da testa, com pino no meio (giram no jogo)
    for s in (-1, 1):
        cu = bpy.data.curves.new('sobrancelha', 'CURVE')
        cu.dimensions = '3D'
        cu.bevel_depth = 0.026
        cu.bevel_resolution = 4
        sp = cu.splines.new('BEZIER')
        N = 5
        sp.bezier_points.add(N - 1)
        for i, bp in enumerate(sp.bezier_points):
            u = -1 + 2 * i / (N - 1)
            zc = V['brow_z'] + 0.075 + V['brow_arc'] * (1 - u * u)
            p = at(s * (V['eye_x'] + u * 0.19), zc)
            bp.co = p + Vector((0, -(gap + 0.02), 0))
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
            bp.radius = 1.0 - 0.45 * abs(u)
        ob = bpy.data.objects.new('sobrancelha', cu)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(hair_m)
        ob.parent = head
        mid = at(s * V['eye_x'], V['brow_z'] + 0.075 + V['brow_arc'])
        limb('pino', mid + Vector((0, 0.03, 0)), mid + Vector((0, -(gap + 0.055), 0)), 0.016, 0.016, brass, 10).parent = head

    # ---- dobradiça do queixo: pinos de latão dos dois lados + parafusos nas têmporas
    wide = at(V['mouth_w'], V['mouth_z']).x
    for s in (-1, 1):
        pj = at(s * (V['mouth_w'] + 0.10), V['mouth_z'] - 0.04, -0.75)
        ball('pino_queixo', pj + Vector((s * 0.01, -0.015, 0)), 0.04, brass, 16).parent = head
        pt = at(s * 0.62, 0.42, -0.7)
        ball('parafuso', pt + Vector((0, -0.005, 0)), 0.028, brass, 12).parent = head
    void = wide  # noqa: F841

    # ---- bochechas de disco (brinquedo de corda)
    if S['discs']:
        for s in (-1, 1):
            c = at(s * (V['cheek_x'] + 0.02), V['cheek_z'] - 0.03)
            n = Vector((s * 0.55, -0.83, -0.05)).normalized()
            d = limb('bochecha', c - n * 0.02, c + n * 0.035, 0.14, 0.125, H.flat_mat('bochecha', '#c9443c', 0.3), 28)
            d.parent = head

    # ---- cartola solta, com folga em cima da peruca
    if S['hat']:
        for o in head.children:
            if o.name.startswith('cartola'):
                o.location.z += gap + 0.05

    # ---- chave de dar corda (lado direito da cabeça)
    if S['key']:
        a = Vector((0.80, 0.25, 0.25))
        b = a + Vector((0.55, 0.12, 0.18))
        limb('eixo', a, b, 0.03, 0.03, brass, 12).parent = head
        d = (b - a).normalized()
        for k in (-1, 1):
            bmk = bmesh.new()
            R, r, n1, n2 = 0.13, 0.028, 28, 8
            ringv = [[bmk.verts.new(((R + r * math.cos(j / n2 * 2 * math.pi)) * math.cos(i / n1 * 2 * math.pi), (R + r * math.cos(j / n2 * 2 * math.pi)) * math.sin(i / n1 * 2 * math.pi), r * math.sin(j / n2 * 2 * math.pi))) for j in range(n2)] for i in range(n1)]
            for i in range(n1):
                for j in range(n2):
                    bmk.faces.new((ringv[i][j], ringv[(i + 1) % n1][j], ringv[(i + 1) % n1][(j + 1) % n2], ringv[i][(j + 1) % n2]))
            for f in bmk.faces:
                f.smooth = True
            lo = H.new_obj('asa', H.mesh_from(bmk, 'asa'))
            lo.data.materials.append(brass)
            lo.location = b + Vector((0, 0, k * 0.14))
            lo.rotation_euler = (math.radians(90), 0, math.radians(15))
            lo.parent = head
        void2 = d  # noqa: F841

    # ---- pescoço: bola de madeira na base da cabeça, assentada numa gola torneada
    zb = -1.02 * sz
    ball('bola_pescoco', (0, 0.06, zb - 0.10), 0.30, joint_m).parent = head
    lathe('gola', [(0.0, -0.45), (0.30, -0.45), (0.36, -0.40), (0.40, -0.22), (0.37, -0.18), (0.30, -0.24), (0.0, -0.24)], H.flat_mat('golam', V['shirt'], 0.6), 40, (0, 0.06, zb - 0.02)).parent = head

    # ---- tronco: bloco entalhado com paletó pintado
    fat = S['arms'] == 'peg'
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=6, radius=1.0)
    lay = bm.loops.layers.color.new('Col')
    suit, shirt = H.srgb(V['suit']), H.srgb(V['shirt'])
    for v in bm.verts:
        x, y, z = v.co.normalized()
        # superelipse: caixa de cantos redondos, mais larga nos ombros
        e = 0.45 if fat else 0.6
        sx_, sy_, sz_ = (math.copysign(abs(c) ** e, c) for c in (x, y, z))
        wtop = H.lerp(0.82, 1.0, H.smooth(-1, 1, z))
        v.co = Vector((sx_ * (1.0 if fat else 1.1) * wtop, sy_ * 0.52, sz_ * 0.85))
    for f in bm.faces:
        f.smooth = True
        for l in f.loops:
            x, y, z = l.vert.co
            col = suit
            if y < 0:
                vd = (0.80 - z) * 0.36
                if abs(x) < vd:
                    col = shirt
                    if abs(x) < 0.03 and (z * 5) % 1 < 0.22 and z < 0.5:
                        col = H.mix(shirt, (0.05, 0.05, 0.05), 0.85)
                elif abs(x) < vd + 0.13:
                    col = H.mix(suit, (0, 0, 0), 0.55)
            l[lay] = (*col, 1)
    torso = H.new_obj('tronco', H.mesh_from(bm, 'tronco'))
    torso.data.materials.append(H.paint_mat('roupa', 0.8, 0.0))
    tz = zb - 0.45 - 0.85 - gap * 2
    torso.location = (0, 0.10, tz)
    # gravata-borboleta (duas asas + nó), presa na gola
    bow_m = H.flat_mat('gravata', V['bow'], 0.5)
    for s in (-1, 1):
        bmw = bmesh.new()
        bmesh.ops.create_icosphere(bmw, subdivisions=3, radius=1.0)
        for v in bmw.verts:
            x, y, z = v.co
            k = H.smooth(-1, 1, x * s)
            v.co = Vector((x * 0.27, y * 0.06 * (0.6 + k), z * H.lerp(0.05, 0.20, k)))
        for f in bmw.faces:
            f.smooth = True
        w = H.new_obj('laco', H.mesh_from(bmw, 'laco'))
        w.location = (s * 0.25, -0.40, zb - 0.42)
        w.data.materials.append(bow_m)
    ball('no', (0, -0.42, zb - 0.42), 0.085, bow_m, 18)

    # ---- braços articulados: ombro de bola, braço, cotovelo de bola, antebraço, punho e mão
    sleeve = H.flat_mat('manga', V['suit'], 0.8)
    cuff = H.flat_mat('punho', V['shirt'], 0.6)
    string_m = H.flat_mat('fio', '#e8dfc8', 0.9)
    top_z = H.sculpt((0, 0, 1), V)[0].z
    hands = []
    for s in (-1, 1):
        sh = Vector((s * (1.12 + gap), 0.10, tz + 0.55))
        if S['arms'] == 'table':
            el = sh + Vector((s * 0.30, -0.35, -0.95))
            wr = el + Vector((-s * 0.55, -1.05, -0.05))
        elif S['arms'] == 'hang':
            el = sh + Vector((s * 0.62, -0.45, 0.15 if s > 0 else -0.55))
            wr = el + Vector((s * 0.10, -0.75, 0.75 if s > 0 else -0.45))
        else:  # peg: bracinhos curtos de brinquedo, abertos
            el = sh + Vector((s * 0.42, -0.10, -0.42))
            wr = el + Vector((s * 0.10, -0.42, -0.30))
        ball('ombro', sh, 0.20, joint_m)
        limb('braco', sh + (el - sh).normalized() * (0.16 + gap), el - (el - sh).normalized() * (0.13 + gap), 0.17, 0.14, sleeve)
        ball('cotovelo', el, 0.15, joint_m)
        limb('antebraco', el + (wr - el).normalized() * (0.12 + gap), wr - (wr - el).normalized() * 0.16, 0.14, 0.11, sleeve)
        limb('punho', wr - (wr - el).normalized() * 0.15, wr - (wr - el).normalized() * 0.05, 0.125, 0.125, cuff)
        ball('pulso', wr, 0.085, joint_m, 18)
        bmh = bmesh.new()
        bmesh.ops.create_icosphere(bmh, subdivisions=4, radius=1.0)
        for v in bmh.verts:
            x, y, z = v.co
            P = Vector((x * 0.16, y * 0.23, z * 0.085))
            P.x += -s * 0.10 * math.exp(-(((x * -s) - 0.8) ** 2 + (y - 0.25) ** 2) / 0.18)   # dedão
            P.z += 0.03 * math.sin(x * 9) * H.smooth(-0.2, -0.9, y)                          # sulcos dos dedos
            v.co = P
        for f in bmh.faces:
            f.smooth = True
        hand = H.new_obj('mao', H.mesh_from(bmh, 'mao'))
        hand.data.materials.append(skin_m)
        d = (wr - el).normalized()
        hand.location = wr + d * (0.22 + gap)
        hand.rotation_euler = (-d).to_track_quat('Y', 'Z').to_euler()
        hands.append(hand)

    # ---- fios e cruzeta (marionete)
    if S['strings']:
        cross = Vector((0, -0.2, top_z + 3.6))
        limb('cruzeta', cross + Vector((-1.5, 0, 0)), cross + Vector((1.5, 0, 0)), 0.05, 0.05, wood_m, 10)
        limb('cruzeta', cross + Vector((0, -0.7, 0.03)), cross + Vector((0, 0.9, 0.03)), 0.05, 0.05, wood_m, 10)
        for p in ((-0.55, 0.0, top_z + 0.55), (0.55, 0.0, top_z + 0.55)):
            string('fio', p, cross + Vector((p[0] * 1.2, 0, 0)), string_m)
        for h, s in zip(hands, (-1, 1)):
            string('fio', h.location, cross + Vector((s * 1.45, 0, 0)), string_m)
        string('fio', (0, 0.5, zb), cross + Vector((0, 0.85, 0)), string_m)
    return head


sheets = []
for n in WHICH:
    S = STYLES[n]
    sc, cam = H.setup_scene()
    build(S)
    views = {
        'mesa': ((1.0, -8.0, -3.0), (0, 0, -1.05)),
        'frente': ((0, -8.4, -1.0), (0, 0, -1.0)),
        'perfil': ((7.6, -3.4, -0.6), (0, 0, -1.0)),
    }
    if S['strings']:
        views = {k: (Vector(l) * 1.3, (0, 0, -0.2)) for k, (l, t) in views.items()}
    row = []
    for vn, (loc, tg) in views.items():
        H.aim(cam, loc, tg)
        path = os.path.join(H.OUT, f"montado-{n}-{S['name']}-{vn}.png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        row.append(H.load(path))
    sheet = np.concatenate(row, axis=1)
    H.save(sheet, os.path.join(H.OUT, f"montado-{n}-{S['name']}.png"))
    sheets.append(sheet)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(H.OUT, f"montado-{n}-{S['name']}.blend"))
    print('OK', n, S['name'])
if len(sheets) > 1:
    H.save(np.concatenate(sheets[::-1], axis=0), os.path.join(H.OUT, 'montado-todas.png'))
