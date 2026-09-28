const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),report={status:'running',checks:[],errors:[]};
const check=(name,value,details)=>{assert.ok(value,name+' '+JSON.stringify(details||''));report.checks.push({name,status:'passed',...(details?{details}:{})});};
(async()=>{
 const options={headless:true};if(process.env.BOOM_CHROMIUM){options.executablePath=process.env.BOOM_CHROMIUM;options.args=JSON.parse(process.env.BOOM_CHROMIUM_ARGS||'[]');}
 const browser=await chromium.launch(options),page=await browser.newPage({viewport:{width:1280,height:800}});
 try {
  page.on('pageerror',e=>report.errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('http://boom.test/**',route=>{const pathname=new URL(route.request().url()).pathname,file=path.join(root,pathname==='/'?'index.html':pathname),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary'};return route.fulfill({path:file,contentType:types[path.extname(file)]||'application/octet-stream'});});
  await page.goto('http://boom.test/?debug=1');await page.waitForFunction(()=>window.__BOOM__,null,{timeout:20000});await page.evaluate(()=>{__BOOM__.pause();__BOOM__.step(60);});
  const terrain=await page.evaluate(()=>__BOOM__.arena.environment.terrain.stats);
  check('Native terrain includes physical depressions and positive dunes',terrain.maxHeight>1&&terrain.minHeight<-.8,terrain);
  const trace=await page.evaluate(()=>{const t=__BOOM__.arena.environment.terrain;return {ridge:t.trace({x:23,y:.55,z:16},{x:23,y:.55,z:31}),low:t.trace({x:25,y:1,z:5},{x:25,y:-2,z:5}),ground:t.heightAt(25,5)};});
  check('A ridge intercepts a level projectile even with both endpoints above ground',trace.ridge>0&&trace.ridge<1,trace);
  check('Depressed ground intercepts at its real height',Math.abs((1-3*trace.low)-trace.ground)<.015,trace);
  const drive=async(x,z,angle,frames)=>page.evaluate(({x,z,angle,frames})=>{
   const b=__BOOM__;b.teleport(x,z,angle);b.step(20);let min=Infinity,max=-Infinity,clearance=Infinity;
   const control={drive:{x:0,z:1,handbrake:false,touchActive:false},mode:'assist',fire:false};
   for(let i=0;i<frames;i+=3){b.step(Math.min(3,frames-i),control);const p=b.vehicle.container.position;min=Math.min(min,p.y);max=Math.max(max,p.y);clearance=Math.min(clearance,p.y-b.arena.environment.terrain.heightAt(p.x,p.z));}
   return {position:b.vehicle.container.position.toArray(),minHeight:min,maxHeight:max,minClearance:clearance};
  },{x,z,angle,frames});
  // Vehicle keyboard throttle is drive.z = +1, as in Controls.js.
  for(const id of ['h9','shas','datsun']){
   await page.evaluate(id=>__BOOM__.selectCar(id),id);
   const result=await drive(24.2,16,0,450);
   check(`${id}: drives up and down the dune without falling through`,result.maxHeight>1.1&&result.maxHeight-result.minHeight>.6&&result.minClearance>.15&&result.position[2]>28,result);
  }
  const wheels=await page.evaluate(()=>{
   const b=__BOOM__;b.teleport(23.6,21.8);b.step(120,{drive:{x:0,z:0,handbrake:true},mode:'assist',fire:false});
   const v=b.vehicle;v.container.updateMatrixWorld(true);
   return {contacts:v.physical.wheels.inContactCount,rotation:v.container.quaternion.toArray(),gaps:v.wheels.map((wheel,i)=>{const center=wheel.position.clone();wheel.getWorldPosition(center);const p=v.physical.wheels.items[i].contactPoint;return Math.abs(center.distanceTo(center.clone().set(p.x/2,p.y/2,p.z/2))-.2);})};
  });
  check('Rendered wheels follow their physical suspension contacts on a dune',wheels.contacts===4&&Math.max(...wheels.gaps)<.04,wheels);
  const view=await page.evaluate(()=>{const b=__BOOM__;b.renderer.render(b.scene,b.camera);return b.renderer.domElement.toDataURL('image/png');});fs.writeFileSync(path.join(root,'terrain-preview.png'),Buffer.from(view.split(',')[1],'base64'));
  const bridge=await drive(13,-20,Math.PI/2,270);
  check('Imported bridge carries a car across the depressed channel',bridge.position[0]>25&&bridge.minHeight>-.12,bridge);
  const entrance=await drive(-21,-13,0,205);
  check('Rest-house original front gates allow entry',entrance.position[2]>-5,entrance);
  const exit=await drive(-10,4.47,Math.PI/2,160);
  check('New side exit has matching visible and physical opening',exit.position[0]>-4.5,exit);
  const wall=await drive(-10,-6.8,Math.PI/2,130);
  check('Unopened rest-house wall stops the car',wall.position[0]<-6.8&&wall.position[0]>-8,wall);
  const gateShot=await page.evaluate(async()=>{
   const b=__BOOM__,shot=b.combat.shots.find(s=>s.kind==='rockets');b.teleport(-10,4.47,Math.PI/2);
   shot.active=shot.mesh.visible=true;shot.spec=b.combat.spec;shot.mesh.position.set(-9,1,4.47);shot.velocity.set(26,0,0);shot.life=2;
   for(let i=0;i<12;i++)b.step(1,{drive:{x:0,z:0,touchActive:false,handbrake:false},mode:'assist',fire:false});
   return {active:shot.active,x:shot.mesh.position.x};
  });
  check('Live projectile crosses the open side gate',gateShot.active&&gateShot.x>-4,gateShot);
  check('World loads and simulates without runtime errors',report.errors.length===0,report.errors);
  report.status='passed';report.environment='Chromium software WebGL; deterministic 60 Hz steps using the same game physics. Not a real-phone performance measurement.';
  fs.writeFileSync(path.join(root,'verification/world-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(error=>{report.status='failed';report.failure=error.stack;console.log(JSON.stringify(report,null,2));process.exit(1)});
