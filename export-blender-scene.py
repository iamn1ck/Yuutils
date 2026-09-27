import bpy
import os
import json
import shutil

# =====================================================
# CONFIGURATION
# =====================================================

# Change this path to your desired export location
EXPORT_ROOT = r"/home/n1ck/dev/surreal/model-export"

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

def get_safe_png_name(img):
    raw_name = os.path.basename(img.name)
    stem, _ = os.path.splitext(raw_name)
    clean_stem = bpy.path.clean_name(stem)
    return f"{clean_stem}.png"

def export_image_to_png(img, dest_path):
    ensure_dir(os.path.dirname(dest_path))
    if os.path.exists(dest_path):
        return True

    # 1. Packed PNG in Blender (direct fast binary write)
    if img.packed_file and img.packed_file.data:
        if img.packed_file.data[:8] == b'\x89PNG\r\n\x1a\n':
            with open(dest_path, "wb") as f:
                f.write(img.packed_file.data)
            return True

    # 2. File exists on disk
    if img.filepath:
        abs_path = bpy.path.abspath(img.filepath)
        if os.path.exists(abs_path):
            if abs_path.lower().endswith(".png"):
                shutil.copyfile(abs_path, dest_path)
                return True

    # 3. Use Blender's save_render to convert / save as PNG
    try:
        scene = bpy.context.scene
        orig_format = scene.render.image_settings.file_format
        scene.render.image_settings.file_format = 'PNG'
        img.save_render(dest_path)
        scene.render.image_settings.file_format = orig_format
        return True
    except Exception as e:
        print(f"Warning: Failed to export image {img.name} to {dest_path}: {e}")
        return False

def classify_texture(img_name, node):
    lower = img_name.lower()
    base = os.path.basename(lower)
    is_normal = False
    is_detail = False
    is_spec = False

    if '_n.' in base or base.endswith('n.png') or '_normal' in base or '_bump' in base or 'generic_bump' in base:
        is_normal = True
    elif '_ref.' in base or '_spec' in base:
        is_spec = True
    elif 'detail' in base or base.startswith('dt_'):
        is_detail = True

    role = 'diffuse'
    if is_normal:
        role = 'normal'
    elif is_spec:
        role = 'specular'
    elif is_detail:
        role = 'detail'
    elif node and node.outputs:
        for out in node.outputs:
            for link in out.links:
                to_socket = link.to_socket.name.lower()
                if 'base color' in to_socket:
                    role = 'base_color'
                elif 'roughness' in to_socket:
                    role = 'roughness'
                elif 'metallic' in to_socket:
                    role = 'metallic'
                elif 'alpha' in to_socket:
                    role = 'alpha'
                elif 'normal' in to_socket:
                    role = 'normal'

    # Higher priority score indicates preferred primary diffuse texture
    priority = 0
    if role == 'base_color':
        priority = 100
    elif role == 'diffuse':
        priority = 80
    elif role == 'detail':
        priority = 40
    elif role in ('alpha', 'specular', 'roughness'):
        priority = 20
    elif role == 'normal':
        priority = 10

    if node and node.image:
        w, h = node.image.size[:]
        if w * h > 64 * 64:
            priority += 5

    return role, priority

def extract_material_info(mat):
    info = {
        "name": mat.name,
        "base_color": [1.0, 1.0, 1.0, 1.0],
        "roughness": 0.5,
        "metallic": 0.0,
        "textures": []
    }

    if not mat.node_tree:
        info["base_color"] = list(mat.diffuse_color)
        info["roughness"] = float(getattr(mat, "roughness", 0.5))
        info["metallic"] = float(getattr(mat, "metallic", 0.0))
        return info

    nodes = mat.node_tree.nodes
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf:
        if 'Base Color' in bsdf.inputs and not bsdf.inputs['Base Color'].is_linked:
            info['base_color'] = list(bsdf.inputs['Base Color'].default_value)
        if 'Roughness' in bsdf.inputs and not bsdf.inputs['Roughness'].is_linked:
            info['roughness'] = float(bsdf.inputs['Roughness'].default_value)
        if 'Metallic' in bsdf.inputs and not bsdf.inputs['Metallic'].is_linked:
            info['metallic'] = float(bsdf.inputs['Metallic'].default_value)

    seen_images = set()
    for node in nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            img = node.image
            if img.name in seen_images:
                continue
            seen_images.add(img.name)

            role, prio = classify_texture(img.name, node)
            png_name = get_safe_png_name(img)

            tex_info = {
                "name": img.name,
                "filename": png_name,
                "role": role,
                "width": img.size[0],
                "height": img.size[1],
                "_priority": prio,
                "_image": img
            }
            info["textures"].append(tex_info)

    return info

# =====================================================
# MAIN
# =====================================================

ensure_dir(EXPORT_ROOT)
global_textures_dir = os.path.join(EXPORT_ROOT, "textures")
ensure_dir(global_textures_dir)

export_data = {
    "collections": [],
    "materials": {}
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

        # -------------------------------------------------
        # Extract Materials & Textures for Object
        # -------------------------------------------------
        obj_materials = []
        obj_textures = []
        candidate_pngs = []

        if hasattr(obj, "material_slots"):
            for slot in obj.material_slots:
                if slot.material:
                    mat_info = extract_material_info(slot.material)

                    # Export textures for this material
                    for tex in mat_info["textures"]:
                        img = tex["_image"]
                        png_filename = tex["filename"]
                        rel_path = f"{collection.name}/{png_filename}"
                        tex["path"] = rel_path

                        # 1. Export inside collection folder
                        col_tex_path = os.path.join(collection_folder, png_filename)
                        export_image_to_png(img, col_tex_path)

                        # 2. Export inside global textures cache
                        global_tex_path = os.path.join(global_textures_dir, png_filename)
                        export_image_to_png(img, global_tex_path)

                        candidate_pngs.append((png_filename, rel_path, tex["_priority"]))
                        if png_filename not in obj_textures:
                            obj_textures.append(png_filename)

                    # Clean internal helper fields before serializing
                    clean_mat_info = {
                        "name": mat_info["name"],
                        "base_color": mat_info["base_color"],
                        "roughness": mat_info["roughness"],
                        "metallic": mat_info["metallic"],
                        "textures": [
                            {
                                "name": t["name"],
                                "filename": t["filename"],
                                "path": t.get("path", f"{collection.name}/{t['filename']}"),
                                "role": t["role"],
                                "width": t["width"],
                                "height": t["height"]
                            }
                            for t in mat_info["textures"]
                        ]
                    }
                    obj_materials.append(clean_mat_info)

                    # Register in global materials map
                    if mat_info["name"] not in export_data["materials"]:
                        export_data["materials"][mat_info["name"]] = clean_mat_info

        # Select primary material and primary PNG
        primary_png = None
        primary_png_path = None
        if candidate_pngs:
            candidate_pngs.sort(key=lambda item: item[2], reverse=True)
            primary_png = candidate_pngs[0][0]
            primary_png_path = candidate_pngs[0][1]

        primary_material = None
        if obj_materials:
            # 1. Prefer material that contains the primary PNG
            if primary_png:
                for m in obj_materials:
                    if any(t["filename"] == primary_png for t in m["textures"]):
                        primary_material = m["name"]
                        break
            # 2. Prefer material with any textures
            if not primary_material:
                for m in obj_materials:
                    if m["textures"]:
                        primary_material = m["name"]
                        break
            # 3. Fallback to first material
            if not primary_material:
                primary_material = obj_materials[0]["name"]

        safe_name = bpy.path.clean_name(obj.name)

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
            ],
            "material": primary_material,
            "png": primary_png,
            "png_path": primary_png_path,
            "textures": obj_textures,
            "materials": obj_materials
        }

        collection_info["objects"].append(obj_info)

        # -------------------------------------------------
        # Export individual Material JSON for Object
        # -------------------------------------------------
        mat_json_path = os.path.join(
            collection_folder,
            f"{safe_name}.material.json"
        )
        with open(mat_json_path, "w", encoding="utf-8") as f:
            json.dump({
                "object": obj.name,
                "primary_material": primary_material,
                "primary_png": primary_png,
                "primary_png_path": primary_png_path,
                "textures": obj_textures,
                "materials": obj_materials
            }, f, indent=4)

        # -------------------------------------------------
        # Export object as individual FBX
        # -------------------------------------------------
        bpy.ops.object.select_all(action='DESELECT')

        obj.select_set(True)
        view_layer.objects.active = obj

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

        print(f"Exported: {fbx_path} (Material: {primary_material}, PNG: {primary_png})")

    export_data["collections"].append(collection_info)

# =====================================================
# SAVE JSON
# =====================================================

json_path = os.path.join(EXPORT_ROOT, "transforms.json")

with open(json_path, "w", encoding="utf-8") as f:
    json.dump(export_data, f, indent=4)

print(f"Transform data saved: {json_path}")
print("Export complete.")