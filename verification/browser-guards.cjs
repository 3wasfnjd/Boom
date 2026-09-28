const {chromium}=require('playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'dist');
const report={environment:'Chromium touch emulation, software WebGL; Safari gesture events dispatched synthetically. Not a physical iPhone/Safari test.',checks:[]};
const check=(name,passed,details)=>{assert.ok(passed,name+(details?' '+JSON.stringify(details):''));report.checks.push(name);console.log('PASS '+name);};

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOOM_CHROMIUM,args:JSON.parse(process.env.BOOM_CHROMIUM_ARGS||'[]')});
 let release;
 const gate=new Promise(resolve=>release=resolve);
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://boom.test/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname.endsWith('heightfield.bin'))await gate;
   const file=path.join(runtime,pathname==='/'?'index.html':pathname);
   if(!fs.existsSync(file))return route.fulfill({status:404,body:'Missing'});
   const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm','.webp':'image/webp','.png':'image/png','.glb':'model/gltf-binary'};
   await route.fulfill({path:file,contentType:types[path.extname(file)]||'application/octet-stream'});
  });
  await page.goto('http://boom.test/?debug=1&offline=1',{waitUntil:'domcontentloaded'});
  check('Loading artwork is protected before the game is ready',await page.evaluate(()=>{
   const image=document.querySelector('.load-artwork');
   return !window.__BOOM__&&!image.dispatchEvent(new Event('contextmenu',{bubbles:true,cancelable:true}))&&!image.dispatchEvent(new Event('gesturestart',{bubbles:true,cancelable:true}));
  }));
  release();await page.waitForFunction(()=>window.__BOOM__&&document.getElementById('loading').hidden,null,{timeout:45000});
  await page.evaluate(()=>{__BOOM__.pause();__BOOM__.step(60);});
  const cdp=await page.context().newCDPSession(page);
  const touch=async(type,points)=>{
   await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,force:1,radiusX:5,radiusY:5}))});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  };
  const controls=()=>page.evaluate(()=>{const b=__BOOM__,d=b.input.drive.update(0,0);return {x:d.x,z:d.z,active:d.touchActive,fire:b.input.padFire,brake:b.input.braking,shots:b.combat.shotsFired,scale:visualViewport.scale,scrollX,scrollY};});
  const center=selector=>page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
  for(const [label,width,height] of [['portrait',390,844],['landscape',844,390]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>{__BOOM__.reset();__BOOM__.step(60);});
   const drive=await center('.drive-stick'),fire=await center('#aim-pad'),brake=await center('#brake');
   const scale=(await controls()).scale;
   await touch('touchStart',[[1,drive.x,drive.y]]);
   await touch('touchMove',[[1,drive.x-24,drive.y-48]]);
   await touch('touchStart',[[2,fire.x,fire.y]]);
   await touch('touchMove',[[1,drive.x-24,drive.y-48],[2,fire.x+25,fire.y]]);
   const before=await controls();await page.evaluate(()=>__BOOM__.step(60));const both=await controls();
   check(label+': two fingers accelerate, steer and fire',both.active&&both.z===1&&both.x>0&&both.fire&&both.shots>before.shots);
   check(label+': two-finger movement leaves viewport scale and scroll unchanged',both.scale===scale&&both.scrollX===0&&both.scrollY===0);
   // Chromium's native touch path takes the released points for a partial end.
   await touch('touchEnd',[[2,fire.x+25,fire.y]]);const driving=await controls();
   check(label+': lifting firing finger keeps driving',driving.active&&driving.z===1&&!driving.fire,driving);
   await touch('touchStart',[[2,fire.x,fire.y]]);
   await touch('touchEnd',[[1,drive.x-24,drive.y-48]]);const firing=await controls();
   check(label+': lifting driving finger keeps firing',!firing.active&&firing.z===0&&firing.fire,firing);
   await touch('touchEnd',[]);
   await touch('touchStart',[[2,fire.x,fire.y]]);
   await touch('touchStart',[[1,drive.x,drive.y]]);
   await touch('touchMove',[[2,fire.x,fire.y],[1,drive.x,drive.y+48]]);
   const reverse=await controls();check(label+': firing first still allows reverse with a second finger',reverse.z===-1&&reverse.fire);
   await touch('touchStart',[[3,brake.x,brake.y]]);
   check(label+': third finger can apply the handbrake',(await controls()).brake);
   await touch('touchCancel',[]);const cancelled=await controls();
   check(label+': cancellation clears all touch controls',!cancelled.active&&!cancelled.fire&&!cancelled.brake);
  }
  check('Game blocks selection, image dragging, context menus and synthetic Safari gestures',await page.evaluate(()=>{
   const target=document.getElementById('game');
   return ['selectstart','dragstart','contextmenu','dblclick','gesturestart','gesturechange','gestureend'].every(type=>!target.dispatchEvent(new Event(type,{bubbles:true,cancelable:true})));
  }));
  await page.locator('#room-button').tap();
  check('Room button still opens the dialog by touch',await page.locator('#room-dialog').evaluate(e=>e.open));
  check('All writing fields use at least 16px and allow native selection',await page.locator('#room-dialog input').evaluateAll(fields=>fields.every(e=>{const style=getComputedStyle(e);return parseFloat(style.fontSize)>=16&&style.userSelect==='text'&&e.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true}))&&e.dispatchEvent(new Event('contextmenu',{bubbles:true,cancelable:true}));})));
  const name=page.locator('#player-name');await name.fill('');await name.tap();await page.keyboard.type('w asd r123');
  const typing=await page.evaluate(()=>{
   const b=__BOOM__,name=document.getElementById('player-name'),d=b.input.drive.update(0,0);
   return {value:name.value,car:b.snapshot().car,x:d.x,z:d.z,fire:b.input.read(0).fire};
  });
  check('Typing spaces and car shortcuts edits the name without controlling the car',typing.value==='w asd r123'&&typing.car==='h9'&&typing.x===0&&typing.z===0&&!typing.fire,typing);
  await page.locator('#room-name').fill('abc');
  await page.locator('#room-name').evaluate(e=>e.setSelectionRange(0,0));await page.keyboard.press('ArrowRight');
  check('Arrow keys can move the text cursor',await page.locator('#room-name').evaluate(e=>e.selectionStart===1));
  await page.evaluate(()=>document.activeElement.blur());
  const dialog=await page.locator('#room-dialog').boundingBox();
  await touch('touchStart',[[1,dialog.x+8,dialog.y+dialog.height-40]]);
  await touch('touchMove',[[1,dialog.x+8,dialog.y+dialog.height-130]]);await touch('touchEnd',[]);
  check('Room dialog can scroll in landscape',await page.locator('#room-dialog').evaluate(e=>e.scrollHeight<=e.clientHeight||e.scrollTop>0));
  await page.locator('#close-room').tap();
  check('Room dialog still closes by touch',await page.locator('#room-dialog').evaluate(e=>!e.open));
  check('No browser runtime errors',errors.length===0);
  console.log(JSON.stringify({status:'passed',...report},null,2));
 }finally{release();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
