import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
import {rapierPlugin} from './rapier-plugin.mjs';
await mkdir('vendor/rapier',{recursive:true});
await copyFile('node_modules/@dimforge/rapier3d/rapier_wasm3d_bg.wasm','vendor/rapier/rapier_wasm3d_bg.wasm');
await copyFile('node_modules/@dimforge/rapier3d/LICENSE','licenses/Rapier-Apache-2.0.txt');
await build({entryPoints:['src/main.js'],outfile:'app.min.js',bundle:true,minify:true,format:'esm',target:['es2022'],legalComments:'eof',plugins:[rapierPlugin]});
console.log('Built app.min.js and local Rapier WASM.');
