import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetRoot = path.resolve(__dirname, '../CSharp');

fs.rmSync(targetRoot, { recursive: true, force: true });
console.log(`Cleaned packaged CSharp sources from ${targetRoot}`);
