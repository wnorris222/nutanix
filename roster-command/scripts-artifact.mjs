// Bundles dist/ into one self-contained HTML file for publishing as a claude.ai Artifact.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const assets = readdirSync('dist/assets');
const js = readFileSync(`dist/assets/${assets.find((f) => f.endsWith('.js'))}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(`dist/assets/${assets.find((f) => f.endsWith('.css'))}`, 'utf8');
const out = process.argv[2] ?? 'dist/artifact.html';
writeFileSync(out, `<title>Roster Command Center</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`);
console.log('wrote', out);
