import path from 'node:path';
// Rapier's official web package expects bundler-level WASM imports. Keep its
// bindings unchanged; initialize the separate local WASM explicitly at startup.
export const rapierPlugin={name:'local-rapier-wasm',setup(build){
 build.onLoad({filter:/rapier_wasm3d\.js$/},args=>({resolveDir:path.dirname(args.path),loader:'js',contents:`
  import * as bindings from './rapier_wasm3d_bg.js';
  export * from './rapier_wasm3d_bg.js';
  export async function initializeRapier(source) {
    const bytes=typeof source==='string'||source instanceof URL?await fetch(source).then(r=>{if(!r.ok)throw Error('Rapier WASM unavailable');return r.arrayBuffer();}):source;
    const result=await WebAssembly.instantiate(bytes,{'./rapier_wasm3d_bg.js':bindings});
    bindings.__wbg_set_wasm(result.instance.exports);
  }
 `}));
}};
