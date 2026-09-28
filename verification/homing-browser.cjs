const {chromium}=require('playwright'),{spawn}=require('node:child_process'),{once}=require('node:events'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=spawn(process.execPath,['server/local.mjs'],{cwd:root,env:{...process.env,PORT:'8788'},stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  await Promise.race([once(server.stdout,'data'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Local server startup timed out')),10000);timer.unref();})]);
  browser=await chromium.launch({headless:true,executablePath:process.env.BOOM_CHROMIUM,args:JSON.parse(process.env.BOOM_CHROMIUM_ARGS||'[]')});const pages=[],errors=[];
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
   await page.route('http://boom.test/**',route=>{const p=new URL(route.request().url()).pathname,file=path.join(root,'dist',p==='/'?'index.html':p);return route.fulfill({path:file,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.wasm':'application/wasm','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream'});});
   await page.goto('http://boom.test/?debug=1&server=http://127.0.0.1:8788&room=homing-test');await page.waitForFunction(()=>window.__BOOM__?.battle.ready,null,{timeout:45000});
   await page.evaluate(()=>{const g=__BOOM__;g.pause();g.testEvents=[];const receive=g.battle.receive.bind(g.battle);g.battle.receive=m=>{if(['homing-launch','homing-end','damage'].includes(m.type))g.testEvents.push(structuredClone(m));receive(m);};});
  }
  const [a,b]=pages,advance=async ms=>{const end=Date.now()+ms;while(Date.now()<end){for(const page of pages)if(!page.isClosed())await page.evaluate(()=>__BOOM__.step(3,{drive:{x:0,z:0,handbrake:true},mode:'assist',fire:false}));await new Promise(r=>setTimeout(r,35));}};
  await advance(2300);assert.equal(await a.locator('#homing-fire').isDisabled(),true);
  await a.locator('.player-tag > button:visible,.locator-target:visible').first().tap();
  assert.equal(await a.locator('#homing-fire').isEnabled(),true);assert.equal(await a.evaluate(()=>[...__BOOM__.battle.remotes.values()].filter(r=>r.name.getAttribute('aria-pressed')==='true').length),1);console.log('PASS touch selects one enemy and enables the dedicated missile button');
  for(const [width,height] of [[390,844],[844,390]]){await a.setViewportSize({width,height});await advance(120);const fits=await a.evaluate(()=>{const r=document.getElementById('homing-fire').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&['aim-pad','brake','drop-crate'].every(id=>{const t=document.getElementById(id).getBoundingClientRect();return r.right<=t.left||r.left>=t.right||r.bottom<=t.top||r.top>=t.bottom;});});assert.equal(fits,true);console.log('PASS '+width+'x'+height+' missile button fits without overlapping existing controls');}
  await a.setViewportSize({width:390,height:844});await advance(100);
  const cdp=await a.context().newCDPSession(a),point=async selector=>a.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}),drive=await point('.drive-stick'),fire=await point('#homing-fire');
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,force:1,radiusX:5,radiusY:5}))});
  await touch('touchStart',[[1,drive.x,drive.y]]);await touch('touchStart',[[2,fire.x,fire.y]]);await touch('touchEnd',[[2,fire.x,fire.y]]);
  assert.equal(await a.evaluate(()=>__BOOM__.input.drive.touchActive),true);await touch('touchEnd',[]);await advance(150);
  const states=await Promise.all(pages.map(p=>p.evaluate(()=>({ids:[...__BOOM__.battle.homing.items.keys()],events:__BOOM__.testEvents.filter(e=>e.type==='homing-launch'),y:[...__BOOM__.battle.homing.items.values()][0]?.target.y,carY:__BOOM__.vehicle.container.position.y}))));
  assert.equal(states[0].ids.length,1);assert.deepEqual(states[0].ids,states[1].ids);assert.ok(states[0].y>states[0].carY+2);assert.equal(states[0].events.length,1);assert.equal(await a.locator('#homing-fire').isDisabled(),true);console.log('PASS launch while driving; both browser sessions see the same rising missile and cooldown');
  await a.evaluate(()=>{const b=__BOOM__.battle;b.send({type:'homing',targetId:b.selectedTarget});});await advance(2700);
  const damage=await b.evaluate(()=>({hp:__BOOM__.battle.self.hp,damage:__BOOM__.testEvents.filter(e=>e.type==='damage').length,missiles:__BOOM__.battle.homing.items.size}));
  assert.ok(damage.hp<100);assert.equal(damage.damage,1);assert.equal(damage.missiles,0);assert.equal(await a.evaluate(()=>__BOOM__.testEvents.filter(e=>e.type==='homing-launch').length),1);console.log('PASS selected enemy takes one authoritative hit; duplicate launch rejected and missile removed');
  await b.close();await advance(150);assert.equal(await a.evaluate(()=>__BOOM__.battle.selectedTarget),null);assert.equal(await a.locator('#homing-fire').isDisabled(),true);assert.deepEqual(errors,[]);console.log('PASS disconnect clears lock; no browser runtime errors');
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});
