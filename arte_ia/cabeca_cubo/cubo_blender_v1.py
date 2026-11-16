"""Cubo Entalhado (cabeça do dono da mesa) low poly no Blender — esboço rápido.
Uso: blender -b -P cubo_blender.py
Saída: arte_ia/cabeca_cubo/blender/{cubo.blend, cubo.glb, frente.png, tres_quartos.png}
Eixos: frente do rosto = -Y (vista frontal do Blender); queixo articulado no empty 'JawHinge'.
"""
import bpy, math, os
from mathutils import Vector

OUT = r"C:/Users/gabri/Desktop/domino/arte_ia/cabeca_cubo/blender"
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1,)

def bsdf(m):
    return next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')

def mat(name, color, rough=0.5, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = bsdf(m); b.inputs['Base Color'].default_value = lin(color)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m

def wood(name, c1, c2):
    m = mat(name, c1, 0.55); nt = m.node_tree; b = bsdf(m)
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (16, 16, 1.4)
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2.2; nz.inputs['Detail'].default_value = 6
    cr = nt.nodes.new('ShaderNodeValToRGB')
    cr.color_ramp.elements[0].color = lin(c1); cr.color_ramp.elements[1].color = lin(c2)
    cr.color_ramp.elements[0].position = 0.35; cr.color_ramp.elements[1].position = 0.7
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], cr.inputs['Fac']); nt.links.new(cr.outputs['Color'], b.inputs['Base Color'])
    return m

PINE = wood('pinho', '#e6bd7e', '#c9964f'); OAK = wood('carvalho', '#b98448', '#8a5a2c')
HAIR = mat('cabelo', '#2a170c', 0.35); RED = mat('labio', '#8e2a26', 0.4); CHEEK = mat('bochecha', '#d65c56', 0.7)
ROSY = mat('nariz', '#d98e78', 0.4); CREAM = mat('dente', '#f1e9d2', 0.5); COLLAR = mat('colarinho', '#d8cfba', 0.8)
BOW = mat('gravata', '#7a1420', 0.5); BLACK = mat('preto', '#070304', 0.9); WHITE = mat('olho', '#efe7d6', 0.15)
IRIS = mat('iris', '#4a6c78', 0.15)

W, UH, JH, D = 1.8, 1.3, 0.8, 1.6
def V(x, up, front): return (x, -front, up)   # três.js (x, y, z) -> Blender (frente = -Y, cima = Z)
ROOT = bpy.data.objects.new('Cabeca', None); bpy.context.scene.collection.objects.link(ROOT)

def finish(o, m, parent=None):
    o.data.materials.append(m)
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    except Exception: bpy.ops.object.shade_smooth()
    o.parent = parent or ROOT
    o.matrix_parent_inverse = (parent or ROOT).matrix_world.inverted()
    return o

def block(name, size, loc, m, bevel=0.1, rot=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.object; o.name = name
    o.scale = size; bpy.ops.object.transform_apply(scale=True)
    bv = o.modifiers.new('bv', 'BEVEL'); bv.width = bevel; bv.segments = 2
    bpy.ops.object.modifier_apply(modifier='bv'); o.rotation_euler = rot
    return finish(o, m, parent)

def cyl(name, r, depth, loc, m, rot=(0, 0, 0), verts=14, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; return finish(o, m, parent)

def sphere(name, r, loc, m, seg=14, rings=9, scale=(1, 1, 1), parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.object; o.name = name; o.scale = scale; bpy.ops.object.transform_apply(scale=True); return finish(o, m, parent)

# cabeça de cima + cavidade da boca
block('Craneo', (W, D, UH), V(0, UH / 2, 0), PINE, 0.15)
block('BocaCavidade', (W * 0.9, D * 0.86, 0.04), V(0, 0, 0), BLACK, 0.01)
# queixo articulado
hinge = bpy.data.objects.new('JawHinge', None); hinge.location = V(0, 0, -D / 2 + 0.12)
bpy.context.scene.collection.objects.link(hinge); hinge.parent = ROOT
block('Queixo', (W * 0.96, D - 0.12, JH), V(0, -JH / 2, 0.06), PINE, 0.14, parent=hinge)
block('LabioBaixo', (0.62, 0.08, 0.09), V(0, -0.07, D / 2 - 0.01), RED, 0.03, parent=hinge)
# cabelo laqueado
block('Cabelo', (W + 0.1, D + 0.08, 0.42), V(0, UH + 0.02, 0), HAIR, 0.13)
for s in (-1, 1):
    block(f'Costeleta{s}', (0.22, D * 0.7, 0.7), V(s * (W / 2 + 0.02), UH - 0.3, 0.1), HAIR, 0.06)
    block(f'Orelha{s}', (0.12, 0.34, 0.5), V(s * (W / 2 + 0.07), UH * 0.5, 0.05), OAK, 0.04)
    cyl(f'Bochecha{s}', 0.2, 0.03, V(s * 0.62, UH * 0.22, D / 2 + 0.005), CHEEK, rot=(math.pi / 2, 0, 0), verts=20)
    block(f'Sobrancelha{s}', (0.5, 0.09, 0.1), V(s * 0.44, UH * 0.55 + 0.38, D / 2 + 0.02), HAIR, 0.03, rot=(0, -s * 0.22, 0))
    ex = V(s * 0.44, UH * 0.55, D / 2 - 0.02)
    block(f'Orbita{s}', (0.5, 0.06, 0.42), V(s * 0.44, UH * 0.55, D / 2 - 0.06), BLACK, 0.02)
    sphere(f'Olho{s}', 0.2, ex, WHITE)
    cyl(f'Iris{s}', 0.09, 0.02, (ex[0], ex[1] - 0.195, ex[2] - 0.02), IRIS, rot=(math.pi / 2, 0, 0), verts=16)
    cyl(f'Pupila{s}', 0.045, 0.02, (ex[0], ex[1] - 0.205, ex[2] - 0.02), BLACK, rot=(math.pi / 2, 0, 0), verts=12)
block('Nariz', (0.26, 0.34, 0.34), V(0, UH * 0.3, D / 2 + 0.05), ROSY, 0.08)
block('LabioCima', (0.62, 0.08, 0.09), V(0, 0.12, D / 2 + 0.03), RED, 0.03)
span = W * 0.78
for i in range(6):
    block(f'Dente{i}', (span / 6 - 0.02, 0.06, 0.08), V(-span / 2 + (span / 6) * (i + 0.5), 0.04, D / 2 - 0.02), CREAM, 0.01)
# pescoço, colarinho, gravata-borboleta
cyl('Pescoco', 0.38, 0.55, V(0, -JH - 0.22, 0), OAK)
cyl('Colarinho', 0.58, 0.28, V(0, -JH - 0.48, 0), COLLAR, rot=(0, 0, math.pi / 4), verts=4)
for s in (-1, 1):
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.17, depth=0.34, location=V(s * 0.17, -JH - 0.42, D / 2 - 0.05), rotation=(0, s * math.pi / 2, 0))
    o = bpy.context.object; o.name = f'Gravata{s}'; o.scale = (0.5, 1, 1); finish(o, BOW)
sphere('NoGravata', 0.08, V(0, -JH - 0.42, D / 2 - 0.03), BOW, 12, 8)

# estatísticas
tris = 0
for o in ROOT.children_recursive:
    if o.type == 'MESH': tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
print('TRIANGULOS', tris)

# exporta
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'cubo.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'cubo.glb'), export_format='GLB')

# cena de render
scn = bpy.context.scene
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try: scn.render.engine = eng; break
    except TypeError: continue
scn.render.resolution_x = scn.render.resolution_y = 900
scn.world = bpy.data.worlds.new('mundo'); scn.world.use_nodes = True
bg = next(n for n in scn.world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = lin('#241038'); bg.inputs['Strength'].default_value = 0.6
for name, kind, loc, energy in (('Key', 'SUN', (4, -6, 6), 3.2), ('Fill', 'POINT', (-3, -5, -2), 260)):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy
    lo = bpy.data.objects.new(name, ld); lo.location = loc; scn.collection.objects.link(lo)
    if kind == 'SUN': lo.rotation_euler = (math.radians(55), 0, math.radians(30))
tgt = bpy.data.objects.new('Alvo', None); tgt.location = (0, 0, 0.35); scn.collection.objects.link(tgt)
cam_d = bpy.data.cameras.new('Cam'); cam_d.lens = 70
cam = bpy.data.objects.new('Cam', cam_d); scn.collection.objects.link(cam); scn.camera = cam
tc = cam.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
for name, loc in (('frente', (0, -9, 0.5)), ('tres_quartos', (5.2, -7.2, 1.4))):
    cam.location = loc; scn.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
print('OK')
