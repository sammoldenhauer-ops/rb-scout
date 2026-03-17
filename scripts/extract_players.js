import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourcePath = path.join(__dirname, '..', 'dist', 'assets', 'index-BH2pbF1J.js');
const text = fs.readFileSync(sourcePath, 'utf8');

const start = text.indexOf('be={');
if (start === -1) {
  throw new Error("Could not find 'be={' in built JS file");
}

let stack = [];
let end = -1;
for (let i = start; i < text.length; i++) {
  const ch = text[i];
  if (ch === '{') {
    stack.push(i);
  } else if (ch === '}') {
    stack.pop();
    if (stack.length === 0) {
      end = i;
      break;
    }
  }
}

if (end === -1) {
  throw new Error('Could not find end of object starting at be={');
}

const obj = text.slice(start, end + 1);
const outPath = path.join(__dirname, '..', 'data', 'extractedPlayersBase.js');
fs.writeFileSync(outPath, 'export const EXTRACTED = ' + obj + ';\n', 'utf8');
console.log(`Wrote ${outPath} (length ${obj.length}).`);
