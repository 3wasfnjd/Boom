const {chromium}=require('playwright'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOOM_CHROMIUM,args:JSON.parse(process.env.BOOM_CHROMIUM_ARGS||'[]')});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://boom.test/**',route=>{const p=new URL(route.request().url()).pathname,file=path.join(__dirname,'../dist',p==='/'?'index.html':p);return route.fulfill({path:file,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.wasm':'application/wasm','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});});
  await page.goto('http://boom.test/?offline=1&debug=1');await page.waitForFunction(()=>window.__BOOM__,null,{timeout:45000});
  const health=await page.evaluate(()=>{const g=__BOOM__,b=g.battle;g.pause();const room=b.local,self=room.players.get(b.id);self.hp=23;g.step(5);const before=b.healthText.textContent;room.targetDamage(room.targets[0],100,self.id);g.step(5);const after=b.healthText.textContent;const peer=room.join({name:'خصم',body:'h9'});room.players.get(peer.id).hp=31;room.targetDamage(room.targets[1],100,peer.id);g.step(8);return {before,after,destroyed:!g.arena.targets[0].active,otherHealth:b.remotes.get(peer.id).hp};});
  assert.deepEqual(health,{before:'23 / 100',after:'100 / 100',destroyed:true,otherHealth:100});console.log('PASS supply destruction updates the local HUD and remote health');
  for(const [width,height] of [[390,844],[844,390]]){
   await page.setViewportSize({width,height});
   const result=await page.evaluate(()=>{
    const g=__BOOM__,b=g.battle;g.step(3);g.camera.updateMatrixWorld();const r=[...b.remotes.values()][0],origin=g.vehicle.container.position.clone(),forward=origin.clone();g.camera.getWorldDirection(forward);forward.y=0;forward.normalize();const right=origin.clone().setFromMatrixColumn(g.camera.matrixWorld,0);right.y=0;right.normalize();const checks={};
    for(const [name,axis,sign] of [['right',right,1],['left',right,-1],['behind',forward,-1]]){
     r.locator.update(origin.clone().addScaledVector(axis,60*sign),origin,g.camera,r.data.name,true);const el=r.locator.element,rect=el.getBoundingClientRect(),x=parseFloat(el.style.left),y=parseFloat(el.style.top);
     checks[name]=!el.hidden&&(name==='right'?x>innerWidth/2:name==='left'?x<innerWidth/2:y>innerHeight/2)&&rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight&&getComputedStyle(el).pointerEvents==='none'&&r.locator.distance.textContent==='60 م';
    }
    r.locator.update(origin,origin,g.camera,r.data.name,true);checks.onscreen=r.locator.element.hidden;
    r.locator.update(origin.clone().addScaledVector(right,60),origin,g.camera,r.data.name,false);checks.dead=r.locator.element.hidden;return checks;
   });
   assert.ok(Object.values(result).every(Boolean),JSON.stringify({width,height,result}));console.log('PASS '+width+'x'+height+' locator bearings, bounds, distance, on-screen and dead-player visibility');
  }
  const cleanup=await page.evaluate(()=>{const b=__BOOM__.battle;for(const id of [...b.remotes.keys()]){b.local.players.delete(id);b.removeRemote(id);}return document.querySelectorAll('.player-locator').length;});assert.equal(cleanup,0);console.log('PASS disconnect cleanup');
  const volley=await page.evaluate(async()=>{const g=__BOOM__;await g.selectCar('datsun');g.reset();let accepted=0;const b=g.battle,original=b.local.broadcast;b.local.broadcast=e=>{if(e.type==='shot'&&e.shot.owner===b.id)accepted++;original(e);};g.step(1,{drive:{x:0,z:0},mode:'assist',fire:true});g.step(70,{drive:{x:0,z:0},mode:'assist',fire:false});return {visual:g.combat.shotsFired,accepted,pending:g.combat.burstRemaining};});
  assert.deepEqual(volley,{visual:6,accepted:6,pending:0});assert.equal(await page.evaluate(()=>__BOOM__.combat.shots.filter(s=>s.kind==='rockets').length),72);console.log('PASS one brief press produces exactly six visible and server-accepted rockets; multiplayer rocket pool stays bounded');
  await page.locator('#room-button').tap();await page.locator('#close-room').tap();await page.waitForFunction(()=>__BOOM__.combat.audio?.state==='running'&&__BOOM__.combat.music?.step>0);
  const audio=await page.evaluate(()=>{const g=__BOOM__;g.atmosphere.setOverride({rain:1});g.atmosphere.audioUnlocked=true;g.step(1);return {music:g.combat.music.timer!==null,rain:g.atmosphere.audio.volume};});
  assert.equal(audio.music,true);assert.equal(audio.rain,.04);assert.deepEqual(errors,[]);console.log('PASS music starts on interaction, rain peaks at 4%, and no runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
