const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const report={status:'running',checks:[],screenshots:[],errors:[]};
const root=path.resolve(__dirname,'..');
const check=(name,value,details)=>{assert.ok(value,name+' '+JSON.stringify(details||''));report.checks.push({name,status:'passed',...(details?{details}:{})});};
async function launch(mobile){
 const options={headless:true};
 if(process.env.BOOM_CHROMIUM){options.executablePath=process.env.BOOM_CHROMIUM;options.args=JSON.parse(process.env.BOOM_CHROMIUM_ARGS||'[]');}
 const browser=await chromium.launch(options);
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:800},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
 page.on('pageerror',e=>report.errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.route('http://boom.test/**',async route=>{
  const pathname=new URL(route.request().url()).pathname,file=path.join(root,pathname==='/'?'index.html':pathname);
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.glb':'model/gltf-binary','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp'};
  if(!fs.existsSync(file))return route.fulfill({status:404,body:'Missing'});
  return route.fulfill({path:file,contentType:types[path.extname(file)]||'application/octet-stream'});
 });
 await page.goto('http://boom.test/?debug=1');await page.waitForFunction(()=>window.__BOOM__,null,{timeout:20000});
 await page.evaluate(()=>{__BOOM__.pause();__BOOM__.step(90);});return {browser,page};
}
const step=(page,n)=>page.evaluate(n=>__BOOM__.step(n),n);
const state=page=>page.evaluate(()=>__BOOM__.snapshot());
const reset=async page=>{await page.click('#reset');await step(page,90);};
(async()=>{
 let {browser,page}=await launch(false);
 try {
  check('Desktop WebGL starts with six targets and four animated wheels',await page.evaluate(()=>__BOOM__.arena.targets.length===6&&__BOOM__.vehicle.wheels.length===4&&document.getElementById('loading').hidden));
  await page.keyboard.down('KeyW');await step(page,120);const moving=await state(page);
  check('Keyboard acceleration moves the car forward',moving.position[2]>-4&&moving.speed>1,{position:moving.position,speed:moving.speed});
  await page.keyboard.down('KeyA');await step(page,40);const turning=await state(page);
  check('Steering changes heading while driving',Math.abs(turning.yaw)>.1,{yaw:turning.yaw});
  await page.keyboard.down('KeyB');await step(page,70);const braking=await state(page);
  check('Handbrake reduces speed under the same throttle',braking.speed<moving.speed*.8,{before:moving.speed,after:braking.speed});
  await page.keyboard.up('KeyA');await page.keyboard.up('KeyB');await page.keyboard.up('KeyW');await reset(page);
  await page.keyboard.down('KeyS');await step(page,90);const reversing=await state(page);
  check('Reverse moves behind the starting line',reversing.position[2]<-6.4&&reversing.speed<0,{position:reversing.position,speed:reversing.speed});await page.keyboard.up('KeyS');
  for(const id of ['h9','shas','datsun']){
   await page.click(`[data-car="${id}"]`);await page.waitForFunction(id=>__BOOM__.snapshot().car===id,id);await reset(page);
   await page.keyboard.down('KeyW');await step(page,80);await page.keyboard.up('KeyW');
   const driven=await state(page);check(`${id}: loaded model drives with four wheels`,driven.position[2]>-5&&await page.evaluate(()=>__BOOM__.vehicle.wheels.length===4));await reset(page);
   await page.keyboard.down('Space');await step(page,240);await page.keyboard.up('Space');const fired=await state(page);
   check(`${id}: weapon fires and destroys a target`,fired.shotsFired>0&&fired.hits>0&&fired.targets.some(target=>!target.active),{shots:fired.shotsFired,hits:fired.hits,targets:fired.targets});
   await step(page,540);check(`${id}: destroyed targets respawn`,(await state(page)).targets.filter(t=>fired.targets.some(previous=>previous.id===t.id&&!previous.active)).every(t=>t.active&&t.health===100));
   const retained=await page.evaluate(()=>({geometry:__BOOM__.renderer.info.memory.geometries,shots:__BOOM__.combat.shots.length,effects:__BOOM__.combat.effects.length}));
   check(`${id}: projectile and effect pools stay bounded`,retained.shots===72&&retained.effects===72,retained);
  }
  await page.click('[data-car="h9"]');await page.waitForFunction(()=>__BOOM__.snapshot().car==='h9');await reset(page);
  const targetPoint=await page.evaluate(()=>{const p=__BOOM__.arena.targets[0].position.clone().project(__BOOM__.camera);return {x:(p.x*.5+.5)*innerWidth,y:(-p.y*.5+.5)*innerHeight};});
  await page.mouse.move(targetPoint.x,targetPoint.y);await page.mouse.down();await step(page,180);await page.mouse.up();
  check('Mouse world aiming damages the pointed target',!(await state(page)).targets[0].active);
  await reset(page);
  await page.evaluate(()=>{const bounds=__BOOM__.arena.targets[0].bounds.clone();bounds.min.set(-3,0,1);bounds.max.set(3,4,1.2);__BOOM__.arena.blockers.push({kind:'wall',active:true,bounds});});
  await page.mouse.move(targetPoint.x,targetPoint.y);await page.mouse.down();await step(page,240);await page.mouse.up();
  check('A wall between muzzle and target blocks actual gun damage',(await state(page)).targets[0].health===100);
  await page.evaluate(()=>__BOOM__.arena.blockers.pop());
  await reset(page);await page.keyboard.down('Space');await step(page,100);await page.keyboard.up('Space');
  await page.screenshot({path:path.join(root,'arena-preview.png')});report.screenshots.push('arena-preview.png');
  await page.keyboard.down('KeyW');await step(page,50);await page.click('#reset');const afterReset=await state(page);await page.keyboard.up('KeyW');
  check('Reset clears motion, targets, hits and live shots',afterReset.speed===0&&afterReset.hits===0&&afterReset.activeShots===0&&afterReset.targets.every(t=>t.health===100));
  const beforeMemory=await page.evaluate(()=>__BOOM__.renderer.info.memory.geometries);
  for(let i=0;i<12;i++){await page.evaluate(id=>__BOOM__.selectCar(id),['h9','shas','datsun'][i%3]);await step(page,1);}
  const afterMemory=await page.evaluate(()=>__BOOM__.renderer.info.memory.geometries);
  check('Repeated vehicle switching reuses loaded GPU geometry',afterMemory<=beforeMemory+5,{before:beforeMemory,after:afterMemory});
 }finally{await browser.close();}
 ({browser,page}=await launch(true));
 try {
  const hitRects=await page.evaluate(()=>['.steer-base','#aim-pad','#brake'].map(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};}));
  const [joystick,fire,brake]=hitRects;
  check('Portrait touch controls have separate visible hit regions',joystick.x+joystick.w/2<brake.x-brake.w/2&&brake.x+brake.w/2<fire.x-fire.w/2);
  const cdp=await page.context().newCDPSession(page);
  const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,force:1,radiusX:5,radiusY:5}))});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  await touch('touchStart',[[1,joystick.x,joystick.y-20]]);
  const halfThrottle=await page.evaluate(()=>{const d=__BOOM__.input.drive;return d.update(Math.PI,__BOOM__.vehicle.heading).z;});
  check('Half-travel touch starts driving on pointerdown without another move',halfThrottle>.6&&halfThrottle<.7,{throttle:halfThrottle});
  await touch('touchMove',[[1,joystick.x,joystick.y-32]]);
  const fullThrottle=await page.evaluate(()=>{const d=__BOOM__.input.drive;return d.update(Math.PI,__BOOM__.vehicle.heading).z;});
  check('Eighty percent stick travel reaches full throttle',fullThrottle===1,{throttle:fullThrottle});
  await touch('touchMove',[[1,joystick.x,joystick.y-38]]);await step(page,90);
  const touchDriven=await state(page);check('Real touch joystick drives the car',Math.hypot(touchDriven.position[0],touchDriven.position[2]+6)>1&&touchDriven.speed>1);
  await touch('touchStart',[[1,joystick.x,joystick.y-38],[2,fire.x,fire.y]]);await step(page,90);
  const simultaneous=await page.evaluate(()=>({state:__BOOM__.snapshot(),driving:__BOOM__.input.drive.touchActive,firing:__BOOM__.input.padFire}));
  check('Two fingers drive and fire simultaneously',simultaneous.driving&&simultaneous.firing&&simultaneous.state.shotsFired>0);
  await touch('touchMove',[[1,joystick.x,joystick.y-38],[2,fire.x+30,fire.y]]);await step(page,40);
  const aimed=await page.evaluate(()=>({yaw:__BOOM__.combat.yaw.rotation.y,stick:__BOOM__.input.stick.toArray(),padFire:__BOOM__.input.padFire,padPointer:__BOOM__.input.padPointer}));check('Dragging the fire pad rotates the turret',Math.abs(aimed.yaw)>.2&&Math.hypot(...aimed.stick)>.5,aimed);
  const beforeBrake=(await state(page)).speed;
  await touch('touchStart',[[1,joystick.x,joystick.y-38],[2,fire.x+30,fire.y],[3,brake.x,brake.y]]);await step(page,75);
  const afterBrake=await state(page);
  check('Touch handbrake works while driving and shooting',Math.abs(afterBrake.speed)<Math.abs(beforeBrake)*.8,{before:beforeBrake,after:afterBrake.speed,position:afterBrake.position,controls:await page.evaluate(()=>({braking:__BOOM__.input.braking,player:__BOOM__.vehicle.game.player}))});
  await touch('touchCancel',[]);await step(page,1);
  check('Touch cancellation clears steering, firing and braking',await page.evaluate(()=>!__BOOM__.input.drive.touchActive&&!__BOOM__.input.padFire&&!__BOOM__.input.braking));
  await touch('touchStart',[[1,joystick.x,joystick.y],[2,fire.x,fire.y]]);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  check('Losing focus releases all held controls',await page.evaluate(()=>!__BOOM__.input.drive.touchActive&&!__BOOM__.input.padFire&&!__BOOM__.input.braking));await touch('touchCancel',[]);
  await reset(page);await page.evaluate(()=>{const b=__BOOM__;b.renderer.setAnimationLoop(()=>b.renderer.render(b.scene,b.camera));});await page.screenshot({path:path.join(root,'arena-mobile-preview.png')});report.screenshots.push('arena-mobile-preview.png');
  await page.setViewportSize({width:844,height:390});await step(page,30);await page.screenshot({path:path.join(root,'arena-landscape-preview.png')});
  report.screenshots.push('arena-landscape-preview.png');
  check('Landscape resize preserves renderer and controls',await page.evaluate(()=>__BOOM__.camera.aspect>2&&document.querySelector('#aim-pad').getBoundingClientRect().bottom<=innerHeight));
 }finally{await browser.close();}
 check('No browser runtime or asset errors',report.errors.length===0,report.errors);
 report.status='passed';report.environment='Chromium software WebGL; desktop 1280×800, touch 390×844 and landscape 844×390. No real-phone performance measurement.';
 fs.writeFileSync(path.join(root,'verification/arena-results.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{report.status='failed';report.failure=error.stack;console.log(JSON.stringify(report,null,2));process.exit(1)});
