import bpy
import bmesh

HEIGHT_THRESHOLD = 1.0
HEIGHT_INCREASE = 4.0

for obj in bpy.context.selected_objects:
    if obj.type != 'MESH':
        continue

    bm = bmesh.new()
    bm.from_mesh(obj.data)

    for v in bm.verts:
        if v.co.z > HEIGHT_THRESHOLD:
            v.co.z += HEIGHT_INCREASE

    bm.to_mesh(obj.data)
    bm.free()

    obj.data.update()