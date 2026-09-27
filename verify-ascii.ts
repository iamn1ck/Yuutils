import * as fs from 'fs';
import * as path from 'path';
import { parseText } from './fbx-parser';

function main() {
  const asciiPath = path.resolve(__dirname, '../YuuPlayground/door.fbx.ascii');
  console.log(`Reading ASCII FBX: ${asciiPath}`);
  const asciiContent = fs.readFileSync(asciiPath, 'utf-8');

  console.log(`Parsing ASCII FBX...`);
  try {
    const nodes = parseText(asciiContent);
    console.log(`Successfully parsed ASCII FBX. Total root nodes: ${nodes.length}`);
    const geomNode = nodes.find(n => n.name === 'Objects')?.nodes.find(n => n.name === 'Geometry');
    if (geomNode) {
      console.log('Geometry properties:', geomNode.props);
      const verts = geomNode.nodes.find(n => n.name === 'Vertices')?.props[0];
      const indices = geomNode.nodes.find(n => n.name === 'PolygonVertexIndex')?.props[0];
      console.log('Vertices array length:', Array.isArray(verts) ? verts.length : typeof verts);
      console.log('Indices array length:', Array.isArray(indices) ? indices.length : typeof indices);
    } else {
      console.log('Warning: Geometry node not found!');
    }
  } catch (err) {
    console.error(`Failed to parse ASCII FBX:`, err);
  }
}

main();
