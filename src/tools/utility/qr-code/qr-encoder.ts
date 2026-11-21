export type QrEccLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrMatrix {
  version: number;
  size: number;
  ecc: QrEccLevel;
  modules: boolean[][];
}

// Reed-Solomon GF(256) with primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11d)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsComputeRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

// Total data + EC codewords per version (versions 1..20)
// Each entry for ECC level: [ecCodewordsPerBlock, numBlocks]
// Index 0 is unused so version maps directly to index 1..20.
const ECC_CODEWORDS_PER_BLOCK: Record<QrEccLevel, readonly number[]> = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28],
};

const NUM_ERROR_CORRECTION_BLOCKS: Record<QrEccLevel, readonly number[]> = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25],
};

// Format indicator bits (ISO/IEC 18004 Table 25)
const ECC_FORMAT_BITS: Record<QrEccLevel, number> = {
  L: 1, // 01
  M: 0, // 00
  Q: 3, // 11
  H: 2, // 10
};

const MAX_VERSION = 20;

function getAlignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step =
    version === 32
      ? 26
      : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

function getNumRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(version: number, ecc: QrEccLevel): number {
  return (
    Math.floor(getNumRawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ecc][version] * NUM_ERROR_CORRECTION_BLOCKS[ecc][version]
  );
}

function appendBits(value: number, length: number, bits: number[]): void {
  for (let i = length - 1; i >= 0; i--) {
    bits.push((value >>> i) & 1);
  }
}

function selectVersionAndBuildData(bytes: Uint8Array, ecc: QrEccLevel): {
  version: number;
  dataCodewords: Uint8Array;
} {
  for (let version = 1; version <= MAX_VERSION; version++) {
    const countBits = version <= 9 ? 8 : 16;
    const requiredBits = 4 + countBits + bytes.length * 8;
    const capacityBits = getNumDataCodewords(version, ecc) * 8;
    if (requiredBits <= capacityBits) {
      const bits: number[] = [];
      // Mode indicator: Byte mode = 0100
      appendBits(0b0100, 4, bits);
      appendBits(bytes.length, countBits, bits);
      for (let i = 0; i < bytes.length; i++) {
        appendBits(bytes[i], 8, bits);
      }

      // Terminator (up to 4 zero bits)
      const terminatorLen = Math.min(4, capacityBits - bits.length);
      appendBits(0, terminatorLen, bits);

      // Pad to byte boundary
      const padToByte = (8 - (bits.length % 8)) % 8;
      appendBits(0, padToByte, bits);

      // Pad bytes alternating 0xEC and 0x11
      const padBytes = [0xec, 0x11];
      let padIdx = 0;
      while (bits.length < capacityBits) {
        appendBits(padBytes[padIdx % 2], 8, bits);
        padIdx++;
      }

      const dataCodewords = new Uint8Array(bits.length / 8);
      for (let i = 0; i < dataCodewords.length; i++) {
        let byteVal = 0;
        for (let b = 0; b < 8; b++) {
          byteVal = (byteVal << 1) | bits[i * 8 + b];
        }
        dataCodewords[i] = byteVal;
      }

      return { version, dataCodewords };
    }
  }

  throw new Error('Data terlalu panjang untuk QR Code (maksimum versi 20).');
}

function addEccAndInterleave(
  data: Uint8Array,
  version: number,
  ecc: QrEccLevel,
): Uint8Array {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc][version];
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < numBlocks; i++) {
    const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const slice = data.subarray(offset, offset + dataLen);
    offset += dataLen;
    const ec = rsComputeRemainder(slice, blockEccLen);
    const combined = new Uint8Array(shortBlockLen + 1);
    combined.set(slice, 0);
    // Store EC at the end of the block; short blocks leave index (shortBlockLen - blockEccLen) unused
    if (i < numShortBlocks) {
      const shortCombined = new Uint8Array(shortBlockLen);
      shortCombined.set(slice, 0);
      shortCombined.set(ec, dataLen);
      blocks.push(shortCombined);
    } else {
      combined.set(ec, dataLen);
      blocks.push(combined);
    }
  }

  const result = new Uint8Array(rawCodewords);
  let idx = 0;
  const maxDataLen = shortBlockLen - blockEccLen + (numShortBlocks < numBlocks ? 1 : 0);

  // Interleave data codewords
  for (let i = 0; i < maxDataLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      const blockDataLen = shortBlockLen - blockEccLen + (j < numShortBlocks ? 0 : 1);
      if (i < blockDataLen) {
        result[idx++] = blocks[j][i];
      }
    }
  }

  // Interleave EC codewords
  for (let i = 0; i < blockEccLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      const blockDataLen = shortBlockLen - blockEccLen + (j < numShortBlocks ? 0 : 1);
      result[idx++] = blocks[j][blockDataLen + i];
    }
  }

  return result;
}

function drawFunctionPatterns(
  version: number,
  modules: boolean[][],
  isFunction: boolean[][],
): void {
  const size = version * 4 + 17;

  const setFunction = (x: number, y: number, isDark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = isDark;
    isFunction[y][x] = true;
  };

  // Timing patterns
  for (let i = 0; i < size; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  // Finder patterns + separators
  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) {
          setFunction(x, y, dist !== 2 && dist !== 4);
        }
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  // Alignment patterns
  const alignPos = getAlignmentPatternPositions(version);
  for (let i = 0; i < alignPos.length; i++) {
    for (let j = 0; j < alignPos.length; j++) {
      const isCorner =
        (i === 0 && j === 0) ||
        (i === 0 && j === alignPos.length - 1) ||
        (i === alignPos.length - 1 && j === 0);
      if (isCorner) continue;
      const cx = alignPos[i];
      const cy = alignPos[j];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          setFunction(cx + dx, cy + dy, dist !== 1);
        }
      }
    }
  }

  // Reserve format info areas (filled later with actual mask)
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFunction(8, i, false);
      setFunction(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    setFunction(size - 1 - i, 8, false);
  }
  for (let i = 0; i < 7; i++) {
    setFunction(8, size - 1 - i, false);
  }
  // Dark module
  setFunction(8, size - 8, true);

  // Version information (versions >= 7)
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    }
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, bit);
      setFunction(b, a, bit);
    }
  }
}

function drawFormatBits(
  ecc: QrEccLevel,
  mask: number,
  modules: boolean[][],
): void {
  const size = modules.length;
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  // First copy
  for (let i = 0; i <= 5; i++) modules[i][8] = ((bits >>> i) & 1) !== 0;
  modules[7][8] = ((bits >>> 6) & 1) !== 0;
  modules[8][8] = ((bits >>> 7) & 1) !== 0;
  modules[8][7] = ((bits >>> 8) & 1) !== 0;
  for (let i = 9; i < 15; i++) modules[8][14 - i] = ((bits >>> i) & 1) !== 0;

  // Second copy
  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = ((bits >>> i) & 1) !== 0;
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = ((bits >>> i) & 1) !== 0;
  modules[size - 8][8] = true;
}

function drawCodewords(
  codewords: Uint8Array,
  modules: boolean[][],
  isFunction: boolean[][],
): void {
  const size = modules.length;
  let bitIdx = 0;
  const totalBits = codewords.length * 8;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIdx < totalBits) {
          modules[y][x] = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
          bitIdx++;
        }
      }
    }
  }
}

function applyMask(
  mask: number,
  modules: boolean[][],
  isFunction: boolean[][],
): void {
  const size = modules.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFunction[y][x]) continue;
      let invert = false;
      switch (mask) {
        case 0:
          invert = (x + y) % 2 === 0;
          break;
        case 1:
          invert = y % 2 === 0;
          break;
        case 2:
          invert = x % 3 === 0;
          break;
        case 3:
          invert = (x + y) % 3 === 0;
          break;
        case 4:
          invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
          break;
        case 5:
          invert = ((x * y) % 2) + ((x * y) % 3) === 0;
          break;
        case 6:
          invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
          break;
        case 7:
          invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
          break;
      }
      if (invert) {
        modules[y][x] = !modules[y][x];
      }
    }
  }
}

function computePenaltyScore(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;

  // Rule 1: Adjacent modules in row/column in same color
  for (let y = 0; y < size; y++) {
    let runColor = modules[y][0];
    let runLen = 1;
    for (let x = 1; x < size; x++) {
      if (modules[y][x] === runColor) {
        runLen++;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score += 1;
      } else {
        runColor = modules[y][x];
        runLen = 1;
      }
    }
  }
  for (let x = 0; x < size; x++) {
    let runColor = modules[0][x];
    let runLen = 1;
    for (let y = 1; y < size; y++) {
      if (modules[y][x] === runColor) {
        runLen++;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score += 1;
      } else {
        runColor = modules[y][x];
        runLen = 1;
      }
    }
  }

  // Rule 2: 2x2 blocks of same color
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
        score += 3;
      }
    }
  }

  // Rule 3: Finder-like 1:1:3:1:1 patterns in rows and columns
  const patternA = [true, false, true, true, true, false, true, false, false, false, false];
  const patternB = [false, false, false, false, true, false, true, true, true, false, true];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x <= size - 11; x++) {
      let matchA = true;
      let matchB = true;
      for (let k = 0; k < 11; k++) {
        if (modules[y][x + k] !== patternA[k]) matchA = false;
        if (modules[y][x + k] !== patternB[k]) matchB = false;
      }
      if (matchA || matchB) score += 40;
    }
  }
  for (let x = 0; x < size; x++) {
    for (let y = 0; y <= size - 11; y++) {
      let matchA = true;
      let matchB = true;
      for (let k = 0; k < 11; k++) {
        if (modules[y + k][x] !== patternA[k]) matchA = false;
        if (modules[y + k][x] !== patternB[k]) matchB = false;
      }
      if (matchA || matchB) score += 40;
    }
  }

  // Rule 4: Balance of dark and light modules
  let darkCount = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) darkCount++;
    }
  }
  const total = size * size;
  const k = Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1;
  score += Math.max(0, k) * 10;

  return score;
}

export function encodeQrMatrix(text: string, ecc: QrEccLevel = 'M'): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const { version, dataCodewords } = selectVersionAndBuildData(bytes, ecc);
  const allCodewords = addEccAndInterleave(dataCodewords, version, ecc);
  const size = version * 4 + 17;

  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );

  drawFunctionPatterns(version, modules, isFunction);
  drawCodewords(allCodewords, modules, isFunction);

  let bestMask = 0;
  let lowestPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask, modules, isFunction);
    drawFormatBits(ecc, mask, modules);
    const penalty = computePenaltyScore(modules);
    if (penalty < lowestPenalty) {
      lowestPenalty = penalty;
      bestMask = mask;
    }
    // Undo mask
    applyMask(mask, modules, isFunction);
  }

  applyMask(bestMask, modules, isFunction);
  drawFormatBits(ecc, bestMask, modules);

  return {
    version,
    size,
    ecc,
    modules,
  };
}
