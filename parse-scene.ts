import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Quaternion Math helper functions
function multiplyQuaternions(q1: {x:number, y:number, z:number, w:number}, q2: {x:number, y:number, z:number, w:number}) {
  return {
    x: q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    y: q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
    z: q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
    w: q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z
  };
}

function eulerToQuaternionXYZ(rx: number, ry: number, rz: number) {
  const cx = Math.cos(rx * 0.5);
  const sx = Math.sin(rx * 0.5);
  const cy = Math.cos(ry * 0.5);
  const sy = Math.sin(ry * 0.5);
  const cz = Math.cos(rz * 0.5);
  const sz = Math.sin(rz * 0.5);

  const qx = { x: sx, y: 0, z: 0, w: cx };
  const qy = { x: 0, y: sy, z: 0, w: cy };
  const qz = { x: 0, y: 0, z: sz, w: cz };

  const qzy = multiplyQuaternions(qz, qy);
  return multiplyQuaternions(qzy, qx);
}

// R rotates coordinates by -90 degrees around X to convert Blender (Z-up) to Godot (Y-up)
const R = eulerToQuaternionXYZ(-Math.PI / 2, 0, 0);
const R_inv = { x: -R.x, y: -R.y, z: -R.z, w: R.w };

function transformRotation(qb: {x:number, y:number, z:number, w:number}) {
  const temp = multiplyQuaternions(R, qb);
  return multiplyQuaternions(temp, R_inv);
}

function toCamelCase(str: string): string {
  const parts = str.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts[0].toLowerCase() + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
}

function toPascalCase(str: string): string {
  const parts = str.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
}

/**
 * Extracts texture info from an object in transforms.json
 */
function findTextureForObject(obj: any): { pngName: string; pngRelPath: string | null } | null {
  if (obj.png) {
    return { pngName: obj.png, pngRelPath: obj.png_path || null };
  }
  if (Array.isArray(obj.textures) && obj.textures.length > 0) {
    const baseColorTex = obj.textures.find((t: string) => !t.endsWith('_n.png') && !t.includes('noise')) || obj.textures[0];
    return { pngName: path.basename(baseColorTex), pngRelPath: baseColorTex };
  }
  if (Array.isArray(obj.materials)) {
    for (const mat of obj.materials) {
      if (Array.isArray(mat.textures)) {
        const baseColor = mat.textures.find((t: any) => t.role === 'base_color' || (!t.filename?.endsWith('_n.png') && !t.filename?.includes('noise'))) || mat.textures[0];
        if (baseColor && baseColor.filename) {
          return { pngName: baseColor.filename, pngRelPath: baseColor.path || null };
        }
      }
    }
  }
  return null;
}

/**
 * Searches the scene directory for the source PNG file
 */
function resolveSourcePng(sceneDir: string, colName: string, pngName: string, pngRelPath: string | null): string | null {
  const candidates: string[] = [];

  if (pngRelPath) {
    candidates.push(path.join(sceneDir, pngRelPath));
  }
  candidates.push(path.join(sceneDir, colName, pngName));
  candidates.push(path.join(sceneDir, pngName));
  candidates.push(path.join(sceneDir, 'props', pngName));
  candidates.push(path.join(sceneDir, 'brushes', pngName));
  candidates.push(path.join(sceneDir, 'textures', pngName));
  candidates.push(path.join(sceneDir, 'Collection', pngName));

  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return c;
    }
  }

  // Recursive search in sceneDir as fallback
  function findRecursive(dir: string): string | null {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findRecursive(fullPath);
        if (found) return found;
      } else if (entry.name.toLowerCase() === pngName.toLowerCase()) {
        return fullPath;
      }
    }
    return null;
  }

  try {
    return findRecursive(sceneDir);
  } catch {
    return null;
  }
}

/**
 * Converts a PNG image to a hex-encoded text file and copies the files into the destination directories
 */
function convertTexture(
  srcPngPath: string,
  cleanTexName: string,
  texturesDir: string,
  rootProjectDir: string,
  convertedTextures: Set<string>
) {
  if (convertedTextures.has(cleanTexName)) {
    return;
  }

  try {
    console.log(`Converting texture: ${cleanTexName} (${srcPngPath})...`);
    const buffer = fs.readFileSync(srcPngPath);
    const hexString = buffer.toString('hex');

    // Save to Textures/files/
    if (!fs.existsSync(texturesDir)) {
      fs.mkdirSync(texturesDir, { recursive: true });
    }
    fs.writeFileSync(path.join(texturesDir, `${cleanTexName}_png.txt`), hexString, 'utf8');
    fs.writeFileSync(path.join(texturesDir, `${cleanTexName}.png`), buffer);

    // Also save to root project directory for fallback
    if (!fs.existsSync(rootProjectDir)) {
      fs.mkdirSync(rootProjectDir, { recursive: true });
    }
    fs.writeFileSync(path.join(rootProjectDir, `${cleanTexName}_png.txt`), hexString, 'utf8');
    fs.writeFileSync(path.join(rootProjectDir, `${cleanTexName}.png`), buffer);

    convertedTextures.add(cleanTexName);
    console.log(`  Saved ${cleanTexName}_png.txt (${buffer.length} bytes, hex length: ${hexString.length})`);
  } catch (err: any) {
    console.error(`Failed to convert texture ${cleanTexName}: ${err.message || err}`);
  }
}

export function parseScene(
  sceneDirInput: string,
  outputModelDirInput?: string,
  sceneTsPathInput?: string,
  outputTexturesDirInput?: string
) {
  let sceneDir = path.resolve(sceneDirInput);

  if (!fs.existsSync(sceneDir)) {
    console.error(`Error: Scene directory not found at: ${sceneDir}`);
    process.exit(1);
  }

  // If the user provided the path to transforms.json directly, use its parent directory
  if (fs.statSync(sceneDir).isFile()) {
    sceneDir = path.dirname(sceneDir);
  }

  const transformsPath = path.join(sceneDir, 'transforms.json');
  if (!fs.existsSync(transformsPath)) {
    console.error(`Error: transforms.json not found in scene directory: ${transformsPath}`);
    process.exit(1);
  }

  const outputModelDir = outputModelDirInput
    ? path.resolve(outputModelDirInput)
    : path.resolve(__dirname, '../YuuPlayground/Yuu API');

  const sceneTsPath = sceneTsPathInput
    ? path.resolve(sceneTsPathInput)
    : path.resolve(__dirname, '../YuuPlayground/Scene.ts');

  const projectRootDir = path.dirname(sceneTsPath);

  const outputTexturesDir = outputTexturesDirInput
    ? path.resolve(outputTexturesDirInput)
    : path.join(projectRootDir, 'Textures/files');

  if (!fs.existsSync(outputModelDir)) {
    fs.mkdirSync(outputModelDir, { recursive: true });
  }
  const sceneTsDir = path.dirname(sceneTsPath);
  if (!fs.existsSync(sceneTsDir)) {
    fs.mkdirSync(sceneTsDir, { recursive: true });
  }

  console.log(`Processing scene from: ${sceneDir}`);
  console.log(`Reading transforms from: ${transformsPath}`);
  const data = JSON.parse(fs.readFileSync(transformsPath, 'utf8'));

  const imports: string[] = [];
  const spawnCalls: string[] = [];
  const generatedModels = new Set<string>();
  const convertedTextures = new Set<string>();
  const usedVarNames = new Set<string>();
  let hasAnyTextures = false;

  const collections = data.collections || [];
  for (const col of collections) {
    const colName = col.name || '';
    const objects = col.objects || [];
    for (const obj of objects) {
      if (obj.type === 'MESH') {
        const objName = obj.name;
        // Map Blender name (e.g. Cube.001) to FBX name (Cube_001)
        const fbxBaseName = objName.replace(/\./g, '_');
        const cleanName = objName.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const candidateNames = Array.from(new Set([fbxBaseName, cleanName, objName]));

        const candidateDirs = [
          path.join(sceneDir, colName),
          sceneDir,
          path.join(sceneDir, 'Collection'),
          path.join(sceneDir, 'props'),
          path.join(sceneDir, 'brushes'),
        ];

        let fbxPath: string | null = null;
        for (const dir of candidateDirs) {
          for (const name of candidateNames) {
            const p = path.join(dir, `${name}.fbx`);
            if (fs.existsSync(p)) {
              fbxPath = p;
              break;
            }
          }
          if (fbxPath) break;
        }

        if (!fbxPath) {
          console.error(`Warning: FBX file not found for ${objName} in collection "${colName}"`);
          continue;
        }

        const actualFbxBaseName = path.basename(fbxPath, path.extname(fbxPath));
        const camelCaseName = toCamelCase(actualFbxBaseName);
        const pascalCaseName = toPascalCase(actualFbxBaseName);

        if (!generatedModels.has(actualFbxBaseName)) {
          console.log(`Generating model for ${actualFbxBaseName}...`);
          // Run generate-model.ts
          const cmd = `npx ts-node generate-model.ts "${fbxPath}" "${outputModelDir}"`;
          execSync(cmd, { cwd: __dirname });

          let relImportPath = path.relative(path.dirname(sceneTsPath), path.join(outputModelDir, `${camelCaseName}Model`)).replace(/\\/g, '/');
          if (!relImportPath.startsWith('.')) {
            relImportPath = './' + relImportPath;
          }

          imports.push(`import { get${pascalCaseName} } from "${relImportPath}";`);
          generatedModels.add(actualFbxBaseName);
        }

        // Coordinate space mapping
        // Location
        const lx = obj.location ? obj.location[0] : 0;
        const ly = obj.location ? obj.location[1] : 0;
        const lz = obj.location ? obj.location[2] : 0;
        const tx = lx;
        const ty = lz;
        const tz = -ly;

        // Scale
        const sx = obj.scale ? obj.scale[0] : 1;
        const sy = obj.scale ? obj.scale[1] : 1;
        const sz = obj.scale ? obj.scale[2] : 1;
        const tsx = sx;
        const tsy = sz;
        const tsz = sy;

        // Rotation
        let qb = { x: 0, y: 0, z: 0, w: 1 };
        if (obj.rotation && Array.isArray(obj.rotation.value)) {
          if (obj.rotation.mode === 'QUATERNION' || obj.rotation.value.length === 4) {
            qb = {
              w: obj.rotation.value[0],
              x: obj.rotation.value[1],
              y: obj.rotation.value[2],
              z: obj.rotation.value[3]
            };
          } else {
            const rx = obj.rotation.value[0] || 0;
            const ry = obj.rotation.value[1] || 0;
            const rz = obj.rotation.value[2] || 0;
            qb = eulerToQuaternionXYZ(rx, ry, rz);
          }
        }
        const qg = transformRotation(qb);

        // Check and convert texture if associated
        const texInfo = findTextureForObject(obj);
        let cleanTexName: string | null = null;

        if (texInfo) {
          const srcPng = resolveSourcePng(sceneDir, colName, texInfo.pngName, texInfo.pngRelPath);
          if (srcPng) {
            cleanTexName = path.basename(texInfo.pngName, path.extname(texInfo.pngName));
            convertTexture(srcPng, cleanTexName, outputTexturesDir, projectRootDir, convertedTextures);
          } else {
            console.warn(`Warning: Texture image not found for ${objName}: ${texInfo.pngName}`);
          }
        }

        if (cleanTexName) {
          hasAnyTextures = true;
          let entityVarName = toCamelCase(cleanName);
          if (!entityVarName || /^[0-9]/.test(entityVarName)) {
            entityVarName = 'entity_' + entityVarName;
          }
          if (usedVarNames.has(entityVarName)) {
            let counter = 2;
            while (usedVarNames.has(`${entityVarName}_${counter}`)) {
              counter++;
            }
            entityVarName = `${entityVarName}_${counter}`;
          }
          usedVarNames.add(entityVarName);

          spawnCalls.push(`  // Spawn ${objName}
  const ${entityVarName} = spawnModel(
    get${pascalCaseName},
    new Vector3(${tx.toFixed(6)}, ${ty.toFixed(6)}, ${tz.toFixed(6)}),
    new Vector3(${tsx.toFixed(6)}, ${tsy.toFixed(6)}, ${tsz.toFixed(6)}),
    new Quaternion(${qg.x.toFixed(6)}, ${qg.y.toFixed(6)}, ${qg.z.toFixed(6)}, ${qg.w.toFixed(6)})
  );

  applyTextureToEntity(${entityVarName}, '${cleanTexName}');`);
        } else {
          spawnCalls.push(`  // Spawn ${objName}
  spawnModel(
    get${pascalCaseName},
    new Vector3(${tx.toFixed(6)}, ${ty.toFixed(6)}, ${tz.toFixed(6)}),
    new Vector3(${tsx.toFixed(6)}, ${tsy.toFixed(6)}, ${tsz.toFixed(6)}),
    new Quaternion(${qg.x.toFixed(6)}, ${qg.y.toFixed(6)}, ${qg.z.toFixed(6)}, ${qg.w.toFixed(6)})
  );`);
        }
      }
    }
  }

  // Create Scene.ts content
  const textureImport = hasAnyTextures ? `import { applyTextureToEntity } from "./Textures/loader";\n` : '';

  const sceneTsContent = `import { Color } from "./Yuu API/Basic Types/Color";
import { Quaternion } from "./Yuu API/Basic Types/Quaternion";
import { Vector3 } from "./Yuu API/Basic Types/Vector3";
import { Vector2 } from "./Yuu API/Basic Types/Vector2";
import { Entity } from "./Yuu API/Entity";
${textureImport}${imports.join('\n')}

export const scene = {
  spawnScene,
}

function spawnModel(
  getMesh: () => [Vector3[], Vector2[], number[]],
  pos: Vector3,
  scale: Vector3,
  rot: Quaternion,
  color: Color = new Color(1, 1, 1),
  alphaTransparency: number = 1,
  hasCollider: boolean = true,
  type: BaseNodeTypes = 'Static',
  parent: Entity | undefined = undefined
): Entity {
  const entity = new Entity(pos, rot, Vector3.one, parent, type);
  entity.mesh.create(...getMesh());
  entity.mesh.color.set(color, Math.min(1, alphaTransparency));
  if (hasCollider && entity.mesh.nodeID) {
    entity.collider.createFromMeshNode(entity.mesh.nodeID, 'Concave');
  }
  entity.scale = scale;
  return entity;
}

export async function spawnScene() {
${spawnCalls.join('\n\n')}
}

const chamberShader = \`
shader_type spatial;
render_mode cull_disabled;

uniform vec4 wall_color : source_color = vec4(0.8, 0.8, 0.8, 1.0);

void fragment() {
    ALBEDO = wall_color.rgb;
}
\`;
`;

  fs.writeFileSync(sceneTsPath, sceneTsContent, 'utf8');
  console.log(`Successfully generated Scene.ts at: ${sceneTsPath}`);
  console.log(`Converted ${convertedTextures.size} unique textures into ${outputTexturesDir} and ${projectRootDir}`);
}

function main() {
  const sceneDirArg = process.argv[2];
  if (!sceneDirArg) {
    console.error('Usage: ts-node parse-scene.ts <path-to-exported-scene-directory> [output-model-directory] [scene-ts-path] [output-textures-dir]');
    process.exit(1);
  }

  parseScene(sceneDirArg, process.argv[3], process.argv[4], process.argv[5]);
}

if (require.main === module) {
  main();
}
