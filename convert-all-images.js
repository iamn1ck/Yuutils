const fs = require('fs');
const path = require('path');

const yuPlaygroundDir = path.resolve(__dirname, '../YuuPlayground');

try {
  const files = fs.readdirSync(yuPlaygroundDir);
  for (const file of files) {
    if (file.toLowerCase().endsWith('.png')) {
      const srcPath = path.join(yuPlaygroundDir, file);
      const baseName = path.basename(file, '.png');
      const destPath = path.join(yuPlaygroundDir, `${baseName}_png.txt`);
      
      const buffer = fs.readFileSync(srcPath);
      const hexString = buffer.toString('hex');
      
      fs.writeFileSync(destPath, hexString);
      console.log(`Converted ${file} -> ${baseName}_png.txt (${buffer.length} bytes, hex length: ${hexString.length})`);
    }
  }
  console.log('Image conversion complete!');
} catch (e) {
  console.error('Failed to convert images:', e.message);
  process.exit(1);
}
