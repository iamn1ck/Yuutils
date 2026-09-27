import bpy
import os
import json

# =====================================================
# CONFIGURATION
# =====================================================

# Change this path to your desired export location
EXPORT_ROOT = r"C:\BlenderExports"

# =====================================================
# HELPERS
# =====================================================

def ensure_dir(path):
    os.makedirs(path, exist_ok=True)

def get_rotation(obj):
    if obj.rotation_mode == 'QUATERNION':
        return {
            "mode": "QUATERNION",
            "value": list(obj.rotation_quaternion)
        }
    elif obj.rotation_mode == 'AXIS_ANGLE':
        return {
            "mode": "AXIS_ANGLE",
            "value": list(obj.rotation_axis_angle)
        }
    else:
        return {
            "mode": obj.rotation_mode,
            "value": [
                obj.rotation_euler.x,
                obj.rotation_euler.y,
                obj.rotation_euler.z
            ]
        }

# =====================================================
# MAIN
# =====================================================

ensure_dir(EXPORT_ROOT)

export_data = {
    "collections": []
}

view_layer = bpy.context.view_layer

for collection in bpy.data.collections:

    collection_folder = os.path.join(EXPORT_ROOT, collection.name)
    ensure_dir(collection_folder)

    collection_info = {
        "name": collection.name,
        "objects": []
    }

    for obj in collection.objects:

        obj_info = {
            "name": obj.name,
            "type": obj.type,
            "location": [
                obj.location.x,
                obj.location.y,
                obj.location.z
            ],
            "rotation": get_rotation(obj),
            "scale": [
                obj.scale.x,
                obj.scale.y,
                obj.scale.z
            ]
        }

        collection_info["objects"].append(obj_info)

        # -------------------------------------------------
        # Export object as individual FBX
        # -------------------------------------------------

        bpy.ops.object.select_all(action='DESELECT')

        obj.select_set(True)
        view_layer.objects.active = obj

        safe_name = bpy.path.clean_name(obj.name)
        fbx_path = os.path.join(
            collection_folder,
            f"{safe_name}.fbx"
        )

        bpy.ops.export_scene.fbx(
            filepath=fbx_path,
            use_selection=True,
            apply_unit_scale=True,
            bake_space_transform=False,
            object_types={'MESH', 'EMPTY', 'ARMATURE', 'CAMERA', 'LIGHT'},
            use_mesh_modifiers=True,
            add_leaf_bones=False
        )

        print(f"Exported: {fbx_path}")

    export_data["collections"].append(collection_info)

# =====================================================
# SAVE JSON
# =====================================================

json_path = os.path.join(EXPORT_ROOT, "transforms.json")

with open(json_path, "w", encoding="utf-8") as f:
    json.dump(export_data, f, indent=4)

print(f"Transform data saved: {json_path}")
print("Export complete.")