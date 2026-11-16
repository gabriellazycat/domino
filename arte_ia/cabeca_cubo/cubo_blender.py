"""Cubo Entalhado v2 — montado como marcenaria (peças encaixadas), não primitivas coladas.
Uso: blender -b -P cubo_blender.py
Saída: arte_ia/cabeca_cubo/blender/{cubo.blend, cubo.glb, v2_frente.png, v2_tres_quartos.png, v2_olho.png}
Frente do rosto = -Y. Queixo articulado no empty 'JawHinge'.
Construção: miolo + placa do rosto (emenda aparente) · órbita entalhada com olho assentado + pálpebra pinada ·
nariz com tenão numa fenda (mortise) · bochechas/lábios/sobrancelhas EMBUTIDOS em rebaixo · dentes numa canaleta ·
cabelo com sulcos · pinos de madeira nos cantos · dobradiça de latão no queixo.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

OUT = r"C:/Users/gabri/Desktop/domino/arte_ia/cabeca_cubo/blender"
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1,)

def bsdf(m): return next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')

def mat(name, color, rough=0.5, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = bsdf(m); b.inputs['Base Color'].default_value = lin(color)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m

def wood(name, c1, c2, scale=(22, 22, 1.2)):
    m = mat(name, c1, 0.5); nt = m.node_tree; b = bsdf(m)
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = scale
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2.0; nz.inputs['Detail'].default_value = 7
    cr = nt.nodes.new('ShaderNodeValToRGB')
    cr.color_ramp.elements[0].color = lin(c1); cr.color_ramp.elements[1].color = lin(c2)
    cr.color_ramp.elements[0].position = 0.3; cr.color_ramp.elements[1].position = 0.72
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], cr.inputs['Fac']); nt.links.new(cr.outputs['Color'], b.inputs['Base Color'])
    return m

def eye_mat():
    """Olho de vidro procedural: pupila, íris e branco por distância ao eixo frontal (-Y)."""
    m = mat('olho', '#e8dec4', 0.65); nt = m.node_tree; b = bsdf(m)   # bola de madeira pintada: fosca, sem brilho de vidro
    tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); cb = nt.nodes.new('ShaderNodeCombineXYZ')
    ln = nt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'
    mu = nt.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; mu.inputs[1].default_value = 5.0
    cr = nt.nodes.new('ShaderNodeValToRGB'); cr.color_ramp.interpolation = 'CONSTANT'
    el = cr.color_ramp.elements
    el[0].position = 0.0; el[0].color = lin('#050505'); el[1].position = 0.24; el[1].color = lin('#4f7684')
    e2 = el.new(0.44); e2.color = lin('#1c2c34'); e3 = el.new(0.5); e3.color = lin('#e8dec4')
    nt.links.new(tc.outputs['Object'], sp.inputs['Vector'])
    nt.links.new(sp.outputs['X'], cb.inputs['X']); nt.links.new(sp.outputs['Z'], cb.inputs['Z'])
    nt.links.new(cb.outputs['Vector'], ln.inputs[0]); nt.links.new(ln.outputs['Value'], mu.inputs[0])
    nt.links.new(mu.outputs['Value'], cr.inputs['Fac']); nt.links.new(cr.outputs['Color'], b.inputs['Base Color'])
    return m

PLATE = wood('pinho_placa', '#ebc384', '#cf9a54'); CORE = wood('pinho_miolo', '#dcae6c', '#b8863f')
OAK = wood('carvalho', '#b98448', '#8a5a2c'); PEG = mat('pino', '#7a4c20', 0.6)
HAIR = mat('cabelo', '#2a170c', 0.4); RED = mat('tinta_vermelha', '#8e2a26', 0.4); CHEEK = mat('tinta_bochecha', '#d65c56', 0.65)
ROSY = mat('nariz', '#d98e78', 0.4); CREAM = mat('dente', '#f1e9d2', 0.5); COLLAR = mat('colarinho', '#d8cfba', 0.8)
BOW = mat('gravata', '#7a1420', 0.5); BLACK = mat('preto', '#070304', 0.9); EYE = eye_mat()
BRASS = mat('latao', '#c9a050', 0.3, 0.9); STRING = mat('corda', '#e8dfc8', 0.8); BROW = mat('tinta_sobrancelha', '#2a170c', 0.5)

W, UH, JH, D, T = 1.8, 1.3, 0.8, 1.6, 0.35   # T = espessura da placa do rosto
def V(x, up, front): return (x, -front, up)
ROOT = bpy.data.objects.new('Cabeca', None); bpy.context.scene.collection.objects.link(ROOT)

def finish(o, m, parent=None):
    o.data.materials.append(m)
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    except Exception: bpy.ops.object.shade_smooth()
    p = parent or ROOT
    o.parent = p; o.matrix_parent_inverse = p.matrix_world.inverted()
    return o

def raw_block(size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.object
    o.scale = size; bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); return o

def raw_cyl(r, depth, loc, rot=(math.pi / 2, 0, 0), verts=18):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot); return bpy.context.object

def raw_sphere(r, loc, scale=(1, 1, 1), seg=24, rings=14):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc); o = bpy.context.object
    o.scale = scale; bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); return o

def line(name, p0, p1, r=0.008):
    a, b = Vector(p0), Vector(p1); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object; o.name = name
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('Z', 'Y'); return finish(o, STRING)

def block(name, size, loc, m, bevel=0.06, rot=(0, 0, 0), parent=None):
    o = raw_block(size, loc); o.name = name
    bv = o.modifiers.new('bv', 'BEVEL'); bv.width = bevel; bv.segments = 2; bpy.ops.object.modifier_apply(modifier='bv')
    o.rotation_euler = rot; return finish(o, m, parent)

def cyl(name, r, depth, loc, m, rot=(math.pi / 2, 0, 0), verts=16, parent=None):
    o = raw_cyl(r, depth, loc, rot, verts); o.name = name; return finish(o, m, parent)

def cut(target, cutter):
    m = target.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cutter; m.solver = 'EXACT'
    bpy.ops.object.select_all(action='DESELECT'); target.select_set(True); bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=m.name); bpy.data.objects.remove(cutter, do_unlink=True)

def inlay_box(target, name, w, h, face_front, center, mat_, d=0.035, rot=(0, 0, 0), parent=None):
    """Rebaixo na face frontal (−Y) + peça de tinta/madeira encaixada rente. center=(x, up)."""
    x, up = center; y = -face_front
    cut(target, raw_block((w, 2 * d, h), (x, y, up), rot))
    return block(name, (w - 0.012, d, h - 0.012), (x, y + d / 2 + 0.004, up), mat_, 0.01, rot, parent)

def inlay_disc(target, name, r, face_front, center, mat_, d=0.03, parent=None):
    x, up = center; y = -face_front
    cut(target, raw_cyl(r, 2 * d, (x, y, up), verts=24))
    return cyl(name, r - 0.006, d, (x, y + d / 2 + 0.004, up), mat_, verts=24, parent=parent)

def dome(name, r, loc, m, rot):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=10, radius=r, location=loc); o = bpy.context.object; o.name = name
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS'); bm.to_mesh(o.data); bm.free()
    sd = o.modifiers.new('s', 'SOLIDIFY'); sd.thickness = 0.022; sd.offset = 1; bpy.ops.object.modifier_apply(modifier='s')
    o.rotation_euler = rot; return finish(o, m)

# ---------------- cabeça de cima: miolo + placa do rosto ----------------
core = block('Miolo', (W, D - T, UH), V(0, UH / 2, -T / 2), CORE, 0.09)
plate = block('PlacaRosto', (W - 0.07, T, UH - 0.06), V(0, UH / 2, D / 2 - T / 2), PLATE, 0.045)
FRONT = D / 2                                   # frente da placa
block('Cavidade', (W * 0.9, D * 0.86, 0.04), V(0, 0, 0), BLACK, 0.01)

# órbitas entalhadas (furo na placa), olho assentado dentro, aro, pálpebra pinada
EX, EY = 0.44, UH * 0.52
BALL_Y = FRONT - 0.16
for s in (-1, 1):
    # órbita ENTALHADA no próprio rosto: tigela esférica (achatada) deslocada para baixo, então a borda de cima da madeira
    # sobra como pálpebra. Sem aro, sem pálpebra separada, sem pino.
    cut(plate, raw_sphere(0.30, V(s * EX, EY - 0.06, BALL_Y), (1, 1, 0.82)))
    eye = raw_sphere(0.19, V(s * EX, EY, BALL_Y), seg=24, rings=16); eye.name = f'Olho{s}'; finish(eye, EYE)

# nariz com tenão encaixado numa fenda (mortise)
cut(plate, raw_block((0.32, 0.30, 0.40), V(0, UH * 0.3, FRONT - 0.15)))
block('Nariz', (0.26, 0.42, 0.34), V(0, UH * 0.3, FRONT - 0.06), ROSY, 0.08)

# bochechas embutidas
for s in (-1, 1): inlay_disc(plate, f'Bochecha{s}', 0.15, FRONT, (s * 0.72, 0.22), CHEEK)

# viga da testa (peça separada, com pinos) + sobrancelhas embutidas
BEAM_UP = UH - 0.17
beam = block('VigaTesta', (W - 0.02, 0.36, 0.26), V(0, BEAM_UP, FRONT - 0.12 + 0.0), OAK, 0.05)
BEAM_FRONT = FRONT + 0.06
for s in (-1, 1):
    inlay_box(beam, f'Sobrancelha{s}', 0.5, 0.09, BEAM_FRONT, (s * 0.44, BEAM_UP + 0.0), BROW, 0.025, (0, -s * 0.2, 0))

# boca: lábio de cima embutido + canaleta dos dentes
inlay_box(plate, 'LabioCima', 0.62, 0.085, FRONT, (0, 0.215), RED, 0.03)
cut(plate, raw_block((W * 0.6, 0.12, 0.17), V(0, 0.09, FRONT)))
span = W * 0.54
for i in range(5):
    block(f'DenteCima{i}', (span / 5 - 0.035, 0.05, 0.15), V(-span / 2 + (span / 5) * (i + 0.5), 0.1, FRONT - 0.035), CREAM, 0.014)

# orelhas presas com pino
for s in (-1, 1):
    block(f'Orelha{s}', (0.12, 0.34, 0.5), V(s * (W / 2 + 0.07), UH * 0.5, 0.05), OAK, 0.04)

# cabelo entalhado: boné de madeira laqueada com sulcos
hair = block('Cabelo', (W + 0.1, D + 0.08, 0.42), V(0, UH + 0.02, 0), HAIR, 0.1)
for i in range(11):
    x = -0.85 + i * 0.17
    cut(hair, raw_block((0.016, 0.06, 0.3), V(x, UH + 0.02, D / 2 + 0.04)))
for x in (-0.6, -0.25, 0.12, 0.45):
    cut(hair, raw_block((0.016, D * 0.85, 0.05), V(x, UH + 0.23, 0)))
for s in (-1, 1):
    block(f'Costeleta{s}', (0.22, D * 0.62, 0.7), V(s * (W / 2 + 0.03), UH - 0.3, 0.12), HAIR, 0.06)

# ---------------- queixo articulado ----------------
hinge = bpy.data.objects.new('JawHinge', None); hinge.location = V(0, 0, -D / 2 + 0.12)
bpy.context.scene.collection.objects.link(hinge); hinge.parent = ROOT
jcore = block('QueixoMiolo', (W * 0.93, D - T - 0.12, JH), V(0, -JH / 2, (0.12 - T) / 2), CORE, 0.08, parent=hinge)
jplate = block('QueixoPlaca', (W * 0.93 - 0.06, T, JH - 0.06), V(0, -JH / 2, D / 2 - T / 2), PLATE, 0.045, parent=hinge)
# boca de marionete: bolsão entalhado no topo do queixo (cavidade escura) + fileira de dentes de baixo
cut(jcore, raw_block((W * 0.62, D * 0.5, 0.5), V(0, 0, -0.1)))
block('BocaFundo', (W * 0.62 - 0.03, D * 0.5 - 0.03, 0.012), V(0, -0.24, -0.1), BLACK, 0.004, parent=hinge)
cut(jplate, raw_block((W * 0.6, 0.12, 0.17), V(0, -0.09, FRONT)))
for i in range(5):
    block(f'DenteBaixo{i}', (span / 5 - 0.035, 0.05, 0.15), V(-span / 2 + (span / 5) * (i + 0.5), -0.1, FRONT - 0.035), CREAM, 0.014, parent=hinge)
inlay_box(jplate, 'LabioBaixo', 0.62, 0.085, D / 2, (0, -0.33), RED, 0.03, parent=hinge)
for s in (-1, 1):
    block(f'ChapaDobradica{s}', (0.07, 0.62, 0.5), V(s * (W * 0.93 / 2 + 0.03), -0.25, -D / 2 + 0.38), OAK, 0.03, parent=hinge)
    cyl(f'PinoDobradica{s}', 0.07, 0.17, V(s * (W / 2 + 0.05), 0, -D / 2 + 0.12), OAK, rot=(0, math.pi / 2, 0), verts=16)

# ---------------- pescoço, colarinho, gravata ----------------
cyl('Pescoco', 0.38, 0.55, V(0, -JH - 0.22, 0), OAK, rot=(0, 0, 0), verts=20)
for up in (-JH + 0.02, -JH - 0.46):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.38, minor_radius=0.05, major_segments=24, minor_segments=8, location=V(0, up, 0))
    finish(bpy.context.object, OAK)
cyl('Colarinho', 0.52, 0.14, V(0, -JH - 0.52, 0), COLLAR, rot=(0, 0, 0), verts=24)
for s in (-1, 1):
    block(f'AsaGravata{s}', (0.3, 0.07, 0.2), V(s * 0.17, -JH - 0.52, FRONT - 0.16), BOW, 0.02, rot=(0, -s * 0.3, 0))
block('NoGravata', (0.1, 0.1, 0.1), V(0, -JH - 0.52, FRONT - 0.14), BOW, 0.03)

# ---------------- cordas + argolas ----------------
for i, x in enumerate((-0.55, 0.0, 0.55)):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.014, major_segments=12, minor_segments=6, location=V(x, UH + 0.25, 0))
    finish(bpy.context.object, BRASS)
    line(f'Corda{i}', V(x, UH + 0.25, 0), V(x * 1.1, UH + 7.25, 0))

JAW_A = [V(s * (W * 0.93 / 2 + 0.1), -0.15, -D / 2 + 0.38) for s in (-1, 1)]
HINGE_P = Vector(V(0, 0, -D / 2 + 0.12))
def jaw_strings(theta):
    for o in [o for o in bpy.data.objects if o.name.startswith('CordaQueixo')]: bpy.data.objects.remove(o, do_unlink=True)
    R = Matrix.Rotation(theta, 3, 'X')
    for i, a in enumerate(JAW_A):
        p0 = R @ (Vector(a) - HINGE_P) + HINGE_P
        line(f'CordaQueixo{i}', p0, (p0.x * 1.9, p0.y, 7.0))

tris = 0
for o in ROOT.children_recursive:
    if o.type == 'MESH': tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
print('TRIANGULOS', tris)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'cubo.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'cubo.glb'), export_format='GLB')

# ---------------- render ----------------
scn = bpy.context.scene
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try: scn.render.engine = eng; break
    except TypeError: continue
try: scn.eevee.taa_render_samples = 32
except Exception: pass
scn.render.resolution_x = scn.render.resolution_y = 760
scn.world = bpy.data.worlds.new('mundo'); scn.world.use_nodes = True
bg = next(n for n in scn.world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = lin('#2a1342'); bg.inputs['Strength'].default_value = 0.8
for name, kind, loc, energy, rot in (('Key', 'SUN', (4, -6, 6), 3.6, (math.radians(58), 0, math.radians(28))),
                                      ('Fill', 'POINT', (-3.5, -5, 1.5), 420, (0, 0, 0)), ('Under', 'POINT', (0, -4, -2.5), 200, (0, 0, 0))):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy
    lo = bpy.data.objects.new(name, ld); lo.location = loc; lo.rotation_euler = rot; scn.collection.objects.link(lo)
tgt = bpy.data.objects.new('Alvo', None); tgt.location = (0, 0, 0.35); scn.collection.objects.link(tgt)
cam_d = bpy.data.cameras.new('Cam'); cam_d.lens = 70
cam = bpy.data.objects.new('Cam', cam_d); scn.collection.objects.link(cam); scn.camera = cam
tc = cam.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
shots = (('v3_fechada', (0, -9, 0.5), (0, 0, 0.35), 70, 0.0), ('v3_aberta', (0, -9, 0.2), (0, 0, 0.2), 70, 0.5),
         ('v3_tres_quartos_aberta', (5.0, -7.4, 1.2), (0, 0, 0.2), 70, 0.45), ('v3_olho', (1.6, -4.2, 1.1), (0.3, 0, 0.7), 85, 0.0))
for name, loc, tg, lens, jaw in shots:
    cam.location = loc; tgt.location = tg; cam_d.lens = lens
    hinge.rotation_euler = (jaw, 0, 0); jaw_strings(jaw)
    scn.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
print('OK')
