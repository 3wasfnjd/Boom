import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {rapierPlugin} from './rapier-plugin.mjs';
const directory=await mkdtemp(path.join(tmpdir(),'boom-physics-'));
try{const outfile=path.join(directory,'verify.mjs');await build({entryPoints:['verification/motri-physics.mjs'],outfile,bundle:true,platform:'node',format:'esm',plugins:[rapierPlugin]});await import(pathToFileURL(outfile).href);}finally{await rm(directory,{recursive:true,force:true});}
