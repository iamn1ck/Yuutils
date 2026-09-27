class BitReader {
  private arr: Uint8Array;
  private bytePos: number = 0;
  private bitBuf: number = 0;
  private bitLen: number = 0;

  constructor(arr: Uint8Array) {
    this.arr = arr;
  }

  readBits(n: number): number {
    while (this.bitLen < n) {
      if (this.bytePos >= this.arr.length) {
        throw new Error('Unexpected EOF in compressed stream');
      }
      this.bitBuf |= this.arr[this.bytePos++] << this.bitLen;
      this.bitLen += 8;
    }
    const val = this.bitBuf & ((1 << n) - 1);
    this.bitBuf >>>= n;
    this.bitLen -= n;
    return val;
  }

  align(): void {
    this.bitBuf = 0;
    this.bitLen = 0;
  }
}

class HuffmanDecoder {
  private tree: Int32Array;

  constructor(codeLengths: number[]) {
    this.tree = new Int32Array(2048);
    this.tree.fill(-1);

    const maxLen = Math.max(...codeLengths);
    const bl_count = new Array(maxLen + 1).fill(0);
    for (const len of codeLengths) {
      if (len > 0) bl_count[len]++;
    }

    const next_code = new Array(maxLen + 1).fill(0);
    let code = 0;
    for (let bits = 1; bits <= maxLen; bits++) {
      code = (code + bl_count[bits - 1]) << 1;
      next_code[bits] = code;
    }

    let nextNode = 2; // Node index starts at 2 to avoid collision with -1 (unallocated)

    for (let sym = 0; sym < codeLengths.length; sym++) {
      const len = codeLengths[sym];
      if (len === 0) continue;

      let c = next_code[len];
      next_code[len]++;

      let nodeIdx = 0;
      for (let bit = len - 1; bit >= 0; bit--) {
        const branch = (c >>> bit) & 1;
        const offset = nodeIdx * 2 + branch;

        if (bit === 0) {
          this.tree[offset] = sym;
        } else {
          if (this.tree[offset] === -1) {
            this.tree[offset] = -nextNode;
            nextNode++;
            if (nextNode * 2 >= this.tree.length) {
              const newTree = new Int32Array(this.tree.length * 2);
              newTree.set(this.tree);
              newTree.subarray(this.tree.length).fill(-1);
              this.tree = newTree;
            }
          }
          nodeIdx = -this.tree[offset];
        }
      }
    }
  }

  decode(reader: BitReader): number {
    let nodeIdx = 0;
    while (true) {
      const bit = reader.readBits(1);
      const val = this.tree[nodeIdx * 2 + bit];
      if (val === -1) {
        throw new Error('Invalid Huffman code');
      }
      if (val >= 0) {
        return val;
      }
      nodeIdx = -val;
    }
  }
}

class OutputBuffer {
  public data: Uint8Array;
  public length: number = 0;

  constructor(initialCapacity: number = 16384) {
    this.data = new Uint8Array(initialCapacity);
  }

  write(byte: number): void {
    if (this.length >= this.data.length) {
      this.resize(this.data.length * 2);
    }
    this.data[this.length++] = byte;
  }

  writeCopy(distance: number, length: number): void {
    const start = this.length - distance;
    if (start < 0) {
      throw new Error(`Invalid distance in repeat code: ${distance} (current length: ${this.length})`);
    }
    if (this.length + length > this.data.length) {
      this.resize(Math.max(this.data.length * 2, this.length + length));
    }
    for (let i = 0; i < length; i++) {
      this.data[this.length + i] = this.data[start + i];
    }
    this.length += length;
  }

  private resize(newCapacity: number): void {
    const newData = new Uint8Array(newCapacity);
    newData.set(this.data.subarray(0, this.length));
    this.data = newData;
  }
}

const lengthBases = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258
];
const lengthExtraBits = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
  3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
];
const distBases = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577
];
const distExtraBits = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
  7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
];

let fixedLitLenDecoder: HuffmanDecoder | null = null;
let fixedDistDecoder: HuffmanDecoder | null = null;

function getFixedLitLenDecoder(): HuffmanDecoder {
  if (!fixedLitLenDecoder) {
    const depths = new Array(288);
    for (let i = 0; i <= 143; i++) depths[i] = 8;
    for (let i = 144; i <= 255; i++) depths[i] = 9;
    for (let i = 256; i <= 279; i++) depths[i] = 7;
    for (let i = 280; i <= 287; i++) depths[i] = 8;
    fixedLitLenDecoder = new HuffmanDecoder(depths);
  }
  return fixedLitLenDecoder;
}

function getFixedDistDecoder(): HuffmanDecoder {
  if (!fixedDistDecoder) {
    const depths = new Array(32).fill(5);
    fixedDistDecoder = new HuffmanDecoder(depths);
  }
  return fixedDistDecoder;
}

export function inflateSync(compressed: Uint8Array): Uint8Array {
  if (compressed.length < 6) {
    throw new Error('Compressed data too short');
  }

  const cmf = compressed[0];
  const flg = compressed[1];

  const method = cmf & 0x0f;
  if (method !== 8) {
    throw new Error(`Unsupported compression method: ${method}`);
  }

  if ((cmf * 256 + flg) % 31 !== 0) {
    throw new Error('Header checksum verification failed');
  }

  if (flg & 0x20) {
    throw new Error('Preset dictionary is not supported');
  }

  const reader = new BitReader(compressed.subarray(2));
  const out = new OutputBuffer(16384);

  let isFinal = false;
  while (!isFinal) {
    isFinal = reader.readBits(1) === 1;
    const blockType = reader.readBits(2);

    if (blockType === 0) {
      reader.align();
      const len = reader.readBits(16);
      const nlen = reader.readBits(16);
      if (len !== (~nlen & 0xffff)) {
        throw new Error('Stored block length check failed');
      }
      for (let i = 0; i < len; i++) {
        out.write(reader.readBits(8));
      }
    } else if (blockType === 1 || blockType === 2) {
      let litLenDecoder: HuffmanDecoder;
      let distDecoder: HuffmanDecoder;

      if (blockType === 1) {
        litLenDecoder = getFixedLitLenDecoder();
        distDecoder = getFixedDistDecoder();
      } else {
        const hlit = reader.readBits(5);
        const hdist = reader.readBits(5);
        const hclen = reader.readBits(4);

        const codeLengthOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
        const codeLengthDepths = new Array(19).fill(0);
        for (let i = 0; i < hclen + 4; i++) {
          codeLengthDepths[codeLengthOrder[i]] = reader.readBits(3);
        }

        const codeLengthDecoder = new HuffmanDecoder(codeLengthDepths);

        const numLitLenCodes = hlit + 257;
        const numDistCodes = hdist + 1;
        const totalCodes = numLitLenCodes + numDistCodes;

        const lengths = new Array(totalCodes).fill(0);
        let i = 0;
        while (i < totalCodes) {
          const sym = codeLengthDecoder.decode(reader);
          if (sym >= 0 && sym <= 15) {
            lengths[i++] = sym;
          } else if (sym === 16) {
            if (i === 0) throw new Error('No prev code length');
            const count = 3 + reader.readBits(2);
            const prev = lengths[i - 1];
            if (i + count > totalCodes) throw new Error('Length list overflow');
            lengths.fill(prev, i, i + count);
            i += count;
          } else if (sym === 17) {
            const count = 3 + reader.readBits(3);
            if (i + count > totalCodes) throw new Error('Length list overflow');
            lengths.fill(0, i, i + count);
            i += count;
          } else if (sym === 18) {
            const count = 11 + reader.readBits(7);
            if (i + count > totalCodes) throw new Error('Length list overflow');
            lengths.fill(0, i, i + count);
            i += count;
          }
        }

        const litLenLengths = lengths.slice(0, numLitLenCodes);
        const distLengths = lengths.slice(numLitLenCodes);

        litLenDecoder = new HuffmanDecoder(litLenLengths);
        distDecoder = new HuffmanDecoder(distLengths);
      }

      while (true) {
        const symbol = litLenDecoder.decode(reader);
        if (symbol === 256) {
          break;
        }
        if (symbol < 256) {
          out.write(symbol);
        } else {
          const lengthIdx = symbol - 257;
          const lengthBase = lengthBases[lengthIdx];
          const lengthExtra = lengthExtraBits[lengthIdx];
          const length = lengthBase + (lengthExtra > 0 ? reader.readBits(lengthExtra) : 0);

          const distSymbol = distDecoder.decode(reader);
          const distBase = distBases[distSymbol];
          const distExtra = distExtraBits[distSymbol];
          const distance = distBase + (distExtra > 0 ? reader.readBits(distExtra) : 0);

          out.writeCopy(distance, length);
        }
      }
    } else {
      throw new Error(`Unsupported block type: ${blockType}`);
    }
  }

  return out.data.subarray(0, out.length);
}
