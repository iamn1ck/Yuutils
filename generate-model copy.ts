import * as fs from 'fs';
import * as path from 'path';
import { parseBinary, FBXReader } from './fbx-parser';

function main() {
  const fbxPath = path.join(__dirname, 'rainbow-wave-loop2.fbx');
  const buffer = fs.readFileSync(fbxPath);
  const nodes = parseBinary(buffer);
  
  const reader = new FBXReader(nodes);
  const geometryNode = reader.node('Objects')?.node('Geometry');
  
  if (!geometryNode) {
    console.error('Could not find Geometry node!');
    return;
  }
  
  const vertices = geometryNode.node('Vertices')?.fbxNode.props[0] as number[];
  const polygonIndex = geometryNode.node('PolygonVertexIndex')?.fbxNode.props[0] as number[];
  
  const uvNode = geometryNode.node('LayerElementUV');
  if (!uvNode) {
    console.error('No LayerElementUV found!');
    return;
  }
  
  const uv = uvNode.node('UV')?.fbxNode.props[0] as number[];
  const uvIndex = uvNode.node('UVIndex')?.fbxNode.props[0] as number[];
  
  const keyMap = new Map<string, number>();
  const outVertsRaw: number[] = [];
  const outUvs: number[] = [];
  const outTriangles: number[] = [];
  
  let currentPoly: { vertIdx: number; uvIdx: number }[] = [];
  
  for (let j = 0; j < polygonIndex.length; j++) {
    const val = polygonIndex[j];
    const isLast = val < 0;
    const vertIdx = isLast ? ~val : val;
    const uvIdx = uvIndex[j];
    
    currentPoly.push({ vertIdx, uvIdx });
    
    if (isLast) {
      const resolvedIndices: number[] = [];
      for (const p of currentPoly) {
        const key = `${p.vertIdx},${p.uvIdx}`;
        if (!keyMap.has(key)) {
          const newIdx = keyMap.size;
          keyMap.set(key, newIdx);
          
          const vx = vertices[p.vertIdx * 3];
          const vy = vertices[p.vertIdx * 3 + 1];
          const vz = vertices[p.vertIdx * 3 + 2];
          
          const u = uv[p.uvIdx * 2];
          const v = uv[p.uvIdx * 2 + 1];
          
          outVertsRaw.push(vx, vy, vz);
          outUvs.push(u, v);
          resolvedIndices.push(newIdx);
        } else {
          resolvedIndices.push(keyMap.get(key)!);
        }
      }
      
      // Triangulate
      const N = resolvedIndices.length;
      for (let i = 1; i < N - 1; i++) {
        outTriangles.push(
          resolvedIndices[0],
          resolvedIndices[i + 1],
          resolvedIndices[i]
        );
      }
      
      currentPoly = [];
    }
  }
  
  // Calculate Y-up rotated and centered coordinates
  // Rotation of -90 around X:
  // newX = x
  // newY = z
  // newZ = -y
  const rotatedVerts: number[] = [];
  for (let i = 0; i < outVertsRaw.length; i += 3) {
    const x = outVertsRaw[i];
    const y = outVertsRaw[i + 1];
    const z = outVertsRaw[i + 2];
    rotatedVerts.push(x, z, -y);
  }
  
  // Find bounds of rotated vertices to center them
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (let i = 0; i < rotatedVerts.length; i += 3) {
    const x = rotatedVerts[i];
    const y = rotatedVerts[i + 1];
    const z = rotatedVerts[i + 2];
    
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  
  const outVertsCentered: number[] = [];
  for (let i = 0; i < rotatedVerts.length; i += 3) {
    outVertsCentered.push(
      rotatedVerts[i] - centerX,
      rotatedVerts[i + 1] - centerY,
      rotatedVerts[i + 2] - centerZ
    );
  }
  
  console.log(`Reconstructed model summary:`);
  console.log(`- Original vertices (unique positions): ${vertices.length / 3}`);
  console.log(`- Reconstructed vertices (vertex+uv pairs): ${outVertsRaw.length / 3}`);
  console.log(`- Reconstructed triangles: ${outTriangles.length / 3}`);
  console.log(`- Triangle indices count: ${outTriangles.length}`);
  
  // Write the TS file
  const tsContent = `import { Vector2 } from "./Basic Types/Vector2";
import { Vector3 } from "./Basic Types/Vector3";

// Raw vertex positions from FBX
const rawVerts = [
  ${outVertsRaw.map(v => v.toFixed(6)).join(',\n  ')}
];

// Transformed vertex positions (Rotated -90deg on X to be Y-up, and centered at origin)
const transformedVerts = [
  ${outVertsCentered.map(v => v.toFixed(6)).join(',\n  ')}
];

// Raw UV coordinates (flat array: u, v)
const rawUvs = [
  ${outUvs.map(u => u.toFixed(6)).join(',\n  ')}
];

// Triangle indices
const triangles = [
  ${outTriangles.join(',\n  ')}
];

let cachedModel: [Vector3[], Vector2[], number[]] | undefined;
let cachedRawModel: [Vector3[], Vector2[], number[]] | undefined;

/**
 * Returns the parsed model data [Vector3[], Vector2[], number[]]
 * rotated to be Y-up and centered at the origin.
 */
export function getRainbowWaveLoop2(): [Vector3[], Vector2[], number[]] {
  if (!cachedModel) {
    const verts: Vector3[] = [];
    for (let i = 0; i < transformedVerts.length; i += 3) {
      verts.push(new Vector3(transformedVerts[i], transformedVerts[i + 1], transformedVerts[i + 2]));
    }
    
    const uvs: Vector2[] = [];
    for (let i = 0; i < rawUvs.length; i += 2) {
      uvs.push(new Vector2(rawUvs[i], rawUvs[i + 1]));
    }
    
    cachedModel = [verts, uvs, triangles];
  }
  return cachedModel;
}

/**
 * Returns the raw parsed model data [Vector3[], Vector2[], number[]]
 * as stored originally in the FBX file.
 */
export function getRainbowWaveLoop2Raw(): [Vector3[], Vector2[], number[]] {
  if (!cachedRawModel) {
    const verts: Vector3[] = [];
    for (let i = 0; i < rawVerts.length; i += 3) {
      verts.push(new Vector3(rawVerts[i], rawVerts[i + 1], rawVerts[i + 2]));
    }
    
    const uvs: Vector2[] = [];
    for (let i = 0; i < rawUvs.length; i += 2) {
      uvs.push(new Vector2(rawUvs[i], rawUvs[i + 1]));
    }
    
    cachedRawModel = [verts, uvs, triangles];
  }
  return cachedRawModel;
}
`;

  const outputPath = '~/dev/yu2/YuuPlayground/Yuu API/rainbowWaveLoop2Model.ts';
  fs.writeFileSync(outputPath, tsContent);
  console.log(`Successfully generated model file: ${outputPath}`);
}

main();
