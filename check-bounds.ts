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
    return;
  }
  
  const vertices = geometryNode.node('Vertices')?.fbxNode.props[0] as number[];
  
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i+1];
    const z = vertices[i+2];
    
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  
  console.log('Original vertices bounds:');
  console.log(`X: [${minX}, ${maxX}] (delta: ${maxX - minX})`);
  console.log(`Y: [${minY}, ${maxY}] (delta: ${maxY - minY})`);
  console.log(`Z: [${minZ}, ${maxZ}] (delta: ${maxZ - minZ})`);
  
  // Let's also check if there is an animation node or any anim data.
  const animStack = reader.node('Objects')?.node('AnimationStack');
  console.log('AnimationStack exists:', !!animStack);
  if (animStack) {
    console.log('AnimationStack props:', animStack.fbxNode.props);
  }
}

main();
