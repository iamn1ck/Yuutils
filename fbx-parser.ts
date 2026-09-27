import { inflateSync } from './zlib';

export type FBXProperty = boolean | number | bigint | boolean[] | number[] | bigint[] | string;

export interface FBXNode {
  name: string;
  props: FBXProperty[];
  nodes: FBXNode[];
}

export class BinaryReader {
  public offset: number = 0;
  public binary: Uint8Array;

  constructor(binary: Uint8Array) {
    this.binary = binary;
  }

  readUint8(): number {
    return this.binary[this.offset++];
  }

  readUint8AsString(): string {
    return String.fromCharCode(this.binary[this.offset++]);
  }

  readUint8AsBool(): boolean {
    return this.binary[this.offset++] !== 0;
  }

  readUint16(): number {
    const v = new DataView(this.binary.buffer, this.binary.byteOffset + this.offset, 2).getUint16(0, true);
    this.offset += 2;
    return v;
  }

  readUint32(): number {
    const v = new DataView(this.binary.buffer, this.binary.byteOffset + this.offset, 4).getUint32(0, true);
    this.offset += 4;
    return v;
  }

  readUint64(): bigint {
    const v = new DataView(this.binary.buffer, this.binary.byteOffset + this.offset, 8).getBigUint64(0, true);
    this.offset += 8;
    return v;
  }

  readInt8(): number {
    const v = new DataView(this.binary.buffer, this.binary.byteOffset + this.offset, 1).getInt8(0);
    this.offset += 1;
    return v;
  }

  readInt16(): number {
    const v = new DataView(this.binary.buffer, this.binary.byteOffset + this.offset, 2).getInt16(0, true);
    this.offset += 2;
    return v;
  }

  readInt32(): number {
    const v = new DataView(this.binary.buffer, this.binary.byteOffset + this.offset, 4).getInt32(0, true);
    this.offset += 4;
    return v;
  }

  readInt64(): bigint {
    const v = new DataView(this.binary.buffer, this.binary.byteOffset + this.offset, 8).getBigInt64(0, true);
    this.offset += 8;
    return v;
  }

  readFloat32(): number {
    const v = new DataView(this.binary.buffer, this.binary.byteOffset + this.offset, 4).getFloat32(0, true);
    this.offset += 4;
    return v;
  }

  readFloat64(): number {
    const v = new DataView(this.binary.buffer, this.binary.byteOffset + this.offset, 8).getFloat64(0, true);
    this.offset += 8;
    return v;
  }

  readUint8Array(length: number): Uint8Array {
    return this.binary.subarray(this.offset, (this.offset += length));
  }

  readArrayAsString(length: number): string {
    const sub = this.binary.subarray(this.offset, (this.offset += length));
    let str = '';
    for (let i = 0; i < sub.length; i++) {
      str += String.fromCharCode(sub[i]);
    }
    return str;
  }
}

const MAGIC = Uint8Array.from('Kaydara FBX Binary\x20\x20\x00\x1a\x00'.split(''), v => v.charCodeAt(0));

export function parseBinary(binary: Uint8Array): FBXNode[] {
  if (binary.length < MAGIC.length) {
    throw new Error('Not a binary FBX file');
  }
  const data = new BinaryReader(binary);
  const magic = data.readUint8Array(MAGIC.length).every((v, i) => v === MAGIC[i]);
  if (!magic) {
    throw new Error('Not a binary FBX file');
  }
  const fbxVersion = data.readUint32();
  const header64 = fbxVersion >= 7500;
  const fbx: FBXNode[] = [];
  while (true) {
    const subnode = readNode(data, header64);
    if (subnode === null) break;
    fbx.push(subnode);
  }
  return fbx;
}

function readNode(data: BinaryReader, header64: boolean): FBXNode | null {
  const endOffset = header64 ? Number(data.readUint64()) : data.readUint32();
  if (endOffset === 0) return null;
  const numProperties = header64 ? Number(data.readUint64()) : data.readUint32();
  const propertyListLen = header64 ? Number(data.readUint64()) : data.readUint32();
  const nameLen = data.readUint8();
  const name = data.readArrayAsString(nameLen);
  const node: FBXNode = {
    name: name,
    props: [],
    nodes: [],
  };

  for (let i = 0; i < numProperties; ++i) {
    node.props.push(readProperty(data));
  }

  while (endOffset - data.offset > 13) {
    const subnode = readNode(data, header64);
    if (subnode !== null) {
      node.nodes.push(subnode);
    }
  }
  data.offset = endOffset;
  return node;
}

function readProperty(data: BinaryReader): FBXProperty {
  const typeCode = data.readUint8AsString();
  const read: Record<string, () => any> = {
    Y: () => data.readInt16(),
    C: () => data.readUint8AsBool(),
    I: () => data.readInt32(),
    F: () => data.readFloat32(),
    D: () => data.readFloat64(),
    L: () => data.readInt64(),
    f: () => readPropertyArray(data, r => r.readFloat32()),
    d: () => readPropertyArray(data, r => r.readFloat64()),
    l: () => readPropertyArray(data, r => r.readInt64()),
    i: () => readPropertyArray(data, r => r.readInt32()),
    b: () => readPropertyArray(data, r => r.readUint8AsBool()),
    S: () => data.readArrayAsString(data.readUint32()),
    R: () => Array.from(data.readUint8Array(data.readUint32())),
  };

  if (typeof read[typeCode] === 'undefined') {
    throw new Error("Unknown Property Type " + typeCode.charCodeAt(0));
  }
  let value = read[typeCode]();

  const convertBigInt = (v: bigint): number | bigint => {
    if (v < BigInt(Number.MIN_SAFE_INTEGER) || v > BigInt(Number.MAX_SAFE_INTEGER)) {
      return v;
    }
    return Number(v);
  };

  if (typeCode === 'L') {
    value = convertBigInt(value);
  } else if (typeCode === 'l') {
    for (let i = 0; i < value.length; ++i) {
      value[i] = convertBigInt(value[i]);
    }
  }

  if (typeCode === 'S' && typeof value === 'string' && value.indexOf('\x00\x01') !== -1) {
    value = value.split('\x00\x01').reverse().join('::');
  }
  return value;
}

function readPropertyArray(data: BinaryReader, reader: (r: BinaryReader) => any): any[] {
  const arrayLength = data.readUint32();
  const encoding = data.readUint32();
  const compressedLength = data.readUint32();
  let arrayData = new BinaryReader(data.readUint8Array(compressedLength));
  if (encoding === 1) {
    const inflated = inflateSync(arrayData.binary);
    arrayData = new BinaryReader(new Uint8Array(inflated.buffer, inflated.byteOffset, inflated.byteLength));
  }
  const value = [];
  for (let i = 0; i < arrayLength; ++i) {
    value.push(reader(arrayData));
  }
  return value;
}

export function parseText(ascii: string): FBXNode[] {
  const lines = ascii.split('\n');
  const rootNode: FBXNode = {
    name: '',
    props: [],
    nodes: [],
  };
  let currentNode = rootNode;
  const path: FBXNode[] = [currentNode];
  let state = 0; // 0 = expectingNodeOrClose, 1 = expectingPropertyListContinuation

  for (let line of lines) {
    line = line.trim();
    if (line.length === 0) continue;
    if (line[0] === ';') continue;

    if (state === 0) {
      if (line[0] === '}') {
        if (path.length === 1) {
          throw new Error('FBX syntax error');
        }
        path.pop();
        currentNode = path[path.length - 1];
      } else {
        const firstCol = line.indexOf(':');
        const nodeName = line.substring(0, firstCol).trim();
        const expectingSubnodes = line[line.length - 1] === '{';
        const propertyString = line.substring(firstCol + 1, line.length - (expectingSubnodes ? 1 : 0));
        const propertyStringList = propertyString.split(',');
        const properties: FBXProperty[] = [];
        for (const propertyStringItem of propertyStringList) {
          const trimmed = propertyStringItem.trim();
          if (trimmed === '') continue;
          const value = convertProperty(trimmed);
          if (typeof value === 'undefined') continue;
          properties.push(value);
        }
        if (propertyStringList[propertyStringList.length - 1] === '') {
          state = 1;
        }
        const newNode: FBXNode = {
          name: nodeName,
          props: properties,
          nodes: [],
        };
        currentNode.nodes.push(newNode);
        if (expectingSubnodes || state === 1) {
          path.push(newNode);
          currentNode = newNode;
        }
      }
    } else if (state === 1) {
      const expectingSubnodes = line[line.length - 1] === '{';
      const propertyString = line.substring(0, line.length - (expectingSubnodes ? 1 : 0));
      const propertyStringList = propertyString.split(',');
      const properties: FBXProperty[] = [];
      for (const propertyStringItem of propertyStringList) {
        const trimmed = propertyStringItem.trim();
        if (trimmed === '' || trimmed === '}') continue;
        const value = convertProperty(trimmed);
        if (typeof value === 'undefined') continue;
        properties.push(value);
      }
      currentNode.props = currentNode.props.concat(properties);
      if (propertyStringList[propertyStringList.length - 1] !== '') {
        state = 0;
      }
      if (!expectingSubnodes && state === 0) {
        path.pop();
        currentNode = path[path.length - 1];
      }
    }
  }

  function correctArrays(node: FBXNode) {
    if (node.nodes.length === 1 && node.props.length === 0 && node.nodes[0].name === 'a') {
      node.props = [node.nodes[0].props as FBXProperty];
      node.nodes = [];
    } else {
      for (const childNode of node.nodes) {
        correctArrays(childNode);
      }
    }
  }
  correctArrays(rootNode);
  return rootNode.nodes;
}

function convertProperty(prop: string): FBXProperty | undefined {
  if (prop[0] === '*') return undefined;
  if (prop[0] === '"') return prop.substring(1, prop.length - 1);
  if (prop === 'T') return true;
  if (prop === 'F') return false;
  if (prop === 'Y') return true;
  if (prop === 'N') return false;
  if (prop.indexOf('.') !== -1) return parseFloat(prop);
  try {
    const n = BigInt(prop);
    if (n < BigInt(Number.MIN_SAFE_INTEGER) || n > BigInt(Number.MAX_SAFE_INTEGER)) {
      return n;
    }
    return Number(n);
  } catch {
    return parseFloat(prop);
  }
}

export class FBXReaderNode {
  public fbxNode: FBXNode;

  constructor(fbxNode: FBXNode) {
    this.fbxNode = fbxNode;
  }

  private nodeFilter(a: string | Record<number, any>, b?: Record<number, any>): (node: FBXNode) => boolean {
    let name: string | undefined = undefined;
    let propFilter: Record<number, any> | undefined = undefined;

    if (typeof a === 'string') {
      name = a;
      if (typeof b !== 'undefined') propFilter = b;
    } else {
      propFilter = a;
    }

    let filter: (node: FBXNode) => boolean;

    if (typeof propFilter !== 'undefined') {
      const actualPropFilter = propFilter;
      const propFilterFunc = (node: FBXNode) => {
        for (const prop in actualPropFilter) {
          const index = parseInt(prop, 10);
          if (node.props[index] !== actualPropFilter[index]) return false;
        }
        return true;
      };

      if (typeof name !== 'undefined') {
        const actualName = name;
        filter = (node: FBXNode) => node.name === actualName && propFilterFunc(node);
      } else {
        filter = propFilterFunc;
      }
    } else {
      const actualName = name;
      filter = (node: FBXNode) => node.name === actualName;
    }

    return filter;
  }

  node(a: string | Record<number, any>, b?: Record<number, any>): FBXReaderNode | undefined {
    const node = this.fbxNode.nodes.find(this.nodeFilter(a, b));
    if (typeof node === 'undefined') return undefined;
    return new FBXReaderNode(node);
  }

  nodes(a: string | Record<number, any>, b?: Record<number, any>): FBXReaderNode[] {
    return this.fbxNode.nodes
      .filter(this.nodeFilter(a, b))
      .map(node => new FBXReaderNode(node));
  }

  prop(index: number): FBXProperty | undefined;
  prop(index: number, type: 'boolean'): boolean | undefined;
  prop(index: number, type: 'number'): number | undefined;
  prop(index: number, type: 'bigint'): bigint | undefined;
  prop(index: number, type: 'string'): string | undefined;
  prop(index: number, type: 'boolean[]'): boolean[] | undefined;
  prop(index: number, type: 'number[]'): number[] | undefined;
  prop(index: number, type: 'bigint[]'): bigint[] | undefined;
  prop(index: number, type?: string): any {
    const prop = this.fbxNode.props[index];
    if (typeof type === 'undefined') return prop;
    if (type === 'boolean') return typeof prop === 'boolean' ? prop : undefined;
    if (type === 'number') return typeof prop === 'number' ? prop : undefined;
    if (type === 'bigint') return typeof prop === 'bigint' ? prop : undefined;
    if (type === 'string') return typeof prop === 'string' ? prop : undefined;

    if (!Array.isArray(prop)) return undefined;
    if (prop.length === 0) return prop;
    if (type === 'boolean[]') return typeof prop[0] === 'boolean' ? prop : undefined;
    if (type === 'number[]') return typeof prop[0] === 'number' ? prop : undefined;
    if (type === 'bigint[]') return typeof prop[0] === 'bigint' ? prop : undefined;
    return undefined;
  }
}

export class FBXReader extends FBXReaderNode {
  public fbx: FBXNode[];

  constructor(fbx: FBXNode[]) {
    const rootNode: FBXNode = {
      name: '',
      props: [],
      nodes: fbx,
    };
    super(rootNode);
    this.fbx = fbx;
  }
}
