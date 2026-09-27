import {build} from 'esbuild';
await build({entryPoints:['src/main.js'],outfile:'app.min.js',bundle:true,minify:true,format:'esm',target:['es2022'],legalComments:'eof'});
console.log('Built app.min.js (ready for static hosting).');
