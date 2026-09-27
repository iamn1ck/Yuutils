import * as fs from 'fs';
import * as path from 'path';
import { parseBinary, FBXReader, FBXNode } from './fbx-parser';

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
  
  console.log('Geometry name:', geometryNode.fbxNode.props);
  
  const vertices = geometryNode.node('Vertices')?.fbxNode.props[0] as number[];
  const polygonIndex = geometryNode.node('PolygonVertexIndex')?.fbxNode.props[0] as number[];
  
  console.log('Vertices length:', vertices?.length);
  console.log('Vertices (first 15):', vertices?.slice(0, 15));
  
  console.log('PolygonVertexIndex length:', polygonIndex?.length);
  console.log('PolygonVertexIndex (first 15):', polygonIndex?.slice(0, 15));
  
  const uvNode = geometryNode.node('LayerElementUV');
  if (uvNode) {
    const mappingType = uvNode.node('MappingInformationType')?.fbxNode.props[0];
    const referenceType = uvNode.node('ReferenceInformationType')?.fbxNode.props[0];
    const uv = uvNode.node('UV')?.fbxNode.props[0] as number[];
    const uvIndex = uvNode.node('UVIndex')?.fbxNode.props[0] as number[];
    
    console.log('UV mapping type:', mappingType);
    console.log('UV reference type:', referenceType);
    console.log('UV length:', uv?.length);
    console.log('UV (first 10):', uv?.slice(0, 10));
    console.log('UVIndex length:', uvIndex?.length);
    console.log('UVIndex (first 15):', uvIndex?.slice(0, 15));
  } else {
    console.log('No LayerElementUV found!');
  }
}

main();
