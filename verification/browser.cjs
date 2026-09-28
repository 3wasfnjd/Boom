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
 await page.goto('http://boom.test/?debug=1&offline=1');await page.waitForFunction(()=>window.__BOOM__,null,{timeout:30000});
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
   check(`${id}: projectile and effect pools stay bounded`,retained.shots===120&&retained.effects===72,retained);
  }
  await page.click('[data-car="h9"]');await page.waitForFunction(()=>__BOOM__.snapshot().car==='h9');await reset(page);
  const targetPoint=await page.evaluate(()=>{const p=__BOOM__.arena.targets[0].position.clone().project(__BOOM__.camera);return {x:(p.x*.5+.5)*innerWidth,y:(-p.y*.5+.5)*innerHeight};});
  await page.mouse.move(targetPoint.x,targetPoint.y);await page.mouse.down();await step(page,180);await page.mouse.up();
  check('Mouse world aiming damages the pointed target',!(await state(page)).targets[0].active);
  await reset(page);
  await page.evaluate(()=>{const bounds=__BOOM__.arena.targets[0].bounds.clone();bounds.min.set(-3,0,1);bounds.max.set(3,4,1.2);__BOOM__.arena.blockers.push({kind:'wall',active:true,bounds});__BOOM__.battle.local.world.blockers.push({kind:'wall',active:true,bounds});});
  await page.mouse.move(targetPoint.x,targetPoint.y);await page.mouse.down();await step(page,240);await page.mouse.up();
  check('A wall between muzzle and target blocks actual gun damage',(await state(page)).targets[0].health===100);
  await page.evaluate(()=>{__BOOM__.arena.blockers.pop();__BOOM__.battle.local.world.blockers.pop();});
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
  const hitRects=await page.evaluate(()=>['.drive-stick','#aim-pad','#brake'].map(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};}));
  const [joystick,fire,brake]=hitRects;
  check('Portrait drive area stays clear of firing and braking buttons',await page.evaluate(()=>document.querySelector('.drive-zone').getBoundingClientRect().right<document.querySelector('#brake').getBoundingClientRect().left));
  const cdp=await page.context().newCDPSession(page);
  const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,force:1,radiusX:5,radiusY:5}))});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  const drive=()=>page.evaluate(()=>__BOOM__.input.drive.update(0,0));
  await touch('touchStart',[[1,joystick.x+20,joystick.y-20]]);
  check('Floating stick starts neutral at the actual touch point',await page.evaluate(({x,y})=>{const d=__BOOM__.input.drive,r=d.base.getBoundingClientRect();return d.update(0,0).z===0&&d.update(0,0).x===0&&Math.abs(r.x+r.width/2-x)<1&&Math.abs(r.y+r.height/2-y)<1;},{x:joystick.x+20,y:joystick.y-20}));
  await touch('touchEnd',[]);await touch('touchStart',[[1,joystick.x,joystick.y]]);
  await touch('touchMove',[[1,joystick.x+2,joystick.y-2]]);
  check('Small thumb jitter stays inside the neutral zone',(await drive()).z===0&&(await drive()).x===0);
  await touch('touchMove',[[1,joystick.x,joystick.y-24]]);const partial=await drive();
  check('Half drag provides partial throttle',partial.z>.3&&partial.z<.6,partial);
  await touch('touchMove',[[1,joystick.x+24,joystick.y-48]]);const diagonal=await drive();
  check('Full throttle can combine with a gentle right turn',diagonal.z===1&&diagonal.x<-.2&&diagonal.x>-.6,diagonal);
  await touch('touchMove',[[1,joystick.x,joystick.y-48]]);await step(page,90);
  const moving=await state(page);check('Real floating-stick touch accelerates the car',moving.speed>1&&moving.position[2]>-5);
  await touch('touchEnd',[]);const released=await drive();await step(page,240);const stopped=await state(page);
  check('Releasing the stick clears throttle and existing idle brakes slow the car',released.z===0&&!released.touchActive&&Math.abs(stopped.speed)<Math.abs(moving.speed)*.25,{before:moving.speed,after:stopped.speed});
  await reset(page);await touch('touchStart',[[1,joystick.x,joystick.y]]);await touch('touchMove',[[1,joystick.x,joystick.y-48]]);await step(page,60);
  const forwardSpeed=(await state(page)).speed;
  await touch('touchMove',[[1,joystick.x,joystick.y+48]]);await step(page,2);const brakeSpeed=(await state(page)).speed;await step(page,180);
  check('Pulling down brakes forward motion before reversing',forwardSpeed>1&&brakeSpeed>=0&&brakeSpeed<forwardSpeed&&(await state(page)).speed<0,{forwardSpeed,brakeSpeed,reverse:(await state(page)).speed});
  await touch('touchEnd',[]);await reset(page);
  await touch('touchStart',[[1,joystick.x,joystick.y],[2,fire.x,fire.y]]);
  await touch('touchMove',[[1,joystick.x-24,joystick.y-48],[2,fire.x+30,fire.y]]);await step(page,60);
  check('Two fingers steer, accelerate and aim/fire at the same time',await page.evaluate(()=>{const b=__BOOM__,d=b.input.drive.update(0,0);return d.x>0&&d.z===1&&b.input.padFire&&b.input.stick.x>.5&&b.combat.shotsFired>0&&Math.abs(b.vehicle.heading)>.1;}));
  await touch('touchStart',[[1,joystick.x-24,joystick.y-48],[2,fire.x+30,fire.y],[3,brake.x,brake.y]]);await step(page,90);
  check('Touch handbrake overrides the driving stick',await page.evaluate(()=>__BOOM__.vehicle.game.player.braking===1&&__BOOM__.vehicle.game.player.accelerating===0));
  await touch('touchCancel',[]);await step(page,1);
  check('Touch cancellation releases driving, shooting and braking',await page.evaluate(()=>!__BOOM__.input.drive.touchActive&&!__BOOM__.input.padFire&&!__BOOM__.input.braking));
  await touch('touchStart',[[1,joystick.x,joystick.y],[2,fire.x,fire.y]]);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  check('Losing focus releases both fingers',await page.evaluate(()=>!__BOOM__.input.drive.touchActive&&!__BOOM__.input.padFire));await touch('touchCancel',[]);
  await touch('touchStart',[[1,joystick.x,joystick.y]]);await touch('touchMove',[[1,joystick.x,joystick.y-48]]);await page.click('#room-button');await page.click('#close-room');
  check('Opening the room dialog clears driving input',!(await drive()).touchActive);await touch('touchCancel',[]);
  check('Chase camera stays behind at all four headings and aiming follows screen right',await page.evaluate(()=>{const b=__BOOM__;for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2]){b.teleport(0,-6,heading);b.step(2);const off=b.camera.position.clone().sub(b.vehicle.container.position);if(off.x*Math.sin(b.vehicle.heading)+off.z*Math.cos(b.vehicle.heading)>-8)return false;b.input.padFire=true;b.input.stick.set(1,0);const aim=b.input.read(b.worldAngle,b.vehicle.heading).aim,right=b.camera.position.clone().setFromMatrixColumn(b.camera.matrixWorld,0).setY(0).normalize();if(aim.x*right.x+aim.y*right.z<.999)return false;}b.input.release();return true;}));
  check('Camera crosses the angle boundary smoothly without a full spin',await page.evaluate(()=>{const b=__BOOM__;b.teleport(0,-6,Math.PI-.02);const before=b.cameraHeading;b.vehicle.reset(...b.vehicle.container.position.toArray(),-Math.PI+.02);b.step(1);return Math.abs(b.cameraHeading-before)<.05;}));
  check('Reverse driving does not flip the camera in front of the car',await page.evaluate(()=>{const b=__BOOM__;b.teleport(0,-6,0);b.step(80,{drive:{x:0,z:-1},mode:'assist',fire:false});const off=b.camera.position.clone().sub(b.vehicle.container.position);return b.vehicle.linearSpeed<0&&off.z< -8&&Math.abs(b.cameraHeading)<.05;}));
  check('Local highlight exists once and follows every car',await page.evaluate(async()=>{const b=__BOOM__;for(const id of ['h9','shas','datsun']){await b.selectCar(id);b.step(1);if(!b.playerHighlight.group.position.equals(b.vehicle.container.position))return false;}return b.scene.children.filter(n=>n.name==='local-player-highlight').length===1;}));
  check('Highlight hides on death and returns on respawn',await page.evaluate(()=>{const b=__BOOM__;b.battle.setDead(true);b.playerHighlight.update(b.vehicle.container,0);const hidden=!b.playerHighlight.group.visible;b.battle.setDead(false);b.playerHighlight.update(b.vehicle.container,0);return hidden&&b.playerHighlight.group.visible;}));
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
