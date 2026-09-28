import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {PhysicsWorld,loadPhysics} from './PhysicsWorld.js';
import {MotriVehicle} from './MotriVehicle.js';
import {Arena,SPAWN} from './Arena.js';
import {CombatInput} from './CombatInput.js';
import {CombatSystem,WEAPONS} from './CombatSystem.js';
import {BattleClient} from './BattleClient.js';
import {FixedStepClock} from './FixedStepClock.js';
import {PlayerHighlight} from './PlayerHighlight.js';
import {MotriAtmosphere} from './MotriAtmosphere.js';

const loading=document.getElementById('loading'),message=document.getElementById('loading-message');
// Sixteen completed startup jobs, not a time-based or estimated byte counter.
let loadedJobs=0;
function loadingProgress(){
 if(loading.classList.contains('load-error'))return;
 const percent=Math.min(100,Math.round(++loadedJobs/16*100));
 document.getElementById('loading-fill').style.width=percent+'%';document.getElementById('loading-percent').textContent=percent+'%';
 document.getElementById('loading-progress').setAttribute('aria-valuenow',String(percent));
 message.textContent=percent===100?'جاهزين… انطلق!':percent<25?'تشغيل المحركات…':percent<65?'تجهيز السيارات والأسلحة…':'تجهيز ساحة المطاردة…';
 loading.classList.toggle('load-ready',percent===100);
}
const loadingJob=promise=>promise.then(value=>{loadingProgress();return value;});
async function start() {
  const renderer=new THREE.WebGLRenderer({canvas:document.getElementById('game'),antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#d0b18a');scene.fog=new THREE.Fog('#d0b18a',48,110);
  const camera=new THREE.PerspectiveCamera(49,innerWidth/innerHeight,.08,130);
  const ambient=new THREE.HemisphereLight('#e7eff4','#897451',2.4);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#fff1cc',3.4);sun.position.set(-10,17,-6);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=sun.shadow.camera.bottom=-16;sun.shadow.camera.right=sun.shadow.camera.top=16;
  sun.shadow.camera.near=.1;sun.shadow.camera.far=45;sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;scene.add(sun,sun.target);
  const cameraOffset=new THREE.Vector3(0,6.8,-10.8),follow=new THREE.Vector3(SPAWN[0],.3,SPAWN[2]),lookTarget=new THREE.Vector3(),projected=new THREE.Vector3();
  let worldAngle=Math.PI,cameraHeading=0;
  const resize=()=>{renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();};
  window.addEventListener('resize',resize);resize();
  await loadingJob(loadPhysics());const world=new PhysicsWorld();
  const decoder=new DRACOLoader().setDecoderPath(new URL('vendor/draco/',document.baseURI).href).setDecoderConfig({type:'wasm'}).setWorkerLimit(1);
  const loader=new GLTFLoader().setDRACOLoader(decoder),cache=new Map();
  const loadCar=id=>{if(!cache.has(id))cache.set(id,loader.loadAsync(new URL(`models/motri-${id}-combat.glb`,document.baseURI).href).catch(error=>{cache.delete(id);throw error;}));return cache.get(id);};
  const worldModels={house:'rest-house',scenery:'scenery',fence:'fence',brick:'brick',lamp:'lamp',oak:'oak'},worldAssets={};
  const textures=new THREE.TextureLoader();
  const worldLoading=Promise.all([
    ...Object.entries(worldModels).map(async([key,file])=>{worldAssets[key]=(await loadingJob(loader.loadAsync(new URL(`models/world/motri-${file}.glb`,document.baseURI).href))).scene;}),
    ...[['palette','png'],['paving','webp'],['terrain','png'],['slabs','png'],['foliage','png']].map(async([key,extension])=>{worldAssets[key]=await loadingJob(textures.loadAsync(new URL(`models/world/motri-${key}.${extension}`,document.baseURI).href));}),
    loadingJob(fetch(new URL('models/world/motri-heightfield.bin',document.baseURI)).then(response=>{if(!response.ok)throw Error('Terrain data unavailable');return response.arrayBuffer();}).then(data=>{worldAssets.heightfield=data;}))
  ]);
  const [firstCar,crate]=await Promise.all([loadingJob(loadCar('h9')),loadingJob(loader.loadAsync(new URL('models/world/motri-crate.glb',document.baseURI).href)),worldLoading]);decoder.dispose();
  const arena=new Arena(scene,world,crate.scene,worldAssets),vehicle=new MotriVehicle(world,scene),input=new CombatInput(renderer.domElement);
  const atmosphere=new MotriAtmosphere({scene,renderer,environment:arena.environment,sun,ambient});
  const playerHighlight=new PlayerHighlight(scene,arena.environment.terrain);
  let battle=null;
  let id='h9',hits=0,hitFlash=0,selection=0,paused=false;
  const aimMark=document.getElementById('aim-mark'),hitMark=document.getElementById('hit-mark'),hitCount=document.getElementById('hit-count'),hint=document.getElementById('hint');
  if('ontouchstart' in window)hint.textContent='اسحب يسار الشاشة للقيادة · فوق بنزين وتحت ريوس · يمين للإطلاق';
  const combat=new CombatSystem(scene,arena,()=>{hits++;hitFlash=.15;hitCount.textContent=`إصابات ${hits.toLocaleString('ar')}`;});
  function installCar(gltf,nextId) {
    vehicle.setModel(gltf.scene);id=nextId;if(battle)battle.car=id;
    combat.bind(vehicle,id);document.getElementById('weapon-name').textContent=WEAPONS[id].label;
    document.querySelectorAll('[data-car]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.car===id)));
  }
  installCar(firstCar,'h9');vehicle.reset(...SPAWN);
  async function selectCar(nextId) {
    if(!WEAPONS[nextId])return;const token=++selection;
    document.querySelectorAll('[data-car]').forEach(button=>button.disabled=button.dataset.car===nextId);
    try {const gltf=await loadCar(nextId);if(token!==selection)return;installCar(gltf,nextId);}
    catch(error){if(token===selection){hint.textContent='تعذر تحميل السيارة. اضغط اسمها للمحاولة مجددًا.';hint.style.opacity=1;}console.error(error);}
    finally{if(token===selection)document.querySelectorAll('[data-car]').forEach(button=>button.disabled=false);}
  }
  function reset() {
    if(battle?.online){battle.recover();return;}
    input.release();vehicle.reset(...SPAWN);
    combat.clear();arena.reset();hits=0;hitFlash=0;hitCount.textContent='إصابات ٠';follow.set(SPAWN[0],.3,SPAWN[2]);moveCamera(1);battle?.resetSolo();
  }
  document.getElementById('reset').addEventListener('click',reset);
  document.querySelectorAll('[data-car]').forEach(button=>button.addEventListener('click',()=>selectCar(button.dataset.car)));
  window.addEventListener('keydown',event=>{if(event.repeat)return;if(event.code==='KeyR')reset();const car={Digit1:'h9',Digit2:'shas',Digit3:'datsun'}[event.code];if(car)selectCar(car);});
  function moveCamera(dt) {
    const velocity=vehicle.body.linvel(),heading=vehicle.heading;
    const delta=Math.atan2(Math.sin(heading-cameraHeading),Math.cos(heading-cameraHeading));
    cameraHeading=dt>=.5?heading:cameraHeading+delta*(1-Math.exp(-5*dt));
    const distance=camera.aspect<.85?10.7:10.8,height=camera.aspect<.85?7.5:6.8;
    cameraOffset.set(-Math.sin(cameraHeading)*distance,height,-Math.cos(cameraHeading)*distance);
    lookTarget.copy(vehicle.container.position);lookTarget.y+=.3;
    lookTarget.x+=THREE.MathUtils.clamp(velocity.x*.06,-1.2,1.2);lookTarget.z+=THREE.MathUtils.clamp(velocity.z*.06,-1.2,1.2);
    follow.lerp(lookTarget,1-Math.exp(-7*dt));camera.position.copy(follow).add(cameraOffset);
    camera.position.y=Math.max(camera.position.y,arena.environment.terrain.heightAt(camera.position.x,camera.position.z)+2);
    camera.lookAt(follow);camera.updateMatrixWorld();worldAngle=Math.atan2(camera.position.x-follow.x,camera.position.z-follow.z);
  }
  function tick(controls) {
    const dt=1/60;
    if(battle&&(!battle.canAct||document.getElementById('room-dialog').open))controls={...controls,fire:false,drive:{x:0,z:0,handbrake:true}};
    if(!battle||battle.self?.hp!==0){vehicle.preStep(controls.drive,dt);world.step();vehicle.postStep(dt);}else world.step();
    battle?.update(dt);if(vehicle.container.position.y< -5)reset();moveCamera(dt);arena.update(dt,camera);combat.update(dt,controls,camera);hitFlash=Math.max(0,hitFlash-dt);
  }
  function draw() {
    playerHighlight.update(vehicle.container,performance.now()/1000);playerHighlight.faceCamera(camera);
    atmosphere.update(camera,vehicle.container.position,(Date.now()+(battle?.online?battle.serverOffset:0))/1000);
    projected.copy(combat.aimPoint).project(camera);
    const visible=projected.z>-1&&projected.z<1&&Math.abs(projected.x)<.98&&Math.abs(projected.y)<.96;
    aimMark.style.display=visible?'block':'none';aimMark.style.left=`${(projected.x*.5+.5)*innerWidth}px`;aimMark.style.top=`${(-projected.y*.5+.5)*innerHeight}px`;aimMark.classList.toggle('locked',!!combat.lockedTarget);
    hitMark.style.opacity=String(Math.min(1,hitFlash*12));hitMark.style.left=aimMark.style.left;hitMark.style.top=aimMark.style.top;
    renderer.render(scene,camera);
  }
  battle=new BattleClient({scene,world,arena,vehicle,combat,input,camera,loadCar,selectCar});combat.network=battle;await battle.start();
  moveCamera(1);tick(input.read(worldAngle,vehicle.heading));draw();loadingProgress();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  loading.classList.add('load-exit');await new Promise(resolve=>setTimeout(resolve,240));loading.hidden=true;
  let last=performance.now();const clock=new FixedStepClock();
  renderer.setAnimationLoop(now=>{
    const elapsed=(now-last)/1000;last=now;
    if(document.hidden||paused){clock.reset();return;}
    clock.advance(elapsed,()=>tick(input.read(worldAngle,vehicle.heading)));draw();
  });
  // The diagnostics API is opt-in and kept out of the player's interface.
  if(new URLSearchParams(location.search).has('debug'))window.__BOOM__={
    get vehicle(){return vehicle;},get body(){return vehicle.body;},scene,arena,combat,input,world,camera,renderer,clock,battle,atmosphere,playerHighlight,selectCar,reset,get cameraHeading(){return cameraHeading;},get worldAngle(){return worldAngle;},
    teleport(x,z,angle=0){reset();vehicle.reset(x,arena.environment.terrain.heightAt(x,z)+SPAWN[1],z,angle);if(battle.local){const p=battle.local.players.get(battle.id);p.p=vehicle.container.position.toArray();p.q=vehicle.container.quaternion.toArray();p.shieldUntil=0;}follow.copy(vehicle.container.position);moveCamera(1);},
    pause(value=true){paused=value;},
    step(frames=1,controls){for(let i=0;i<frames;i++)tick(controls||input.read(worldAngle,vehicle.heading));draw();},
    snapshot(){return {car:id,position:vehicle.container.position.toArray(),speed:vehicle.linearSpeed,yaw:vehicle.heading,hits,shotsFired:combat.shotsFired,activeShots:combat.shots.filter(shot=>shot.active).length,targets:arena.targets.map(t=>({id:t.id,health:t.health,active:t.active})),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,memory:{...renderer.info.memory},environment:arena.environment.stats,physics:vehicle.snapshot()};}
  };
}
start().catch(error=>{console.error(error);loading.hidden=false;loading.classList.remove('load-exit');loading.classList.add('load-error');message.textContent='تعذر تشغيل الساحة. تحقق من الاتصال ودعم WebGL، ثم أعد المحاولة.';document.getElementById('retry').hidden=false;});
