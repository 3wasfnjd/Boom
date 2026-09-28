import {mkdir,cp,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist/src',{recursive:true});
for(const path of ['index.html','app.min.js','icon.svg','multiplayer.json','models','vendor','assets'])await cp(path,'dist/'+path,{recursive:true});
await cp('src/game.css','dist/src/game.css');
await cp('src/loading.css','dist/src/loading.css');
console.log('Packaged runtime assets in dist.');
