import * as fs from 'fs';
import * as path from 'path';
import { parseBinary, FBXNode, FBXProperty } from './fbx-parser';

function formatProperties(props: FBXProperty[]): string {
  return props.map(p => {
    if (typeof p === 'string') {
      return `"${p}"`;
    } else if (typeof p === 'boolean') {
      return p ? 'T' : 'F';
    } else {
      return String(p);
    }
  }).join(', ');
}

function formatArray(arr: any[], indent: string): string {
  const formattedElements = arr.map(p => {
    if (typeof p === 'string') {
      return `"${p}"`;
    } else if (typeof p === 'boolean') {
      return p ? 'T' : 'F';
    } else {
      return String(p);
    }
  });

  const chunkSize = 100;
  const lines: string[] = [];
  for (let i = 0; i < formattedElements.length; i += chunkSize) {
    const chunk = formattedElements.slice(i, i + chunkSize);
    lines.push(chunk.join(', '));
  }
  return lines.join(',\n' + indent);
}

function serializeNode(node: FBXNode, indent: string = ''): string {
  let result = '';
  const hasArrayProp = node.props.some(p => Array.isArray(p));

  if (hasArrayProp) {
    const arrayProps = node.props.filter(p => Array.isArray(p)) as any[][];
    const nonArrayProps = node.props.filter(p => !Array.isArray(p));

    const propsStr = formatProperties(nonArrayProps);
    result += `${indent}${node.name}:${propsStr ? ' ' + propsStr : ''} {\n`;

    for (const arr of arrayProps) {
      result += `${indent}  a: ${formatArray(arr, indent + '  ')}\n`;
    }

    for (const child of node.nodes) {
      result += serializeNode(child, indent + '  ');
    }

    result += `${indent}}\n`;
  } else {
    const propsStr = formatProperties(node.props);
    const hasChildren = node.nodes.length > 0;

    if (hasChildren) {
      result += `${indent}${node.name}:${propsStr ? ' ' + propsStr : ''} {\n`;
      for (const child of node.nodes) {
        result += serializeNode(child, indent + '  ');
      }
      result += `${indent}}\n`;
    } else {
      result += `${indent}${node.name}:${propsStr ? ' ' + propsStr : ''}\n`;
    }
  }
  return result;
}

function main() {
  const fbxPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../YuuPlayground/door.fbx');
  const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : fbxPath;

  console.log(`Reading binary FBX: ${fbxPath}`);
  const buffer = fs.readFileSync(fbxPath);
  console.log(`Parsing binary FBX...`);
  const nodes = parseBinary(buffer);

  console.log(`Serializing to ASCII FBX...`);
  let asciiContent = '';
  for (const node of nodes) {
    asciiContent += serializeNode(node);
  }

  console.log(`Writing ASCII FBX: ${outputPath}`);
  fs.writeFileSync(outputPath, asciiContent);
  console.log(`Done!`);
}

main();
