# Dono da mesa v2: cabeça de ventríloquo esculpida como UMA superfície (metaballs fundidas + remesh),
# pintada em mapas de verdade (cor, rugosidade e relevo em 2K, sem vertex color) e com as peças que o
# jogo anima separadas: queixo (Jaw), olhos (Eye_L/R) e pálpebras (Lid_L/R).
#
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python tools/vilao2/vilao2.py -- A [draft]
#
# Variantes: A = entalhado-cavalheiro (madeira talhada a goiva, tinta fina, cabelo ruivo entalhado)
#            B = rachado-sinistro (tinta creme rachada e lascada, órbitas fundas, monóculo, dente de ouro)
# Saída: tools/vilao2/out/<V>/  (vilao-<V>.glb, texturas, renders frente/perfil/3-4)
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import paint  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
VAR = (argv[0] if argv else 'A').upper()
DRAFT = 'draft' in argv
GEO_ONLY = 'geo' in argv
OUT = os.path.join(HERE, 'out', VAR)
os.makedirs(OUT, exist_ok=True)
TEX = 512 if DRAFT else 2048

# ---------------------------------------------------------------- forma (por variante)
# Coordenadas do Blender: frente = -Y, cima = +Z. Cabeça com ~1 m de raio (o jogo escala).
BASE = dict(
    eye_x=0.31, eye_z=0.13, eye_y=-0.635, eye_r=0.17, socket_r=0.25, socket_depth=0.10,
    mouth_z=-0.36, mouth_w=0.29, jaw_bottom=-1.05,
    nose_tip=(0, -0.99, -0.06), nose_r=0.15, brow=0.17, cheek=0.36, chin_y=-0.50,
    hairline=0.62, part_x=0.24, hair_th=0.06, groove=0.032, grooves=9, puff=0.11,
)
VARIANTS = {
    'A': dict(BASE, name='entalhado', hair='ruivo'),
    'B': dict(BASE, name='sinistro', hair='preto', socket_r=0.28, socket_depth=0.16, brow=0.20,
              nose_tip=(0, -0.97, -0.10), nose_r=0.12, cheek=0.32, hairline=0.70, part_x=0.0, groove=0.010, grooves=20, puff=0.03),
}
# Linguagem "brinquedo" (para combinar com dominós e soldadinhos): cabeçuda, formas redondas, olhos maiores,
# cabelo em poucos gomos largos. eyes: 'pupil' (bola + pupila chapada) | 'ink' (traço dos dominós);
# paint: 'lacquer' (laca chapada) | 'wood' (madeira suave por baixo).
TOY = dict(BASE, name='brinquedo', hair='ruivo', toy=True, eye_r=0.20, socket_r=0.235, socket_depth=0.06,
           eye_x=0.32, eye_y=-0.70, nose_tip=(0, -0.90, -0.08), nose_r=0.17, cheek=0.40,
           hairline=0.55, part_x=0.24, hair_th=0.08, groove=0.045, grooves=4, puff=0.15)
VARIANTS['T1'] = dict(TOY, eyes='pupil', paint='lacquer')
VARIANTS['T2'] = dict(TOY, eyes='ink', paint='lacquer')
VARIANTS['T3'] = dict(TOY, eyes='pupil', paint='wood')
# T5: base da marionete (sobrancelha vira peça 3D com corda no jogo, então não é pintada)
VARIANTS['T5'] = dict(TOY, eyes='pupil', paint='lacquer', no_brow=True)
# T7: opções de cabelo sobre a base T5 (olho 2D T6A no jogo). hair_col = (fundo, meio, brilho)
VARIANTS['T7A'] = dict(VARIANTS['T5'], name='lambido', hair_th=0.045, groove=0.012, grooves=14, puff=0.03, part_x=0.30,
                       hairline=0.52, hair_col=('#0a0810', '#2a2234', '#6a5a7a'))       # preto lambido, risca do lado
VARIANTS['T7B'] = dict(VARIANTS['T5'], name='topete', hair_th=0.07, groove=0.030, grooves=6, puff=0.34, part_x=0.10,
                       hairline=0.56, hair_col=('#2a1206', '#6a3618', '#b0763e'))       # topete alto castanho
VARIANTS['T7C'] = dict(VARIANTS['T5'], name='pintado', hair_th=0.014, groove=0.0, grooves=1, puff=0.0, part_x=0.0,
                       hairline=0.60, hair_col=('#100c08', '#2a2018', '#5a4a38'), hair_lines=True)  # pintado rente, com pente
V = VARIANTS[VAR]


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mb_el(mb, kind, co, r, size=(1, 1, 1), neg=False, stiff=2.0, rot=None):
    e = mb.elements.new(type=kind)
    e.co = Vector(co)
    e.radius = r
    if kind in ('ELLIPSOID', 'CAPSULE', 'PLANE', 'CUBE'):
        e.size_x, e.size_y, e.size_z = size
    e.use_negative = neg
    e.stiffness = stiff
    if rot is not None:
        e.rotation = rot
    return e


def mesh_from_eval(obj, name):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    me.name = name
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return o


def apply_mods(o):
    n = mesh_from_eval(o, o.name + '_')
    n.matrix_world = o.matrix_world.copy()
    old = o.name
    bpy.data.objects.remove(o)
    n.name = old
    n.data.name = old
    return n


# ---- SDF em numpy (metros, coords do Blender) ----
def sd_ell(p, c, r):
    q = (p - np.array(c)) / np.array(r)
    k0 = np.linalg.norm(q, axis=1)
    k1 = np.linalg.norm(q / np.array(r), axis=1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)


def sd_sph(p, c, r):
    return np.linalg.norm(p - np.array(c), axis=1) - r


def sd_cap(p, a, b, ra, rb):
    a, b = np.array(a), np.array(b)
    ba = b - a
    h = np.clip(((p - a) @ ba) / (ba @ ba), 0, 1)
    return np.linalg.norm(p - a - h[:, None] * ba, axis=1) - (ra + (rb - ra) * h)


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def ssub(a, b, k):  # a menos b
    h = np.clip(0.5 - 0.5 * (a + b) / k, 0, 1)
    return a + (-b - a) * h + k * h * (1 - h)


def head_sdf_toy(p, V):
    """Cabeça de boneco de brinquedo: crânio grande, rosto curto, tudo fundido com raios largos."""
    ex, ez, ey = V['eye_x'], V['eye_z'], V['eye_y']
    d = sd_ell(p, (0, 0.08, 0.24), (0.84, 0.88, 0.96))                       # crânio maior
    d = smin(d, sd_ell(p, (0, -0.30, -0.22), (0.66, 0.60, 0.70)), 0.30)      # rosto
    for s in (-1, 1):
        d = smin(d, sd_sph(p, (s * 0.36, -0.52, -0.20), V['cheek'] * 0.78), 0.25)  # bochechas redondas
        d = smin(d, sd_ell(p, (s * 0.84, 0.08, 0.06), (0.10, 0.18, 0.22)), 0.10)    # orelhas simples
    d = smin(d, sd_ell(p, (0, -0.46, -0.72), (0.38, 0.34, 0.24)), 0.25)      # queixo redondo
    d = smin(d, sd_sph(p, V['nose_tip'], V['nose_r']), 0.12)                  # nariz de bolinha
    for s in (-1, 1):                                                        # órbitas rasas
        d = ssub(d, sd_sph(p, (s * ex, ey - V['socket_depth'] * 0.3, ez), V['socket_r'] * 0.86), 0.10)
    return d


def head_sdf(p, V):
    if V.get('toy'):
        return head_sdf_toy(p, V)
    ex, ez, ey = V['eye_x'], V['eye_z'], V['eye_y']
    d = sd_ell(p, (0, 0.10, 0.20), (0.78, 0.86, 0.90))                       # crânio
    d = smin(d, sd_ell(p, (0, -0.28, -0.20), (0.68, 0.62, 0.74)), 0.20)      # massa do rosto
    for s in (-1, 1):
        d = smin(d, sd_sph(p, (s * 0.37, -0.56, -0.16), V['cheek'] * 0.82), 0.14)   # maçãs
        d = smin(d, sd_ell(p, (s * 0.80, 0.08, 0.04), (0.11, 0.20, 0.27)), 0.07)    # orelhas
    d = smin(d, sd_ell(p, (0, -0.58, -0.44), (0.40, 0.30, 0.25)), 0.14)      # focinho
    d = smin(d, sd_ell(p, (0, V['chin_y'], -0.78), (0.36, 0.32, 0.23)), 0.16) # queixo
    d = smin(d, sd_ell(p, (0, -0.66, ez + 0.20), (0.62, V['brow'] * 0.9, 0.12)), 0.10)  # sobrancelha
    tip = V['nose_tip']
    d = smin(d, sd_cap(p, (0, -0.76, ez + 0.04), (tip[0], tip[1] + 0.05, tip[2] + 0.03), 0.07, 0.09), 0.08)
    d = smin(d, sd_sph(p, tip, V['nose_r']), 0.06)                           # bola do nariz
    for s in (-1, 1):                                                        # órbitas
        d = ssub(d, sd_sph(p, (s * ex, ey - V['socket_depth'] * 0.3, ez), V['socket_r'] * 0.86), 0.07)
    return d


def body_sdf(p, V):
    d = sd_ell(p, (0, 0.12, -2.05), (1.25, 0.72, 0.62))                      # peito
    for s in (-1, 1):
        d = smin(d, sd_ell(p, (s * 0.92, 0.14, -1.78), (0.42, 0.42, 0.34)), 0.25)  # ombros
    d = smin(d, sd_cap(p, (0, 0.08, -1.55), (0, 0.10, -1.95), 0.40, 0.55), 0.2)
    return d


def sdf_mesh(fn, center, name, subdiv=6, rmax=2.6):
    """Superfície de um SDF quase estrelado: raio a raio a partir de `center`, pega o cruzamento mais externo."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    dirs = np.array([v.co[:] for v in bm.verts])
    c = np.array(center)
    N = 160
    ts = np.linspace(0.02, rmax, N)
    vals = np.stack([fn(c + dirs * t) for t in ts], axis=1)  # (V, N)
    inside = vals < 0
    # último índice dentro
    idx = N - 1 - np.argmax(inside[:, ::-1], axis=1)
    lo, hi = ts[idx], ts[np.minimum(idx + 1, N - 1)]
    for _ in range(22):
        mid = (lo + hi) / 2
        m = fn(c + dirs * mid[:, None]) < 0
        lo = np.where(m, mid, lo)
        hi = np.where(m, hi, mid)
    pts = c + dirs * ((lo + hi) / 2)[:, None]
    for v, q in zip(bm.verts, pts):
        v.co = Vector(q)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return o


def remesh_smooth(o, voxel=0.014, smooth=12, name='Head'):
    m = mesh_from_eval(o, name)
    bpy.data.objects.remove(o)
    r = m.modifiers.new('rm', 'REMESH')
    r.mode = 'VOXEL'
    r.voxel_size = voxel
    s = m.modifiers.new('sm', 'CORRECTIVE_SMOOTH')
    s.iterations = smooth
    s.use_only_smooth = True
    s.smooth_type = 'LENGTH_WEIGHTED'
    m = apply_mods(m)
    return m


def project_to_sdf(o, fn, iters=4, eps=0.002):
    """Depois do remesh+suavização, empurra cada vértice de volta para a superfície exata do SDF."""
    me = o.data
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    p = co.reshape(-1, 3) @ np.array(o.matrix_world)[:3, :3].T + np.array(o.matrix_world)[:3, 3]
    for _ in range(iters):
        f = fn(p)
        g = np.stack([(fn(p + e) - fn(p - e)) / (2 * eps) for e in np.eye(3) * eps], axis=1)
        gn = np.maximum((g * g).sum(1), 1e-6)
        p = p - (f / gn)[:, None] * g
    inv = np.linalg.inv(np.array(o.matrix_world))
    p = p @ inv[:3, :3].T + inv[:3, 3]
    me.vertices.foreach_set('co', p.ravel())
    me.update()


def shade_smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True


def box(name, lo, hi):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector([lo[i] + (v.co[i] + 0.5) * (hi[i] - lo[i]) for i in range(3)])
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return o


def boolean(a, cutter, op):
    m = a.modifiers.new('b', 'BOOLEAN')
    m.object = cutter
    m.operation = op
    solvers = [i.identifier for i in bpy.types.BooleanModifier.bl_rna.properties['solver'].enum_items]
    m.solver = 'EXACT' if 'EXACT' in solvers else solvers[0]
    return apply_mods(a)


def copy_obj(o, name):
    n = o.copy()
    n.data = o.data.copy()
    n.name = name
    n.data.name = name
    bpy.context.collection.objects.link(n)
    return n


def split_jaw(head, V):
    """Corta o queixo articulado: bloco entre as duas fendas que descem dos cantos da boca."""
    w, mz = V['mouth_w'], V['mouth_z']
    gap = 0.012
    # cortador do queixo: largura da boca, da boca até embaixo, da frente até perto da dobradiça
    cut_in = box('cut_in', (-w, -1.5, -1.5), (w, -0.05, mz))
    cut_out = box('cut_out', (-w - gap, -1.5, -1.5), (w + gap, -0.05 + gap, mz + gap * 1.6))
    jaw = copy_obj(head, 'Jaw')
    jaw = boolean(jaw, cut_in, 'INTERSECT')
    head = boolean(head, cut_out, 'DIFFERENCE')
    bpy.data.objects.remove(cut_in)
    bpy.data.objects.remove(cut_out)
    return head, jaw


def hair_sdf(p, V):
    """Cabelo entalhado: casca sobre o crânio, cortada por uma linha de cabelo suave, com sulcos penteados."""
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    skull = sd_ell(p, (0, 0.08, 0.24), (0.84, 0.88, 0.96)) if V.get('toy') else sd_ell(p, (0, 0.10, 0.20), (0.78, 0.86, 0.90))
    hl, px = V['hairline'], V['part_x']
    front = np.clip(-y / 0.8, 0, 1)
    # linha do cabelo: alta na testa, contorna as orelhas (costeleta curta), desce na nuca
    side = np.clip(np.abs(x) / 0.75, 0, 1)
    # linha do cabelo: arco alto na testa, entradas nas têmporas, contorna as orelhas e desce na nuca
    line = hl + 0.16 * front * (1 - side ** 2) - 0.05 * side - 0.75 * np.clip(y / 0.7, 0, 1)
    sb = np.clip((np.abs(x) - 0.50) / 0.12, 0, 1) * np.clip((y + 0.42) / 0.12, 0, 1) * np.clip((0.28 - y) / 0.12, 0, 1)
    line = line * (1 - sb) + np.minimum(line, 0.30 + 0.25 * np.clip(-y - 0.1, 0, 1)) * sb
    # topete: onda de volume na frente, do lado oposto à risca
    puff = V['puff'] * np.clip(-y / 0.6 + 0.3, 0, 1) * np.exp(-((x + px * 0.7) ** 2) / 0.20) * np.clip((z - 0.3) / 0.5, 0, 1)
    # sulcos penteados para trás (correm da testa para a nuca, abrindo a partir da risca)
    phase = (x - px) * (1.0 + 0.5 * np.clip(-y, 0, 1)) + 0.05 * np.sin(y * 4.0)
    wav = np.abs(np.sin(phase * V['grooves'] * 1.6))
    groove = V['groove'] * (1 - wav ** 0.45)
    part = 0.035 * np.exp(-((x - px) ** 2) / 0.0010) * np.clip(-y + 0.2, 0, 1) if px != 0 else 0
    shell = skull - (V['hair_th'] + puff) + groove + part
    cut = (line - z) * 0.9
    k = 0.035
    h = np.clip(0.5 - 0.5 * (cut - shell) / k, 0, 1)  # max suave(shell, cut)
    return cut + (shell - cut) * h + k * h * (1 - h)


def hair_shell(head_full, V):
    raw = sdf_mesh(lambda p: hair_sdf(p, V), (0, 0.10, 0.75), 'hairRaw', subdiv=7, rmax=1.6)  # centro precisa estar DENTRO do cabelo
    o = remesh_smooth(raw, voxel=0.009, smooth=8, name='Hair')
    project_to_sdf(o, lambda p: hair_sdf(p, V))
    shade_smooth(o)
    return o


def eyes_and_lids(V):
    out = []
    ex, ez, ey, r = V['eye_x'], V['eye_z'], V['eye_y'], V['eye_r']
    for s, side in ((1, 'L'), (-1, 'R')):  # L = esquerda do boneco = +x
        c = Vector((s * ex, ey, ez))
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=r, location=c)
        eye = bpy.context.object
        eye.name = f'Eye_{side}'
        eye.data.name = eye.name
        # a frente da esfera (pupila) aponta para -Y
        eye.rotation_euler = (math.pi / 2, 0, 0)
        shade_smooth(eye)
        # pálpebra de cima: meia casca um pouco maior que o olho, abre girando no eixo X
        me = bpy.data.meshes.new(f'Lid_{side}')
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=r * 1.07)
        kill = [f for f in bm.faces if sum(v.co.z for v in f.verts) / len(f.verts) < 0]
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        bm.to_mesh(me)
        bm.free()
        lid = bpy.data.objects.new(f'Lid_{side}', me)
        bpy.context.collection.objects.link(lid)
        so = lid.modifiers.new('so', 'SOLIDIFY')
        so.thickness = 0.025
        lid = apply_mods(lid)
        lid.location = c
        lid.rotation_euler = (-0.55, 0, 0)  # aberta (gira para trás)
        shade_smooth(lid)
        out += [eye, lid]
    return out


def body(V):
    """Pescoço de madeira, colarinho, ombros do paletó e gravata-borboleta (metaballs: peças fundidas)."""
    parts = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.30, depth=0.62, location=(0, 0.05, -1.05))
    neck = bpy.context.object
    neck.name = 'Neck'
    bev = neck.modifiers.new('bv', 'BEVEL'); bev.width = 0.04; bev.segments = 3
    neck = apply_mods(neck)
    shade_smooth(neck)
    parts.append(neck)
    bo = sdf_mesh(lambda p: body_sdf(p, V), (0, 0.12, -1.95), 'bodyRaw', subdiv=5)
    jacket = remesh_smooth(bo, voxel=0.03, smooth=4, name='Jacket')
    # corta embaixo (some atrás da mesa de qualquer jeito) e o decote em V da camisa fica pintado
    cut = box('cutj', (-3, -3, -5), (3, 3, -2.25))
    jacket = boolean(jacket, cut, 'DIFFERENCE')
    bpy.data.objects.remove(cut)
    shade_smooth(jacket)
    parts.append(jacket)
    # colarinho
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=0.42, depth=0.22, location=(0, 0.05, -1.30))
    col = bpy.context.object
    col.name = 'Collar'
    col.scale = (1, 0.92, 1)
    sol = col.modifiers.new('so', 'SOLIDIFY'); sol.thickness = 0.03
    col = apply_mods(col)
    shade_smooth(col)
    parts.append(col)
    # gravata-borboleta fundida
    def bow_sdf(p):
        d = sd_sph(p, (0, -0.44, -1.33), 0.065)
        for s in (-1, 1):
            # asa: cone achatado que abre para fora (estreita no nó)
            d = smin(d, sd_cap(p, (s * 0.03, -0.43, -1.33), (s * 0.20, -0.41, -1.33), 0.04, 0.11) , 0.04)
        q = p.copy(); q[:, 1] = (q[:, 1] + 0.42) * 2.2 - 0.42  # achata na profundidade
        return np.maximum(d, np.abs(p[:, 1] + 0.42) - 0.06)
    bw = sdf_mesh(bow_sdf, (0, -0.42, -1.33), 'bowRaw', subdiv=5, rmax=0.5)
    bow = remesh_smooth(bw, voxel=0.008, smooth=3, name='Bow')
    shade_smooth(bow)
    parts.append(bow)
    return parts


def sd_box(p, lo, hi):
    lo, hi = np.array(lo), np.array(hi)
    c, h = (lo + hi) / 2, (hi - lo) / 2
    q = np.abs(p - c) - h
    return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(1), 0)


def mouth_inside(V):
    """Cavidade escura atrás da boca (aparece quando o queixo abre) e a fileira de dentes de cima,
    as duas recortadas pela cabeça para nunca furarem a pele."""
    w, mz = V['mouth_w'], V['mouth_z']
    hf = lambda p: head_sdf(p, V)
    cav_f = lambda p: np.maximum(sd_box(p, (-w + 0.02, -0.9, mz - 0.26), (w - 0.02, -0.25, mz + 0.01)), hf(p) + 0.025)
    cav = sdf_mesh(cav_f, (0, -0.5, mz - 0.12), 'Mouth', subdiv=4, rmax=1.0)
    teeth_f = lambda p: np.maximum(sd_box(p, (-w + 0.05, -0.95, mz - 0.075), (w - 0.05, -0.55, mz + 0.005)) - 0.01, hf(p) + 0.012)
    teeth = sdf_mesh(teeth_f, (0, -0.68, mz - 0.035), 'Teeth', subdiv=4, rmax=0.5)
    for o in (cav, teeth):
        shade_smooth(o)
    return [cav, teeth]


def decimate_to(o, faces):
    n = len(o.data.polygons)
    if n <= faces:
        return o
    d = o.modifiers.new('dc', 'DECIMATE')
    d.ratio = faces / n
    o = apply_mods(o)
    shade_smooth(o)
    return o


def set_origin(o, p):
    p = Vector(p)
    o.data.transform(Matrix.Translation(-p))
    o.location = p


def build_geometry():
    clear_scene()
    raw = sdf_mesh(lambda p: head_sdf(p, V), (0, -0.15, -0.05), 'headRaw')
    hf = lambda p: head_sdf(p, V)
    head = remesh_smooth(raw, voxel=0.011 if not DRAFT else 0.02, smooth=10)
    project_to_sdf(head, hf)
    head = decimate_to(head, 70000)
    shade_smooth(head)
    hair = hair_shell(head, V)
    hair = decimate_to(hair, 30000)
    head, jaw = split_jaw(head, V)
    shade_smooth(head); shade_smooth(jaw)
    set_origin(jaw, (0, 0.05, V['mouth_z'] + 0.02))  # dobradiça do queixo (atrás, na altura da boca)
    objs = dict(Head=head, Jaw=jaw, Hair=hair)
    for o in eyes_and_lids(V):
        objs[o.name] = o
    for o in body(V):
        objs[o.name] = o
    for o in mouth_inside(V):
        objs[o.name] = o
    if VAR == 'B':
        for o in monocle(V):
            objs[o.name] = o
    return objs


def monocle(V):
    """Monóculo de latão no olho direito do boneco (-x), com corrente caindo até o paletó."""
    ex, ez, ey, r = V['eye_x'], V['eye_z'], V['eye_y'], V['eye_r']
    brass = flat_mat('latao', (0.75, 0.52, 0.22), 0.25, 1.0)
    glass = flat_mat('vidro', (0.85, 0.9, 0.95), 0.05, 0.0)
    b = next(n for n in glass.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Alpha'].default_value = 0.18
    for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
        try:
            setattr(glass, attr, val)
        except (AttributeError, TypeError):
            pass
    c = Vector((-ex, ey - r - 0.03, ez))
    bpy.ops.mesh.primitive_torus_add(major_radius=r * 1.25, minor_radius=0.022, major_segments=48, minor_segments=12, location=c, rotation=(math.pi / 2, 0, 0))
    ring = bpy.context.object; ring.name = 'Monocle'; ring.data.name = 'Monocle'
    ring.data.materials.append(brass); shade_smooth(ring)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r * 1.22, depth=0.008, location=c, rotation=(math.pi / 2, 0, 0))
    gl = bpy.context.object; gl.name = 'MonocleGlass'; gl.data.name = 'MonocleGlass'
    gl.data.materials.append(glass); shade_smooth(gl)
    # corrente: curva do aro até o peito, engrossada em tubo
    cu = bpy.data.curves.new('chain', 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
    pts = [c + Vector((-r * 1.2, 0, -0.05)), Vector((-0.75, -0.75, -0.9)), Vector((-0.55, -0.55, -1.7))]
    for bp, q in zip(sp.bezier_points, pts):
        bp.co = q; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    cu.bevel_depth = 0.008; cu.bevel_resolution = 2
    ch = bpy.data.objects.new('Chain', cu); bpy.context.collection.objects.link(ch)
    ch = mesh_from_eval(ch, 'Chain')
    bpy.data.objects.remove(bpy.data.objects['Chain']) if 'Chain' in bpy.data.objects and bpy.data.objects['Chain'].type == 'CURVE' else None
    ch.name = 'Chain'
    ch.data.materials.append(brass)
    bpy.data.objects.remove(gl)  # o disco de vidro tapava o olho (no jogo e no render): fica só o aro
    return [ring, ch]


# ---------------------------------------------------------------- render de prévia
def setup_render(res=900):
    sc = bpy.context.scene
    try:
        sc.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.film_transparent = False
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (0.035, 0.012, 0.05, 1)
    bg.inputs[1].default_value = 1.0
    try:
        sc.view_settings.view_transform = 'AgX'
    except TypeError:
        pass

    def light(name, kind, loc, energy, color, size=1.0):
        L = bpy.data.lights.new(name, kind)
        L.energy = energy
        L.color = color
        if hasattr(L, 'shadow_soft_size'):
            L.shadow_soft_size = size
        o = bpy.data.objects.new(name, L)
        o.location = loc
        sc.collection.objects.link(o)
        d = Vector((0, 0, -0.3)) - Vector(loc)
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        return o
    # como no jogo: vela quente vindo de baixo e da frente, contorno roxo/vinho atrás, preenchimento fraco
    light('vela', 'POINT', (0.9, -3.2, -2.0), 900, (1.0, 0.68, 0.40), 0.6)
    light('chave', 'AREA', (-2.2, -3.0, 1.8), 350, (1.0, 0.86, 0.72), 2.0)
    light('contorno', 'AREA', (2.4, 2.6, 1.6), 700, (0.75, 0.30, 0.85), 2.0)
    light('contorno2', 'AREA', (-2.6, 2.2, 0.4), 400, (0.85, 0.25, 0.30), 2.0)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 70
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def shoot(cam, name, direction, dist=7.4, target=(0, 0, -0.35)):
    t = Vector(target)
    d = Vector(direction).normalized()
    cam.location = t + d * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)


def flat_mat(name, color, rough=0.5, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def main():
    objs = build_geometry()
    for k, o in objs.items():
        print('OBJ', k, len(o.data.polygons))
    if GEO_ONLY:
        gray = flat_mat('clay', (0.7, 0.62, 0.55), 0.6)
        for o in objs.values():
            o.data.materials.clear(); o.data.materials.append(gray)
        cam = setup_render(700)
        shoot(cam, 'geo-frente.png', (0, -1, 0.1))
        shoot(cam, 'geo-perfil.png', (1, -0.15, 0.05))
        shoot(cam, 'geo-34.png', (0.7, -1, 0.25))
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'geo-{VAR}.blend'))
        return
    paint.run(objs, V, VAR, OUT, TEX)
    cam = setup_render(900)
    shoot(cam, 'frente.png', (0, -1, 0.1))
    shoot(cam, 'perfil.png', (1, -0.15, 0.05))
    shoot(cam, '34.png', (0.7, -1, 0.25))
    shoot(cam, 'baixo.png', (0.15, -1, -0.45), dist=6.5)


main()
