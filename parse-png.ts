import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore
import { PNG } from 'pngjs';

function toCamelCase(str: string): string {
  const parts = str.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts[0].toLowerCase() + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
}

function toPascalCase(str: string): string {
  const parts = str.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
}

export function parsePng(
  pngPathInput: string,
  outputDirInput?: string
): {
  baseName: string;
  camelCaseName: string;
  pascalCaseName: string;
  outputPath: string;
} {
  const pngPath = path.resolve(pngPathInput);
  if (!fs.existsSync(pngPath)) {
    throw new Error(`Error: PNG file not found at: ${pngPath}`);
  }

  const rawBaseName = path.basename(pngPath, path.extname(pngPath));
  const cleanBaseName = rawBaseName.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const camelCaseName = toCamelCase(cleanBaseName);
  const pascalCaseName = toPascalCase(cleanBaseName);

  const defaultOutDir = path.resolve(__dirname, '../YuuPlayground/Yuu API');
  const outDir = outputDirInput ? path.resolve(outputDirInput) : defaultOutDir;

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const data = fs.readFileSync(pngPath);
  const png = PNG.sync.read(data);

  const width = png.width;
  const height = png.height;

  // Map from unique color string 'r,g,b,a' to list of [x, y] coordinates
  const colorGroups = new Map<string, [number, number][]>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const r = Number((png.data[idx] / 255).toFixed(4));
      const g = Number((png.data[idx + 1] / 255).toFixed(4));
      const b = Number((png.data[idx + 2] / 255).toFixed(4));
      const a = Number((png.data[idx + 3] / 255).toFixed(4));

      const key = `${r},${g},${b},${a}`;

      if (!colorGroups.has(key)) {
        colorGroups.set(key, []);
      }
      colorGroups.get(key)!.push([x, y]);
    }
  }

  // Find dominant color
  let maxCount = -1;
  let dominantKey = '0,0,0,1';
  for (const [key, pixels] of colorGroups.entries()) {
    if (pixels.length > maxCount) {
      maxCount = pixels.length;
      dominantKey = key;
    }
  }
  const [domR, domG, domB, domA] = dominantKey.split(',').map(Number);
  colorGroups.delete(dominantKey);

  // Determine relative imports for Texture, Color, and Vector2
  let textureImport = './Texture';
  let basicTypesImport = './Basic Types';

  if (!fs.existsSync(path.join(outDir, 'Texture.ts'))) {
    if (fs.existsSync(path.join(outDir, 'images', 'Texture.ts'))) {
      textureImport = './images/Texture';
    } else if (fs.existsSync(path.join(outDir, 'Yuu API', 'Texture.ts'))) {
      textureImport = './Yuu API/Texture';
      basicTypesImport = './Yuu API/Basic Types';
    } else if (fs.existsSync(path.join(outDir, 'Yuu API', 'images', 'Texture.ts'))) {
      textureImport = './Yuu API/images/Texture';
      basicTypesImport = './Yuu API/Basic Types';
    }
  }

  const colorData: [number, number, number, number, [number, number][]][] = [];
  for (const [colorStr, pixels] of colorGroups.entries()) {
    const [r, g, b, a] = colorStr.split(',').map(Number);
    colorData.push([r, g, b, a, pixels]);
  }

  const colorDataJson = JSON.stringify(colorData);

  const code = `import { Color } from "${basicTypesImport}/Color";
import { Vector2 } from "${basicTypesImport}/Vector2";
import { Texture } from "${textureImport}";

const colorData: [number, number, number, number, [number, number][]][] = JSON.parse(${JSON.stringify(colorDataJson)});

let cachedTexture: Texture | undefined;

/**
 * Returns a cached singleton Texture instance populated with the PNG image pixels.
 */
export function get${pascalCaseName}Texture(): Texture {
  if (!cachedTexture) {
    cachedTexture = new Texture(${width}, ${height});
    apply${pascalCaseName}Texture(cachedTexture);
  }
  return cachedTexture;
}

/**
 * Applies the PNG texture colors to an existing Texture instance.
 */
export function apply${pascalCaseName}Texture(texture: Texture) {
  // Clear/fill the texture with the dominant color
  texture.fillWithColor(new Color(${domR}, ${domG}, ${domB}), ${domA});

  for (const [r, g, b, a, pixels] of colorData) {
    texture.setPixelsColor(
      pixels.map(([x, y]) => new Vector2(x, y)),
      new Color(r, g, b),
      a
    );
  }

  texture.updateTexture();
}
`;

  const outputPath = path.join(outDir, `${camelCaseName}Texture.ts`);
  fs.writeFileSync(outputPath, code, 'utf8');
  console.log(`Saved texture: ${outputPath} (${width}x${height}, ${colorData.length + 1} colors)`);

  return {
    baseName: rawBaseName,
    camelCaseName,
    pascalCaseName,
    outputPath,
  };
}

function main() {
  const pngArg = process.argv[2];
  if (!pngArg) {
    // Fallback to bedrock.png if it exists for backwards compatibility
    const fallbackPath = path.resolve(__dirname, '../YuuPlayground/bedrock.png');
    if (fs.existsSync(fallbackPath)) {
      parsePng(fallbackPath, process.argv[3]);
      return;
    }
    console.error('Usage: ts-node parse-png.ts <path-to-png-file> [output-directory]');
    process.exit(1);
  }

  parsePng(pngArg, process.argv[3]);
}

if (require.main === module) {
  main();
}
