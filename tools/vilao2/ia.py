# Cabeças de IA (TRELLIS.2, já geradas em arte_ia/cabecas_dono) limpas no Blender para o laboratório do vilão.
#   blender -b --python tools/vilao2/ia.py -- preview            → renders de frente de todas, para escolher
#   blender -b --python tools/vilao2/ia.py -- IA-A <arquivo.glb> [param=valor ...]  → GLB articulado
# Limpeza: centraliza e escala (crânio ~1 m de raio, frente = -Y), tira o metal que a IA previu na pele,
# corta o queixo articulado (mesma fenda dos modelos do Blender), abre as órbitas e põe olhos de vidro e
# pálpebras de verdade (a IA pinta o olho na superfície: não gira nem pisca).
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, 'arte_ia', 'cabecas_dono', 'modelos', 'trellis2')
sys.argv_ = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
sys.path.insert(0, HERE)
os.environ['VILAO2_LIB'] = '1'


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    # tira os pais (o glTF importa com um nó raiz) mantendo a pose
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    for m in o.data.materials:
        b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b:
            for l in list(b.inputs['Metallic'].links):
                m.node_tree.links.remove(l)
            b.inputs['Metallic'].default_value = 0.0
    return o


def normalize(o, rot_z=0.0):
    """Centro na caixa, maior meia-altura = 1,15 (cabeça + pescoço), frente para -Y."""
    me = o.data
    me.transform(Matrix.Rotation(rot_z, 4, 'Z'))
    co = np.array([v.co[:] for v in me.vertices])
    lo, hi = co.min(0), co.max(0)
    c = (lo + hi) / 2
    s = 2.3 / (hi[2] - lo[2])
    me.transform(Matrix.Scale(s, 4) @ Matrix.Translation(Vector(-c)))
    me.update()
    return s


def preview():
    import vilao2_render as R
    outdir = os.path.join(HERE, 'out', 'ia-preview')
    os.makedirs(outdir, exist_ok=True)
    for f in sorted(os.listdir(SRC)):
        if not f.endswith('.glb'):
            continue
        reset()
        o = load(os.path.join(SRC, f))
        normalize(o)
        cam = R.setup_render(600)
        R.shoot(cam, os.path.join(outdir, f.replace('.glb', '-frente.png')), (0, -1, 0.1), dist=8.5, target=(0, 0, 0))
        R.shoot(cam, os.path.join(outdir, f.replace('.glb', '-perfil.png')), (1, 0, 0.1), dist=8.5, target=(0, 0, 0))


# medidas tiradas dos renders de frente normalizados (out/ia-preview/medir.png), em metros antes do fator F
HEADS = {
    'IA-A': dict(file='cavalheiro__qwen21t__jogo__s2026.glb', eyes=[(-0.235, 0.27), (0.19, 0.27)], eye_r=0.075,
                 mouth_z=-0.27, mouth_w=0.17, chin=-0.58, lid='#9a6a44', var='A'),
    'IA-B': dict(file='rachado__s2026.glb', eyes=[(-0.205, 0.215), (0.200, 0.215)], eye_r=0.085,
                 mouth_z=-0.29, mouth_w=0.19, chin=-0.62, lid='#a88a70', var='B'),
}
F = 1.25  # deixa a cabeça da IA do tamanho das do Blender


def flat(name, hexs, rough=0.6):
    import paint as P
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*P.hexc(hexs), 1)
    b.inputs['Roughness'].default_value = rough
    return m


def cube(name, lo, hi, mat=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector([lo[i] + (v.co[i] + 0.5) * (hi[i] - lo[i]) for i in range(3)])
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if mat:
        me.materials.append(mat)
    return o


def sphere(name, c, r, mat=None, seg=32):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.location = c
    if mat:
        me.materials.append(mat)
    return o


def bool_apply(a, cutter, op):
    m = a.modifiers.new('b', 'BOOLEAN')
    m.object = cutter
    m.operation = op
    solvers = [i.identifier for i in bpy.types.BooleanModifier.bl_rna.properties['solver'].enum_items]
    m.solver = 'EXACT' if 'EXACT' in solvers else solvers[0]
    if hasattr(m, 'material_mode'):
        m.material_mode = 'TRANSFER'
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = a
    a.select_set(True)
    bpy.ops.object.modifier_apply(modifier=m.name)


def surface_y(o, x, z):
    """Onde a superfície da frente está (raio vindo da frente, -Y → +Y)."""
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get())
    hit = bvh.ray_cast(Vector((x, -5, z)), Vector((0, 1, 0)))
    return hit[0].y if hit[0] is not None else -0.6


def build(key):
    import paint as P
    H = HEADS[key]
    reset()
    head = load(os.path.join(SRC, H['file']))
    normalize(head)
    head.data.transform(Matrix.Scale(F, 4))
    head.name = 'Head'; head.data.name = 'Head'
    dark = flat('fenda', '#1c0d08', 0.9)
    eye_r = H['eye_r'] * F
    out = dict(Head=head)
    eye_img = P.save_img(P.eye_texture(H['var']), os.path.join(OUTD, 'eye_albedo.png'), True)
    em = bpy.data.materials.new('eye'); em.use_nodes = True
    b = next(n for n in em.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    t = em.node_tree.nodes.new('ShaderNodeTexImage'); t.image = eye_img
    em.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.08
    lidm = flat('palpebra', H['lid'], 0.5)
    for (ex, ez) in H['eyes']:
        ex, ez = ex * F, ez * F
        side = 'L' if ex > 0 else 'R'
        ys = surface_y(head, ex, ez)
        c = Vector((ex, ys + eye_r * 0.55, ez))
        # órbita: abre um buraco um pouco maior que o olho (as paredes novas ficam escuras)
        cut = sphere('cut', c + Vector((0, -0.01, 0)), eye_r * 1.08, dark)
        bool_apply(head, cut, 'DIFFERENCE')
        bpy.data.objects.remove(cut)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=eye_r, location=c)  # (tem UV)
        eye = bpy.context.object; eye.name = f'Eye_{side}'; eye.data.name = eye.name
        eye.data.materials.append(em)
        eye.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))  # polo da pupila para -Y
        for p in eye.data.polygons:
            p.use_smooth = True
        me = bpy.data.meshes.new(f'Lid_{side}')
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=eye_r * 1.08)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if sum(v.co.z for v in f.verts) / len(f.verts) < 0], context='FACES')
        bm.to_mesh(me); bm.free()
        me.materials.append(lidm)
        for p in me.polygons:
            p.use_smooth = True
        lid = bpy.data.objects.new(f'Lid_{side}', me)
        bpy.context.collection.objects.link(lid)
        so = lid.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.012
        bpy.context.view_layer.objects.active = lid
        bpy.ops.object.modifier_apply(modifier='so')
        lid.location = c
        out[eye.name] = eye; out[lid.name] = lid
    # queixo articulado: bloco entre duas fendas que descem dos cantos da boca
    mz, w, gap = H['mouth_z'] * F, H['mouth_w'] * F, 0.012
    jaw = head.copy(); jaw.data = head.data.copy(); jaw.name = 'Jaw'; jaw.data.name = 'Jaw'
    bpy.context.collection.objects.link(jaw)
    cz = H['chin'] * F
    cin = cube('cin', (-w, -3, cz), (w, 0.0, mz), dark)
    cout = cube('cout', (-w - gap, -3, cz - gap), (w + gap, gap, mz + gap * 1.5), dark)
    bool_apply(jaw, cin, 'INTERSECT')
    bool_apply(head, cout, 'DIFFERENCE')
    for o in (cin, cout):
        bpy.data.objects.remove(o)
    # só o rosto: o pescoço que a IA fez fica na cabeça (abaixo do queixo o corte some atrás da mesa)
    piv = Vector((0, 0.0, mz + 0.02))
    jaw.data.transform(Matrix.Translation(-piv)); jaw.location = piv
    out['Jaw'] = jaw
    # cavidade escura atrás da boca
    ysm = surface_y(head, 0, mz + 0.03)
    cav = cube('Mouth', (-w + 0.02, ysm + 0.16, mz - 0.22), (w - 0.02, ysm + 0.40, mz + 0.005), flat('boca', '#160406', 0.9))
    out['Mouth'] = cav
    for n in ('Lid_L', 'Lid_R'):
        out[n].rotation_euler = (0, 0, 0)
    bpy.ops.object.select_all(action='DESELECT')
    for o in out.values():
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUTD, f'{key}.glb'), export_format='GLB', use_selection=True, export_yup=True)
    # renders
    import vilao2_render as R
    for n in ('Lid_L', 'Lid_R'):
        out[n].rotation_euler = (-0.25, 0, 0)
    cam = R.setup_render(900)
    R.shoot(cam, os.path.join(OUTD, 'frente.png'), (0, -1, 0.1), dist=7.4, target=(0, 0, -0.1))
    R.shoot(cam, os.path.join(OUTD, '34.png'), (0.7, -1, 0.25), dist=7.4, target=(0, 0, -0.1))
    R.shoot(cam, os.path.join(OUTD, 'perfil.png'), (1, -0.15, 0.05), dist=7.4, target=(0, 0, -0.1))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUTD, f'{key}.blend'))


if __name__ == '__main__':
    a = sys.argv_
    if a and a[0] == 'preview':
        preview()
    elif a:
        OUTD = os.path.join(HERE, 'out', a[0])
        os.makedirs(OUTD, exist_ok=True)
        build(a[0])
