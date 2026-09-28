const {chromium}=require('playwright'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),checks=[];
const check=(label,value)=>{assert.ok(value,label);checks.push(label);console.log(label)};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOOM_CHROMIUM,args:JSON.parse(process.env.BOOM_CHROMIUM_ARGS||'[]')});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});let release;const gate=new Promise(r=>release=r);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const serve=async(route,fail=false)=>{const p=new URL(route.request().url()).pathname; if(p.endsWith('heightfield.bin'))await gate;if(fail&&p.endsWith('motri-h9-combat.glb'))return route.abort();const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary'};return route.fulfill({path:path.join(root,p==='/'?'index.html':p),contentType:types[path.extname(p)]||(p==='/'?'text/html':'application/octet-stream')});};
 await page.route('http://boom.test/**',r=>serve(r));await page.goto('http://boom.test/?offline=1&debug=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>Number(document.querySelector('#loading-progress').getAttribute('aria-valuenow'))>=80);
 check('Progress waits for required terrain',await page.locator('#loading-progress').getAttribute('aria-valuenow')<100);
 await page.evaluate(()=>{window.progressValues=[];new MutationObserver(()=>progressValues.push(Number(document.querySelector('#loading-progress').getAttribute('aria-valuenow')))).observe(document.querySelector('#loading-progress'),{attributes:true,attributeFilter:['aria-valuenow']});});
 for(const [label,width,height] of [['mobile',390,844],['small',320,568],['approved-ratio',471,836],['landscape',844,390],['desktop',1280,800]]){
 console.log('Viewport',label);await page.setViewportSize({width,height});await page.screenshot({path:path.join(root,'verification/loading-'+label+'.png'),animations:'disabled'});
 const bounds=await page.locator('.load-hud').boundingBox();check(label+' loading HUD fits viewport',bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height);
 check(label+' approved artwork loaded',await page.locator('.load-artwork').evaluate(i=>i.complete&&i.naturalWidth===941&&i.naturalHeight===1672));
 }
 release();await page.waitForFunction(()=>window.__BOOM__,null,{timeout:45000});check('Startup reaches 100%',await page.locator('#loading-progress').getAttribute('aria-valuenow')==='100');check('Rail pointer reaches the end',await page.locator('#loading-progress').evaluate(e=>e.style.getPropertyValue('--progress')==='100%'));check('Loading exits when game ready',await page.locator('#loading').isHidden());check('Progress never decreases',await page.evaluate(()=>progressValues.every((n,i)=>!i||n>=progressValues[i-1])));check('No runtime errors',errors.length===0);await page.evaluate(()=>__BOOM__.pause());
 const failed=await browser.newPage({viewport:{width:390,height:844}});await failed.route('http://boom.test/**',r=>serve(r,true));await failed.goto('http://boom.test/?offline=1',{waitUntil:'domcontentloaded'});await failed.locator('#retry').waitFor({state:'visible'});await failed.waitForLoadState('networkidle');check('Failed loading stays visible',await failed.locator('#loading').isVisible());check('Error message survives remaining asset completions',(await failed.locator('#loading-message').textContent()).includes('تعذر'));check('Failed load does not report ready',await failed.locator('#loading-progress').getAttribute('aria-valuenow')<100);
 console.log(JSON.stringify({status:'passed',checks},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
