const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const report={checkedAt:new Date().toISOString(),status:'running',checks:[],errors:[],views:[]};
function check(name,passed,details){assert.ok(passed,name+' '+JSON.stringify(details));report.checks.push({name,status:'passed',details});}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BOOM_CHROMIUM?{executablePath:process.env.BOOM_CHROMIUM,args:JSON.parse(process.env.BOOM_CHROMIUM_ARGS||'[]')}: {})});
 try{
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
   const page=await context.newPage();
   page.on('pageerror',e=>report.errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
   await page.route('http://boom.test/**',route=>{
    const p=new URL(route.request().url()).pathname,file=path.join(root,p==='/'?'index.html':p);
    return route.fulfill({path:file,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream'});
   });
   await page.goto('http://boom.test/?debug=1&offline=1');await page.waitForFunction(()=>window.__BOOM__,null,{timeout:45000});
   await page.evaluate(()=>{__BOOM__.pause();__BOOM__.atmosphere.setOverride({dayPhase:.06,rain:0,clouds:.25,wind:.6},20);__BOOM__.step(90);});
   const vegetation=await page.evaluate(()=>{
    const g=__BOOM__,env=g.arena.environment;let floating=0,inLane=0,blades=0;
    for(const m of env.grass.meshes){const root=m.geometry.getAttribute('bladeRoot');for(let i=0;i<root.count;i+=3){blades++;const x=root.getX(i),y=root.getY(i),z=root.getZ(i);if(Math.abs(y-env.terrain.heightAt(x,z)-.012)>.0001)floating++;
      if((Math.abs(x)<3&&z>-34&&z<27)||(Math.abs(z+20)<2.4&&x>-34&&x<34)||(x>-31&&x<-6&&z>-12&&z<20))inLane++;}}
    return {blades,floating,inLane,stats:env.stats};
   });
   check((mobile?'Mobile':'Desktop')+' grass follows terrain and leaves driving routes/buildings clear',vegetation.blades>2000&&vegetation.floating===0&&vegetation.inLane===0,vegetation);
   const day=await page.evaluate(()=>({atmosphere:__BOOM__.atmosphere.snapshot(),render:{...__BOOM__.renderer.info.render},memory:{...__BOOM__.renderer.info.memory}}));
   check('Clear weather does not draw rain',day.atmosphere.rainVisible===false,day.atmosphere);
   await page.screenshot({path:path.join(root,mobile?'environment-mobile-preview.png':'environment-day-preview.png')});
   await page.evaluate(()=>{__BOOM__.atmosphere.setOverride({dayPhase:.06,rain:.95,clouds:.95,wind:.85},22);__BOOM__.step();});
   const rain=await page.evaluate(()=>({atmosphere:__BOOM__.atmosphere.snapshot(),render:{...__BOOM__.renderer.info.render}}));
   check('Rain and wind render within the fixed particle budget',rain.atmosphere.rainVisible&&rain.atmosphere.rainCapacity===(mobile?1000:1800),rain);
   await page.screenshot({path:path.join(root,mobile?'environment-mobile-rain.png':'environment-rain-preview.png')});
   const coverage=await page.evaluate(()=>{
    const g=__BOOM__,tex=g.atmosphere.heightTexture.image;let invalid=0,covered=0;
    for(const b of g.arena.blockers.filter(b=>b.name.startsWith('house:')&&b.bounds.max.y>1.5)){
      const box=b.bounds,x=(box.min.x+box.max.x)/2,z=(box.min.z+box.max.z)/2,ix=Math.floor((x+50)/100*tex.width),iz=Math.floor((z+50)/100*tex.height);
      if(ix<0||iz<0||ix>=tex.width||iz>=tex.height)continue;
      const wx=(ix+.5)/tex.width*100-50,wz=(iz+.5)/tex.height*100-50;
      if(wx<box.min.x||wx>box.max.x||wz<box.min.z||wz>box.max.z)continue;
      covered++;if(tex.data[iz*tex.width+ix]+.001<box.max.y)invalid++;
    }return {covered,invalid};
   });
   check('Rain height mask includes the rest-house roofs and walls',coverage.covered>0&&coverage.invalid===0,coverage);
   await page.evaluate(()=>{__BOOM__.atmosphere.setOverride({dayPhase:.45,rain:0,clouds:.25,wind:.4},30);__BOOM__.step();});
   const night=await page.evaluate(()=>({state:__BOOM__.atmosphere.snapshot(),pools:__BOOM__.atmosphere.lampPools.visible,light:__BOOM__.atmosphere.ambient.intensity}));
   check('Night activates lamps while preserving ambient visibility',night.state.night===1&&night.pools&&night.light>=.8,night);
   if(!mobile)await page.screenshot({path:path.join(root,'environment-night-preview.png')});
   const stable=await page.evaluate(()=>{
    const g=__BOOM__,before={...g.renderer.info.memory};
    for(let i=0;i<24;i++){g.atmosphere.setOverride({dayPhase:(i%12)/12,rain:i%2,clouds:(i%3)/2,wind:.8},40+i);g.step();}
    return {before,after:{...g.renderer.info.memory},failedPrograms:g.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};
   });
   check('Repeated weather/day transitions keep GPU resources bounded and all shaders valid',stable.before.geometries===stable.after.geometries&&stable.before.textures===stable.after.textures&&stable.failedPrograms===0,stable);
   report.views.push({mobile,day,rain,night});
   if(!mobile){
    const wind=await page.evaluate(()=>{
      const g=__BOOM__,env=g.arena.environment,root=env.grass.meshes.find(m=>m.geometry.getAttribute('bladeRoot').count>500).geometry.getAttribute('bladeRoot');
      const x=root.getX(300),z=root.getZ(300),y=env.terrain.heightAt(x,z);
      g.teleport(x,z);g.step(30);g.camera.position.set(x+2,y+2.6,z-3.5);g.camera.lookAt(x,y+.2,z);g.camera.updateMatrixWorld();
      const hidden=[];g.scene.traverse(o=>{if(o.isMesh&&!o.name.startsWith('MotriGrass')){hidden.push([o,o.visible]);o.visible=false;}});
      const draw=time=>{g.atmosphere.setOverride({dayPhase:.06,rain:0,clouds:0,wind:.9},time);g.atmosphere.update(g.camera,g.vehicle.container.position);g.atmosphere.sky.visible=false;g.renderer.render(g.scene,g.camera);const gl=g.renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
      const a=draw(25),b=draw(26);let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)changed++;
      hidden.forEach(([o,v])=>o.visible=v);
      g.atmosphere.update(g.camera,g.vehicle.container.position);g.renderer.render(g.scene,g.camera);
      return {changed,total:a.length/4};
    });
    check('Actual grass pixels move with wind while the camera and lighting remain fixed',wind.changed>300,wind);
    await page.screenshot({path:path.join(root,'environment-grass-preview.png')});
   }
   if(mobile){await page.setViewportSize({width:844,height:390});await page.evaluate(()=>{__BOOM__.atmosphere.setOverride({dayPhase:.06,rain:.7,clouds:.8,wind:.6},22);__BOOM__.step();});await page.screenshot({path:path.join(root,'environment-landscape-preview.png')});}
   // Keep contexts until browser.close(): single-process software Chromium
   // terminates when its final context is closed between viewport checks.
  }
  check('All environment assets and WebGL shaders load without browser errors',report.errors.length===0,report.errors);
  report.status='passed';report.environment='Chromium software WebGL, desktop and touch/mobile viewport emulation; no physical-phone FPS claim.';
 }finally{await browser.close();}
})().catch(e=>{report.status='failed';report.failure=e.stack;process.exitCode=1;}).finally(()=>{fs.writeFileSync(path.join(root,'verification/environment-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));});
