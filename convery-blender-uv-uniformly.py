import bpy

obj = bpy.context.active_object

if obj is None or obj.type != 'MESH':
    raise Exception("Select a mesh object")

mesh = obj.data

# Create UV map if needed
if not mesh.uv_layers:
    mesh.uv_layers.new(name="UVMap")

uv_layer = mesh.uv_layers.active.data

# UVs for a quad
quad_uvs = [
    (0.0, 0.0),
    (1.0, 0.0),
    (1.0, 1.0),
    (0.0, 1.0),
]

for poly in mesh.polygons:
    if len(poly.loop_indices) != 4:
        print(f"Skipping non-quad face {poly.index}")
        continue

    for i, loop_idx in enumerate(poly.loop_indices):
        uv_layer[loop_idx].uv = quad_uvs[i]

mesh.update()
print("UVs assigned.")