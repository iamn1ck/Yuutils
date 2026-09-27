import * as fs from 'fs';
import * as path from 'path';
import { parseBinary, FBXNode } from './fbx-parser';

function formatProperties(properties: any[]): string {
  if (properties.length === 0) return '';
  const serialized = properties.map(p => {
    if (typeof p === 'object' && p !== null) {
      if (Array.isArray(p)) {
        return `Array(${p.length})`;
      }
      return JSON.stringify(p);
    }
    return String(p);
  }).join(', ');
  return ` [${serialized.length > 60 ? serialized.substring(0, 57) + '...' : serialized}]`;
}

function printNodeTree(node: FBXNode, depth: number = 0, maxDepth: number = 4) {
  const indent = '  '.repeat(depth);
  const props = formatProperties(node.props);
  const childrenInfo = node.nodes && node.nodes.length > 0 ? ` (${node.nodes.length} children)` : '';
  
  console.log(`${indent}- ${node.name}${props}${childrenInfo}`);
  
  if (depth < maxDepth && node.nodes) {
    for (const child of node.nodes) {
      printNodeTree(child, depth + 1, maxDepth);
    }
  } else if (node.nodes && node.nodes.length > 0) {
    console.log(`${indent}  ... (${node.nodes.length} child nodes omitted at depth ${depth + 1})`);
  }
}

function main() {
  const fbxPath = path.join(__dirname, 'door.fbx');
  console.log(`Reading FBX file: ${fbxPath}`);
  
  try {
    const buffer = fs.readFileSync(fbxPath);
    console.log(`Successfully read file of size ${buffer.length} bytes.`);
    
    console.log('Parsing binary FBX data...');
    const nodes = parseBinary(buffer);
    console.log(`Successfully parsed FBX file. Total root nodes: ${nodes.length}\n`);
    
    console.log('=== Node Tree Hierarchy (first 4 levels) ===');
    for (const node of nodes) {
      printNodeTree(node, 0, 4);
    }
    
  } catch (error) {
    console.error('An error occurred during FBX parsing:', error);
    process.exit(1);
  }
}

main();
