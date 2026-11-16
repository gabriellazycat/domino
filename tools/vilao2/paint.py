# Pintura do dono da mesa v2: assa posição/normal/curvatura/AO num atlas e pinta em numpy.
# Saída: albedo (sRGB), rugosidade, metal e relevo -> normal map assado. Nada de vertex color.
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector, Matrix

# ---------------------------------------------------------------- ruídos em numpy
M32 = np.uint64(0xFFFFFFFF)


def _hash(ix, iy, iz, seed):
    h = (ix.astype(np.int64) * 73856093) ^ (iy.astype(np.int64) * 19349663) ^ (iz.astype(np.int64) * 83492791) ^ (seed * 2654435761)
    h = h.astype(np.uint64) & M32
    h = (h ^ (h >> np.uint64(15))) * np.uint64(2246822519) & M32
    h = (h ^ (h >> np.uint64(13))) * np.uint64(3266489917) & M32
    h = h ^ (h >> np.uint64(16))
    return (h & M32).astype(np.float64) / 4294967296.0


def vnoise(p, seed=0):
    f = np.floor(p)
    t = p - f
    t = t * t * (3 - 2 * t)
    i = f.astype(np.int64)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (t[:, 0] if dx else 1 - t[:, 0]) * (t[:, 1] if dy else 1 - t[:, 1]) * (t[:, 2] if dz else 1 - t[:, 2])
                out = out + w * _hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out


def fbm(p, oct=4, seed=0, lac=2.0, gain=0.5):
    a, s, n = 0.5, 0.0, 0.0
    q = p
    for o in range(oct):
        s += a * vnoise(q, seed + o * 17)
        n += a
        a *= gain
        q = q * lac + 3.7
    return s / n


def voronoi(p, seed=0, chunk=400000):
    """F1, F2 (distância às duas sementes mais próximas) e o id da célula mais próxima."""
    F1 = np.empty(len(p)); F2 = np.empty(len(p)); ID = np.empty(len(p))
    offs = np.array([(a, b, c) for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1)])
    for s in range(0, len(p), chunk):
        q = p[s:s + chunk]
        cell = np.floor(q).astype(np.int64)
        best1 = np.full(len(q), 9.0); best2 = np.full(len(q), 9.0); bid = np.zeros(len(q))
        for o in offs:
            c = cell + o
            j = np.stack([_hash(c[:, 0], c[:, 1], c[:, 2], seed + k) for k in range(3)], 1)
            d = np.linalg.norm(c + j - q, axis=1)
            cid = _hash(c[:, 0], c[:, 1], c[:, 2], seed + 99)
            m1 = d < best1
            best2 = np.where(m1, best1, np.minimum(best2, d))
            bid = np.where(m1, cid, bid)
            best1 = np.where(m1, d, best1)
        F1[s:s + chunk], F2[s:s + chunk], ID[s:s + chunk] = best1, best2, bid
    return F1, F2, ID


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]) ** 2.2  # linear


def mix(a, b, t):
    t = np.asarray(t)[..., None] if np.ndim(t) else t
    return a * (1 - t) + b * t


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def gauss(p, c, s):
    return np.exp(-np.sum(((p - np.array(c)) / np.array(s)) ** 2, axis=1))


# ---------------------------------------------------------------- bake
REGIONS = ['Head', 'Jaw', 'Hair', 'Lid_L', 'Lid_R', 'Teeth', 'Mouth', 'Neck', 'Collar', 'Jacket', 'Bow']
FACE_SET = ['Head', 'Jaw', 'Hair', 'Lid_L', 'Lid_R', 'Teeth', 'Mouth']
BODY_SET = ['Neck', 'Collar', 'Jacket', 'Bow']


def tag_and_join(objs, names, joined_name):
    parts = [objs[n] for n in names if n in objs]
    for o in parts:
        rid = float(REGIONS.index(o.name))
        me = o.data
        a = me.attributes.new('region', 'FLOAT', 'POINT')
        a.data.foreach_set('value', [rid] * len(me.vertices))
        me.uv_layers.clear() if hasattr(me.uv_layers, 'clear') else None
        while me.uv_layers:
            me.uv_layers.remove(me.uv_layers[0])
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    # aplica transformações (queixo/pálpebras têm origem própria) para juntar em coordenadas do mundo
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = joined_name
    j.data.name = joined_name
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0)
    bpy.ops.object.mode_set(mode='OBJECT')
    return j


def new_img(name, W, flt=True, color=(0, 0, 0, 0)):
    im = bpy.data.images.new(name, W, W, alpha=True, float_buffer=flt)
    im.generated_color = color
    return im


def bake_emit(obj, W, shader_fn, name):
    """Assa uma emissão (montada por shader_fn(nt) -> socket de cor) numa imagem float WxW."""
    img = new_img(name, W)
    mat = bpy.data.materials.new('bake_' + name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    outn = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(shader_fn(nt), em.inputs['Color'])
    nt.links.new(em.outputs[0], outn.inputs['Surface'])
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.nodes.active = tex
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='EMIT', margin=6, use_clear=True)
    a = np.empty(W * W * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(W, W, 4)


def bake_ao(obj, W):
    img = new_img('ao', W)
    mat = bpy.data.materials.new('bake_ao')
    mat.use_nodes = True
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.nodes.active = tex
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    sc = bpy.context.scene
    sc.cycles.samples = 48
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='AO', margin=6, use_clear=True)
    a = np.empty(W * W * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(W, W, 4)[..., 0]


def gather(obj, W):
    me = obj.data
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    lo, hi = co.min(0) - 0.01, co.max(0) + 0.01

    def pos(nt):
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.vector_type = 'POINT'
        mp.inputs['Location'].default_value = tuple(-lo / (hi - lo))
        mp.inputs['Scale'].default_value = tuple(1 / (hi - lo))
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        return mp.outputs[0]

    def nrm(nt):
        g = nt.nodes.new('ShaderNodeNewGeometry')
        vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY_ADD'
        vm.inputs[1].default_value = (0.5, 0.5, 0.5); vm.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(g.outputs['Normal'], vm.inputs[0])
        return vm.outputs[0]

    def reg(nt):
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'region'
        g = nt.nodes.new('ShaderNodeNewGeometry')
        mt = nt.nodes.new('ShaderNodeMath'); mt.operation = 'DIVIDE'; mt.inputs[1].default_value = 16.0
        nt.links.new(at.outputs['Fac'], mt.inputs[0])
        cb = nt.nodes.new('ShaderNodeCombineXYZ')
        nt.links.new(mt.outputs[0], cb.inputs[0])
        nt.links.new(g.outputs['Pointiness'], cb.inputs[1])
        return cb.outputs[0]

    P = bake_emit(obj, W, pos, 'pos')
    mask = P[..., 3] > 0.5
    P = lo + P[..., :3] * (hi - lo)
    N = bake_emit(obj, W, nrm, 'nrm')[..., :3] * 2 - 1
    R = bake_emit(obj, W, reg, 'reg')
    region = np.rint(R[..., 0] * 16).astype(int)
    curv = R[..., 1]
    ao = bake_ao(obj, W)
    return dict(P=P, N=N, region=region, curv=curv, ao=ao, mask=mask)


# ---------------------------------------------------------------- materiais finais
def save_img(arr, path, srgb):
    """arr: (W,W,3|1) linear 0..1 -> PNG. srgb=True converte para sRGB."""
    W = arr.shape[0]
    if arr.ndim == 2:
        arr = arr[..., None]
    if arr.shape[2] == 1:
        arr = np.repeat(arr, 3, 2)
    a = np.clip(arr, 0, 1)
    if srgb:
        a = a ** (1 / 2.2)
    rgba = np.concatenate([a, np.ones((W, W, 1))], 2).astype(np.float32)
    name = os.path.splitext(os.path.basename(path))[0]
    im = bpy.data.images.new(name, W, W, alpha=True)
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()
    im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    return im


def dilate(arr, mask, n=8):
    """Espalha as cores para fora das ilhas UV (evita costura escura no mipmap)."""
    a = arr.copy()
    m = mask.copy()
    for _ in range(n):
        acc = np.zeros_like(a); cnt = np.zeros(m.shape)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sm = np.roll(m, (dy, dx), (0, 1))
            acc += np.roll(a, (dy, dx), (0, 1)) * sm[..., None]
            cnt += sm
        grow = (~m) & (cnt > 0)
        a[grow] = acc[grow] / cnt[grow][:, None]
        m = m | grow
    return a


def final_material(obj, name, alb, rough, metal, height, out, W, hscale):
    pa = save_img(alb, os.path.join(out, f'{name}_albedo.png'), True)
    pr = save_img(rough, os.path.join(out, f'{name}_rough.png'), False)
    pm = save_img(metal, os.path.join(out, f'{name}_metal.png'), False)
    ph = save_img(height, os.path.join(out, f'{name}_height.png'), False)
    # 1) assa o normal map a partir do relevo
    nimg = bpy.data.images.new(f'{name}_normal', W, W, alpha=False, float_buffer=False)
    nimg.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    th = nt.nodes.new('ShaderNodeTexImage'); th.image = ph
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = hscale
    if 'Strength' in bump.inputs:
        bump.inputs['Strength'].default_value = 1.0
    nt.links.new(th.outputs['Color'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = nimg
    nt.nodes.active = tn
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.context.scene.cycles.samples = 4
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=8, use_clear=True)
    nimg.filepath_raw = os.path.join(out, f'{name}_normal.png')
    nimg.file_format = 'PNG'
    nimg.save()
    # 2) material final (o que o GLB leva)
    for n in [th, bump, tn]:
        nt.nodes.remove(n)
    ta = nt.nodes.new('ShaderNodeTexImage'); ta.image = pa
    tr = nt.nodes.new('ShaderNodeTexImage'); tr.image = pr
    tm = nt.nodes.new('ShaderNodeTexImage'); tm.image = pm
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = nimg
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(ta.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tr.outputs['Color'], bsdf.inputs['Roughness'])
    nt.links.new(tm.outputs['Color'], bsdf.inputs['Metallic'])
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def split_back(joined, names, mat):
    """Separa o objeto pintado de volta nas peças (pelo atributo region)."""
    res = {}
    for n in names:
        rid = REGIONS.index(n)
        me = joined.data.copy()
        bm = bmesh.new()
        bm.from_mesh(me)
        lay = bm.verts.layers.float.get('region')
        kill = [f for f in bm.faces if abs(f.verts[0][lay] - rid) > 0.5]
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        bm.to_mesh(me)
        bm.free()
        if len(me.polygons) == 0:
            continue
        me.name = n
        o = bpy.data.objects.new(n, me)
        bpy.context.collection.objects.link(o)
        o.data.materials.clear()
        o.data.materials.append(mat)
        res[n] = o
    bpy.data.objects.remove(joined)
    return res


# ---------------------------------------------------------------- pinturas
def paint_face(D, V, VAR):
    P, N, reg, curv, ao, mask = D['P'], D['N'], D['region'], D['curv'], D['ao'], D['mask']
    W = P.shape[0]
    idx = mask.ravel()
    p = P.reshape(-1, 3)[idx]
    n = N.reshape(-1, 3)[idx]
    r = reg.ravel()[idx]
    cv = curv.ravel()[idx]
    oc = ao.ravel()[idx]
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    K = len(p)
    alb = np.zeros((K, 3)); rough = np.full(K, 0.5); metal = np.zeros(K); height = np.full(K, 0.5)
    ex, ez, ey = V['eye_x'], V['eye_z'], V['eye_y']
    mz, mw = V['mouth_z'], V['mouth_w']
    skin_r = np.isin(r, [REGIONS.index('Head'), REGIONS.index('Jaw'), REGIONS.index('Lid_L'), REGIONS.index('Lid_R')])
    hair_r = r == REGIONS.index('Hair')
    teeth_r = r == REGIONS.index('Teeth')
    mouth_r = r == REGIONS.index('Mouth')
    lid_r = np.isin(r, [REGIONS.index('Lid_L'), REGIONS.index('Lid_R')])

    # madeira por baixo (veio vertical: a cabeça foi talhada de um tronco em pé)
    rad = np.sqrt(x ** 2 + (y + 0.15) ** 2) * 9 + fbm(p * 2.2, 3, 5) * 3.0
    rings = 0.5 + 0.5 * np.sin(rad * 2 * np.pi)
    wood = mix(hexc('#6e4424'), hexc('#a87444'), rings ** 2 * 0.8 + fbm(p * np.array([30, 30, 3]), 3, 9) * 0.3)
    # convexidade (pointiness ~0,5 = plano; maior = quina)
    edge = sstep(0.52, 0.60, cv)
    big = fbm(p * 3.0, 4, 1)
    small = fbm(p * 18.0, 3, 2)

    if VAR == 'A':
        # marcas de goiva: conchas rasas (voronoi F1) por toda a madeira talhada
        F1, F2, cid = voronoi(p * 11.0, 7)
        gouge = F1 ** 2
        paint_col = mix(hexc('#ecc9a2'), hexc('#dcb48a'), big)
        paint_col = mix(paint_col, hexc('#f4dcbd'), sstep(0.5, 0.9, F2 - F1) * 0.25)  # cristas das conchas mais claras
        chips = sstep(0.74, 0.75, fbm(p * 6.0, 3, 41)) * sstep(0.56, 0.62, cv)  # lascas raras, de borda limpa
        wear = np.clip(sstep(0.55, 0.66, cv) * 0.8 + chips, 0, 1)
        wear = np.where(lid_r, wear * 0.3, wear)
        skin = mix(paint_col, wood, wear * 0.85)
        # bochechas rosadas pintadas à mão
        for s in (-1, 1):
            skin = mix(skin, hexc('#d8705e'), np.clip(gauss(p, (s * 0.40, -0.62, -0.20), (0.17, 0.3, 0.14)) * 0.75 * (1 - wear), 0, 1))
        skin = mix(skin, hexc('#d56a56'), np.clip(gauss(p, V['nose_tip'], (0.13, 0.2, 0.13)) * 0.55, 0, 1))
        # sardas
        fr = vnoise(p * 70, 33)
        fz = gauss(p, (0, -0.75, -0.08), (0.55, 0.5, 0.18))
        skin = mix(skin, hexc('#9a5434'), (fr > 0.86) * fz * 0.7)
        brow_col, lip_col, lash_col = hexc('#5a2412'), hexc('#a3302c'), hexc('#2a140a')
        brow_arc, brow_w, brow_tilt = 0.20, 0.022, 0.06
        rough_skin = 0.40 + wear * 0.35 + gouge * 0.25
        h_skin = 0.55 - gouge * 1.2 - chips * 0.15
    else:
        # tinta creme rachada em placas (craquelê) e lascas que mostram a madeira escura
        F1, F2, cid = voronoi(p * 9.0, 3)
        crack = 1 - sstep(0.0, 0.035, F2 - F1)
        F1b, F2b, _ = voronoi(p * 26.0, 4)
        crack_f = 1 - sstep(0.0, 0.03, F2b - F1b)
        # lascas: só algumas placas soltaram, mais nas quinas (nariz, maçãs, queixo, orelhas)
        flake = (cid > 0.90 - 0.25 * sstep(0.55, 0.65, cv)) & (fbm(p * 5, 3, 8) > 0.45)
        paint_col = mix(hexc('#e2d6bc'), hexc('#bfae8c'), big * 0.8 + (1 - oc) * 0.6)
        dark_wood = mix(hexc('#3a2010'), hexc('#5a3418'), rings)
        skin = mix(paint_col, hexc('#2a1a10'), np.clip(crack * 0.85 + crack_f * 0.35, 0, 1))
        skin = mix(skin, dark_wood, (flake & ~lid_r) * 1.0)
        # órbitas fundas: sombra arroxeada pintada em volta dos olhos
        for s in (-1, 1):
            skin = mix(skin, hexc('#5b4048'), np.clip(gauss(p, (s * ex, ey - 0.05, ez - 0.02), (0.30, 0.3, 0.24)) * 0.65, 0, 1))
            skin = mix(skin, hexc('#b07468'), np.clip(gauss(p, (s * 0.42, -0.62, -0.26), (0.14, 0.3, 0.10)) * 0.35, 0, 1))
        # encardido nas reentrâncias
        skin = skin * (0.55 + 0.45 * oc[:, None] ** 1.5)
        brow_col, lip_col, lash_col = hexc('#140c0c'), hexc('#5a1218'), hexc('#120808')
        brow_arc, brow_w, brow_tilt = 0.30, 0.012, -0.10
        rough_skin = np.where(flake, 0.85, 0.5) + crack * 0.3
        h_skin = 0.5 + np.where(flake, -0.35, 0.0) - crack * 0.45 - crack_f * 0.15 + small * 0.05
        wear = flake.astype(float)

    # sobrancelhas pintadas: arcos acima das órbitas (só na frente do rosto)
    for s in (-1, 1):
        u = (x - s * ex) / 0.20
        cz = ez + 0.21 + brow_arc * 0.35 * (1 - u ** 2) - brow_tilt * u * s
        band = (np.abs(u) < 1) & (np.abs(z - cz) < brow_w * (1.3 - 0.6 * np.abs(u))) & (y < -0.45)
        skin = mix(skin, brow_col, band * 0.95)
    # lábios: o de cima na cabeça logo acima da fenda, o de baixo no alto do queixo
    lipz = (np.abs(x) < mw * (0.95 - 0.2 * (np.abs(z - mz) / 0.06))) & (y < -0.55)
    up = lipz & (z > mz) & (z < mz + 0.055 - 0.04 * (x / mw) ** 2)
    lowl = lipz & (z < mz - 0.0) & (z > mz - 0.075 + 0.04 * (x / mw) ** 2) & (r == REGIONS.index('Jaw'))
    skin = mix(skin, lip_col, (up | lowl) * 0.92)
    if VAR == 'B':  # bigodinho fino a lápis
        mus = (np.abs(x) < 0.17) & (np.abs(x) > 0.03) & (np.abs(z - (mz + 0.10 + 0.05 * np.abs(x))) < 0.012) & (y < -0.6)
        skin = mix(skin, hexc('#0e0808'), mus * 0.95)
    # cílios pintados na borda da pálpebra (a parte de baixo da meia casca)
    lash = lid_r & (np.abs(z - ez) < 0.025)
    skin = mix(skin, lash_col, lash * 0.9)
    # dentro das orelhas mais rosado
    for s in (-1, 1):
        skin = mix(skin, hexc('#c9806a'), np.clip(gauss(p, (s * 0.84, 0.06, 0.02), (0.06, 0.15, 0.2)) * 0.5, 0, 1))

    # escurece a fenda do queixo e as dobras (AO)
    skin = skin * (0.72 + 0.28 * oc[:, None] ** 0.7)
    alb[skin_r] = skin[skin_r]
    rough[skin_r] = np.clip(rough_skin, 0.2, 0.95)[skin_r] if np.ndim(rough_skin) else rough_skin
    height[skin_r] = np.clip(h_skin, 0, 1)[skin_r]

    # cabelo entalhado: laca escura no fundo dos sulcos, brilho nas cristas, gasto nas pontas
    hb = fbm(p * 6, 3, 21)
    if VAR == 'A':
        hc = mix(hexc('#2e0e06'), hexc('#7c3418'), np.clip(oc ** 2.5 * 0.9 + hb * 0.25, 0, 1))
        hc = mix(hc, hexc('#b0703c'), edge * 0.6)
        hr = 0.30 + (1 - oc) * 0.25
    else:
        hc = mix(hexc('#070506'), hexc('#2a2024'), np.clip(oc ** 3 * 0.8 + hb * 0.2, 0, 1))
        hc = mix(hc, hexc('#5a3a28'), edge * 0.6)
        hr = 0.18 + (1 - oc) * 0.25
    fine = 0.5 + 0.5 * np.sin(x * 260 + fbm(p * 8, 2, 4) * 6)
    alb[hair_r] = (hc * (0.85 + 0.15 * fine[:, None]))[hair_r]
    rough[hair_r] = np.broadcast_to(hr, (K,))[hair_r]
    height[hair_r] = (0.5 + (fine - 0.5) * 0.25)[hair_r]

    # dentes de madeira pintada (com vãos); no B um dente de ouro
    tooth_i = np.floor((x + mw) / (2 * mw) * 7)
    gap = np.abs(((x + mw) / (2 * mw) * 7) % 1 - 0.5) > 0.44
    tc = mix(hexc('#efe4c8'), hexc('#c9b88e'), big) if VAR == 'A' else mix(hexc('#d9c99a'), hexc('#8f7a4a'), big)
    tc = mix(tc, hexc('#3a2414'), gap * 1.0)
    tr = np.full(K, 0.35); tm = np.zeros(K)
    if VAR == 'B':
        gold = (tooth_i == 4) & ~gap
        tc = mix(tc, hexc('#e0a43a'), gold * 1.0)
        tr = np.where(gold, 0.22, 0.5); tm = np.where(gold, 1.0, 0.0)
    alb[teeth_r] = tc[teeth_r]; rough[teeth_r] = tr[teeth_r]; metal[teeth_r] = tm[teeth_r]
    height[teeth_r] = np.where(gap, 0.2, 0.55)[teeth_r]
    # boca por dentro: veludo vinho quase preto
    alb[mouth_r] = (hexc('#1c0507') * (0.6 + 0.4 * small[:, None]))[mouth_r]
    rough[mouth_r] = 0.9

    return to_maps(W, idx, alb, rough, metal, height, mask)


def paint_face_toy(D, V, VAR):
    """Brinquedo pintado (como os soldadinhos): poucas cores chapadas, laca, desgaste só nas quinas.
    paint='wood' deixa as marcas de goiva bem leves por baixo da tinta."""
    P, reg, curv, ao, mask = D['P'], D['region'], D['curv'], D['ao'], D['mask']
    W = P.shape[0]
    idx = mask.ravel()
    p = P.reshape(-1, 3)[idx]
    r = reg.ravel()[idx]
    cv = curv.ravel()[idx]
    oc = ao.ravel()[idx]
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    K = len(p)
    alb = np.zeros((K, 3)); rough = np.full(K, 0.4); metal = np.zeros(K); height = np.full(K, 0.5)
    ex, ez = V['eye_x'], V['eye_z']
    mz, mw = V['mouth_z'], V['mouth_w']
    wood_mode = V.get('paint') == 'wood'
    ink = V.get('eyes') == 'ink'
    skin_r = np.isin(r, [REGIONS.index(n) for n in ('Head', 'Jaw', 'Lid_L', 'Lid_R')])
    lid_r = np.isin(r, [REGIONS.index('Lid_L'), REGIONS.index('Lid_R')])
    hair_r = r == REGIONS.index('Hair')
    teeth_r = r == REGIONS.index('Teeth')
    mouth_r = r == REGIONS.index('Mouth')
    big = fbm(p * 2.0, 3, 1)
    wood = mix(hexc('#7a4a26'), hexc('#a87444'), fbm(p * np.array([30, 30, 3]), 3, 9))
    # pele: um tom só (com um leve degradê), bochechas em disco rosado de borda macia, ponta do nariz rosada
    skin = mix(hexc('#efc9a0'), hexc('#e6b98c'), big * 0.5)
    for s in (-1, 1):
        dsk = np.hypot((x - s * 0.40) / 0.15, (z + 0.24) / 0.12)
        skin = mix(skin, hexc('#e47a66'), (1 - sstep(0.75, 1.0, dsk)) * (y < -0.4) * 0.75)
    skin = mix(skin, hexc('#e38670'), np.clip(gauss(p, V['nose_tip'], (0.10, 0.2, 0.10)) * 0.5, 0, 1))
    if wood_mode:
        F1, F2, _ = voronoi(p * 11.0, 7)
        gouge = F1 ** 2
        skin = mix(skin, skin * 1.06, sstep(0.5, 0.9, F2 - F1) * 0.3)
        h_skin = 0.55 - gouge * 0.45
        rough_skin = 0.45 + gouge * 0.15
        wear_k = 0.6
    else:
        h_skin = np.full(K, 0.5)
        rough_skin = np.full(K, 0.30)
        wear_k = 0.35
    # desgaste: só nas quinas mais vivas (nariz, orelhas, queixo), mostrando a madeira
    wear = sstep(0.60, 0.70, cv) * wear_k * (fbm(p * 7, 2, 41) > 0.45)
    wear = np.where(lid_r, 0.0, wear)
    skin = mix(skin, wood, wear)
    # traço preto de pintura (sobrancelha, cílio, boca) — a mesma "tinta" dos rostos dos dominós
    inkc = hexc('#1a0e08')
    for s in ((-1, 1) if not V.get('no_brow') else ()):
        u = (x - s * ex) / 0.20
        cz = ez + 0.25 + 0.06 * (1 - u ** 2) - 0.05 * u * s
        band = (np.abs(u) < 1) & (np.abs(z - cz) < 0.026 * (1.2 - 0.5 * np.abs(u))) & (y < -0.45)
        skin = mix(skin, inkc, band * 1.0)
    # lábios: vermelho chapado
    lipz = (np.abs(x) < mw * (0.95 - 0.2 * (np.abs(z - mz) / 0.06))) & (y < -0.55)
    up = lipz & (z > mz) & (z < mz + 0.05 - 0.035 * (x / mw) ** 2)
    lowl = lipz & (z < mz) & (z > mz - 0.07 + 0.04 * (x / mw) ** 2) & (r == REGIONS.index('Jaw'))
    skin = mix(skin, hexc('#b8262c'), (up | lowl) * 1.0)
    # borda da pálpebra: traço grosso (no 'ink' é o traço que fecha o olho desenhado)
    lash = lid_r & (np.abs(z - ez) < (0.035 if ink else 0.025))
    skin = mix(skin, inkc, lash * 1.0)
    # AO bem leve: laca não junta sujeira
    skin = skin * (0.82 + 0.18 * oc[:, None] ** 0.7)
    alb[skin_r] = skin[skin_r]
    rough[skin_r] = np.broadcast_to(rough_skin + wear * 0.4, (K,))[skin_r]
    height[skin_r] = np.broadcast_to(np.clip(h_skin - wear * 0.1, 0, 1), (K,))[skin_r]

    # cabelo: laca chapada (ruiva por padrão; V['hair_col'] troca), brilho na crista e sombra no fundo
    h0, h1c, h2 = V.get('hair_col', ('#5a1e0c', '#a2401c', '#c86a34'))
    hc = mix(hexc(h0), hexc(h1c), np.clip(oc ** 2.0, 0, 1))
    hc = mix(hc, hexc(h2), sstep(0.55, 0.65, cv) * 0.5)
    if V.get('hair_lines'):  # pintado rente: riscos de pente finos penteados para trás
        comb = 0.5 + 0.5 * np.sin(x * 90 + fbm(p * 4, 2, 6) * 3)
        hc = mix(hc, hexc(h2), (comb > 0.85) * 0.6)
    alb[hair_r] = hc[hair_r]
    rough[hair_r] = 0.28 if not wood_mode else 0.4
    if wood_mode:
        height[hair_r] = (0.5 + (fbm(p * 20, 2, 4) - 0.5) * 0.2)[hair_r]

    # dentes de marfim (mesmo tom dos dominós) e boca vinho
    gap = np.abs(((x + mw) / (2 * mw) * 7) % 1 - 0.5) > 0.45
    tc = mix(hexc('#efe2c2'), hexc('#3a2414'), gap * 1.0)
    alb[teeth_r] = tc[teeth_r]; rough[teeth_r] = 0.35
    alb[mouth_r] = hexc('#2a0608'); rough[mouth_r] = 0.9
    return to_maps(W, idx, alb, rough, metal, height, mask)


def paint_body_toy(D, V, VAR):
    P, reg, curv, ao, mask = D['P'], D['region'], D['curv'], D['ao'], D['mask']
    W = P.shape[0]
    idx = mask.ravel()
    p = P.reshape(-1, 3)[idx]
    r = reg.ravel()[idx]
    cv = curv.ravel()[idx]
    oc = ao.ravel()[idx]
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    K = len(p)
    alb = np.zeros((K, 3)); rough = np.full(K, 0.4); metal = np.zeros(K); height = np.full(K, 0.5)
    sh = (0.75 + 0.25 * oc[:, None])
    # paletó roxo-escuro laqueado (puxa o roxo do fundo), camisa marfim, lapela mais clara, 2 botões dourados
    suit = hexc('#2c1f3a')
    vx = 0.30 + (z + 1.45) * 0.55
    shirt = (np.abs(x) < vx) & (y < 0) & (z > -2.3)
    lapel = (np.abs(x) < vx + 0.14) & (np.abs(x) >= vx) & (y < 0)
    jac = np.broadcast_to(suit, (K, 3)).copy()
    jac = mix(jac, hexc('#efe2c2'), shirt * 1.0)
    jac = mix(jac, hexc('#45325a'), lapel * 1.0)
    btn = np.zeros(K, bool)
    for bz in (-1.75, -2.05):
        btn |= (np.hypot(x, z - bz) < 0.045) & shirt
    jac = mix(jac, hexc('#d9a441'), btn * 1.0)
    J = r == REGIONS.index('Jacket')
    alb[J] = (jac * sh)[J]; rough[J] = np.where(btn, 0.25, 0.38)[J]; metal[J] = np.where(btn, 0.8, 0.0)[J]
    Nk = r == REGIONS.index('Neck')
    alb[Nk] = (mix(hexc('#efc9a0'), hexc('#e6b98c'), 0.5) * sh)[Nk]; rough[Nk] = 0.35
    C = r == REGIONS.index('Collar')
    alb[C] = (hexc('#efe2c2') * sh)[C]; rough[C] = 0.4
    B = r == REGIONS.index('Bow')
    alb[B] = (mix(hexc('#a81c26'), hexc('#d03a3e'), sstep(0.52, 0.6, cv)) * sh)[B]; rough[B] = 0.25
    return to_maps(W, idx, alb, rough, metal, height, mask)


def paint_body(D, V, VAR):
    P, N, reg, curv, ao, mask = D['P'], D['N'], D['region'], D['curv'], D['ao'], D['mask']
    W = P.shape[0]
    idx = mask.ravel()
    p = P.reshape(-1, 3)[idx]
    r = reg.ravel()[idx]
    cv = curv.ravel()[idx]
    oc = ao.ravel()[idx]
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    K = len(p)
    alb = np.zeros((K, 3)); rough = np.full(K, 0.8); metal = np.zeros(K); height = np.full(K, 0.5)
    big = fbm(p * 3.0, 4, 1)
    weave = 0.5 + 0.25 * (np.sin(x * 420) * np.sin(z * 420)) + 0.25 * fbm(p * 60, 2, 3)
    edge = sstep(0.52, 0.6, cv)
    # paletó: lã escura; peito da camisa em V; lapelas de cetim com costura; botão
    suit = hexc('#221c26') if VAR == 'A' else hexc('#1a1416')
    jac = mix(suit, suit * 1.8, big * 0.5 + weave * 0.2)
    vx = 0.30 + (z + 1.45) * 0.55
    shirt = (np.abs(x) < vx) & (y < 0) & (z > -2.3)
    lapel = (np.abs(x) < vx + 0.14) & (np.abs(x) >= vx) & (y < 0)
    jac = mix(jac, hexc('#d8cdb2') * (0.85 + 0.15 * weave[:, None]), shirt * 1.0)
    jac = mix(jac, suit * 2.4, lapel * 1.0)
    stitch = lapel & (np.abs(np.abs(x) - (vx + 0.12)) < 0.006) & (np.sin(z * 160) > 0)
    jac = mix(jac, hexc('#5a4a52'), stitch * 1.0)
    for bz in (-1.75, -2.05):
        jac = mix(jac, hexc('#2a2014'), (np.hypot(x, z - bz) < 0.035) & shirt)
    jac = jac * (0.5 + 0.5 * oc[:, None])
    J = r == REGIONS.index('Jacket')
    alb[J] = jac[J]; rough[J] = np.where(lapel, 0.45, 0.88)[J]
    height[J] = (0.5 + (weave - 0.5) * 0.3 - stitch * 0.2)[J]
    # pescoço: madeira crua com veio
    rad = np.sqrt(x ** 2 + (y - 0.05) ** 2)
    g = 0.5 + 0.5 * np.sin(np.arctan2(x, y - 0.05) * 14 + fbm(p * np.array([3, 3, 0.6]), 3, 4) * 8)
    neck = mix(hexc('#6a4022'), hexc('#a8743e'), g * 0.7 + big * 0.3) * (0.5 + 0.5 * oc[:, None])
    Nk = r == REGIONS.index('Neck')
    alb[Nk] = neck[Nk]; rough[Nk] = 0.7
    # colarinho
    C = r == REGIONS.index('Collar')
    alb[C] = (mix(hexc('#e8dfca'), hexc('#bfae8a'), big) * (0.6 + 0.4 * oc[:, None]))[C]; rough[C] = 0.85
    # gravata: cetim (A vermelho, B vinho escuro com pontinhos)
    B = r == REGIONS.index('Bow')
    bc = mix(hexc('#8e1822'), hexc('#c0303a'), edge) if VAR == 'A' else mix(hexc('#3a0a14'), hexc('#6a1828'), edge)
    if VAR == 'B':
        dots = vnoise(p * 60, 2) > 0.85
        bc = mix(bc, hexc('#c8a050'), dots * 0.8)
    alb[B] = (bc * (0.55 + 0.45 * oc[:, None]))[B]; rough[B] = 0.35
    return to_maps(W, idx, alb, rough, metal, height, mask)


def to_maps(W, idx, alb, rough, metal, height, mask):
    A = np.zeros((W * W, 3)); A[idx] = alb
    R = np.zeros(W * W); R[idx] = rough
    Mt = np.zeros(W * W); Mt[idx] = metal
    H = np.full(W * W, 0.5); H[idx] = height
    A = dilate(A.reshape(W, W, 3), mask)
    R = dilate(R.reshape(W, W, 1), mask)
    Mt = dilate(Mt.reshape(W, W, 1), mask)
    H = dilate(H.reshape(W, W, 1), mask)
    return A, R, Mt, H


def eye_texture(VAR, W=512):
    """Olho de vidro (polo +Z da esfera = pupila; UV padrão: v sobe até o polo)."""
    v = np.linspace(0, 1, W)[:, None] * np.ones((1, W))
    u = np.ones((W, 1)) * np.linspace(0, 1, W)[None, :]
    th = (1 - v) * np.pi  # ângulo a partir do polo da pupila
    rng = np.random.default_rng(3)
    if VAR in ('T1', 'T3', 'T5'):  # olho de boneco: marfim + pupila preta chapada
        A = np.ones((W, W, 3)) * hexc('#f4ecd8')
        A = np.where((th < 0.40)[..., None], hexc('#120a06'), A)
        return A
    if VAR == 'T2':  # traço dos dominós: o "olho" é da cor da pele, com aro e pupila em tinta preta
        A = np.ones((W, W, 3)) * hexc('#f4ecd8')
        ring = (th > 0.62) & (th < 0.76)
        A = np.where((ring | (th < 0.26))[..., None], hexc('#120a06'), A)
        return A
    if VAR == 'A':
        scl, iris1, iris2, pr, ir = hexc('#f2ead8'), hexc('#2c5a78'), hexc('#7aa8c0'), 0.22, 0.52
    else:
        scl, iris1, iris2, pr, ir = hexc('#e2d6a8'), hexc('#3a2a10'), hexc('#a8882a'), 0.12, 0.42
    A = np.ones((W, W, 3)) * scl
    # veias
    vein = (np.abs(np.sin(u * 2 * np.pi * 9 + np.sin(th * 7) * 0.8)) < 0.04) & (th > ir + 0.15)
    A = mix(A, hexc('#b04030'), vein * 0.5 * np.clip((th - ir) / 1.2, 0, 1))
    # íris com raios
    rays = 0.5 + 0.5 * np.sin(u * 2 * np.pi * 48 + rng.random() * 6)
    ic = mix(iris1, iris2, np.clip((th / ir) * 0.8 + rays * 0.3 - 0.2, 0, 1))
    ic = mix(ic, iris1 * 0.4, np.clip((th - ir * 0.85) / (ir * 0.15), 0, 1))  # aro escuro
    A = np.where((th < ir)[..., None], ic, A)
    A = np.where((th < pr)[..., None], hexc('#040202'), A)
    return A


# ---------------------------------------------------------------- entrada
def run(objs, V, VAR, OUT, TEX):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1
    # pálpebras ficam "em repouso" (rotação 0) antes de juntar; o jogo/render abre depois
    pivots = {}
    for n in ('Lid_L', 'Lid_R', 'Eye_L', 'Eye_R'):
        o = objs[n]
        pivots[n] = o.location.copy()
        if n.startswith('Lid'):
            o.rotation_euler = (0, 0, 0)
    pivots['Jaw'] = objs['Jaw'].location.copy()

    out = {}
    pf, pb = (paint_face_toy, paint_body_toy) if V.get('toy') else (paint_face, paint_body)
    for setname, names, W, painter, hs in (('face', FACE_SET, TEX, pf, 0.006), ('body', BODY_SET, TEX // 2, pb, 0.004)):
        j = tag_and_join(objs, names, setname)
        D = gather(j, W)
        A, R, Mt, H = painter(D, V, VAR)
        mat = final_material(j, f'{setname}', A, R, Mt, H, OUT, W, hs)
        out.update(split_back(j, names, mat))

    # olhos: material próprio de vidro
    ea = eye_texture(VAR)
    eimg = save_img(ea, os.path.join(OUT, 'eye_albedo.png'), True)
    em = bpy.data.materials.new('eye')
    em.use_nodes = True
    b = next(n for n in em.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    t = em.node_tree.nodes.new('ShaderNodeTexImage'); t.image = eimg
    em.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.08
    if 'Coat Weight' in b.inputs:
        b.inputs['Coat Weight'].default_value = 1.0
    for n in ('Eye_L', 'Eye_R'):
        o = objs[n]
        # aplica a rotação na malha: em repouso a pupila aponta para a frente sem rotação de nó
        o.data.transform(o.rotation_euler.to_matrix().to_4x4())
        o.rotation_euler = (0, 0, 0)
        o.data.materials.clear(); o.data.materials.append(em)
        out[n] = o
    # origens das peças animadas
    for n, pv in pivots.items():
        o = out[n]
        if n.startswith('Eye'):
            continue
        o.data.transform(Matrix.Translation(-pv))
        o.location = pv
    out['Lid_L'].rotation_euler = (-0.22, 0, 0)
    out['Lid_R'].rotation_euler = (-0.22, 0, 0)
    for extra in [k for k in objs if k not in out and k in bpy.data.objects]:
        out[extra] = objs[extra]
    # GLB
    bpy.ops.object.select_all(action='DESELECT')
    for o in out.values():
        o.select_set(True)
    for o in out.values():
        for pmat in o.data.materials:
            pass
    keep_lid = {n: out[n].rotation_euler.copy() for n in ('Lid_L', 'Lid_R')}
    for n in keep_lid:
        out[n].rotation_euler = (0, 0, 0)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f'vilao-{VAR}.glb'), export_format='GLB', use_selection=True,
                              export_apply=False, export_yup=True)
    for n, rr in keep_lid.items():
        out[n].rotation_euler = rr
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'vilao-{VAR}.blend'))
    return out
