"""Exporta a variante escolhida para o jogo, leve: texturas reduzidas e em JPEG.
uso: blender -b tools/vilao2/out/T7B/vilao-T7B.blend --python tools/vilao2/export_jogo.py -- <saida.glb>
"""
import sys
import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]

# rosto 2K -> 1K, corpo 1K -> 512 (laca chapada: não perde detalhe visível na distância do jogo)
for img in bpy.data.images:
    if img.size[0] >= 2048:
        img.scale(1024, 1024)
    elif img.size[0] >= 1024:
        img.scale(512, 512)

# malha mais leve: superfícies lisas aguentam bem o colapso (o peso do GLB era quase todo geometria)
RATIO = {'Head': 0.35, 'Hair': 0.30, 'Bow': 0.30, 'Jacket': 0.5, 'Jaw': 0.6}
for o in bpy.context.scene.objects:
    r = next((v for k, v in RATIO.items() if o.name.startswith(k)), None)
    if o.type != 'MESH' or r is None:
        continue
    m = o.modifiers.new('dec', 'DECIMATE')
    m.ratio = r
    m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)

bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        o.select_set(True)
# pálpebras exportadas em repouso (o jogo esconde; os olhos são desenhados em 2D)
for n in ('Lid_L', 'Lid_R'):
    if n in bpy.data.objects:
        bpy.data.objects[n].rotation_euler = (0, 0, 0)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=88)
print('EXPORTADO', out)
