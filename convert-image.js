const fs = require('fs');
const path = require('path');

const srcPath = path.resolve(__dirname, '../YuuPlayground/bedrock.png');
const destPath = path.resolve(__dirname, '../YuuPlayground/bedrock_png.txt');

const buffer = fs.readFileSync(srcPath);
const hexString = buffer.toString('hex');

fs.writeFileSync(destPath, hexString);
console.log(`Successfully pre-converted bedrock.png to hex text at: ${destPath}`);
console.log(`Original size: ${buffer.length} bytes, Hex size: ${hexString.length} chars`);
