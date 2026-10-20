import { defineConfig } from 'vite';
import fs from 'fs';
// copy the Vercel serverless function (api/mly.js, Mapillary proxy) next to the static build
export default defineConfig({
  plugins: [{ name: 'copy-api', closeBundle() { fs.mkdirSync('dist/api', { recursive: true }); for (const f of fs.readdirSync('api')) fs.copyFileSync(`api/${f}`, `dist/api/${f}`); } }],
});
