import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceRoot = path.resolve(__dirname, '../../../CSharp');
const targetRoot = path.resolve(__dirname, '../CSharp');
const excludedSegments = new Set(['bin', 'obj', 'TestResults']);

if (!fs.existsSync(sourceRoot)) {
  throw new Error(`Expected source CSharp folder at ${sourceRoot}`);
}

fs.rmSync(targetRoot, { recursive: true, force: true });
fs.mkdirSync(targetRoot, { recursive: true });

fs.cpSync(sourceRoot, targetRoot, {
  recursive: true,
  filter: (sourcePath) => {
    const relativePath = path.relative(sourceRoot, sourcePath);
    if (!relativePath) {
      return true;
    }

    return !relativePath.split(path.sep).some((segment) => excludedSegments.has(segment));
  },
});

console.log(`Prepared packaged CSharp sources at ${targetRoot}`);
