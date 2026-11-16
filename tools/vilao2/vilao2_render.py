import bpy, os
from mathutils import Vector

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
    bpy.context.scene.render.filepath = name
    bpy.ops.render.render(write_still=True)


