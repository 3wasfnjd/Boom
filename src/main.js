import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {registerAll,updateWorld,rigidBody} from 'crashcat';
import {Vehicle} from '../verification/Vehicle.js';
import {createPhysicsWorld} from '../verification/World.js';
import {createSphereBody} from '../verification/SphereBody.js';
import {createHajwalaModel} from './prepareMotriVehicle.js';
import {Arena,SPAWN} from './Arena.js';
import {CombatInput} from './CombatInput.js';
import {CombatSystem,WEAPONS} from './CombatSystem.js';

const loading=document.getElementById('loading'),message=document.getElementById('loading-message');
async function start() {
  const renderer=new THREE.WebGLRenderer({canvas:document.getElementById('game'),antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#c7b68e');scene.fog=new THREE.Fog('#c7b68e',40,95);
  const camera=new THREE.PerspectiveCamera(49,innerWidth/innerHeight,.08,130);
  scene.add(new THREE.HemisphereLight('#e7eff4','#897451',2.7));
  const sun=new THREE.DirectionalLight('#fff1cc',3.4);sun.position.set(-10,17,-6);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=sun.shadow.camera.bottom=-16;sun.shadow.camera.right=sun.shadow.camera.top=16;
  sun.shadow.camera.near=.1;sun.shadow.camera.far=45;sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;scene.add(sun,sun.target);
  const cameraOffset=new THREE.Vector3(7,10,-12),follow=new THREE.Vector3(SPAWN[0],.3,SPAWN[2]+2.5),lookTarget=new THREE.Vector3(),projected=new THREE.Vector3();
  let worldAngle=Math.atan2(cameraOffset.x,cameraOffset.z);
  const resize=()=>{renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;cameraOffset.x=camera.aspect<.85?3:7;worldAngle=Math.atan2(cameraOffset.x,cameraOffset.z);camera.updateProjectionMatrix();};
  window.addEventListener('resize',resize);resize();
  registerAll();const world=createPhysicsWorld();
  const loader=new GLTFLoader(),cache=new Map();
  const loadCar=id=>{if(!cache.has(id))cache.set(id,loader.loadAsync(new URL(`models/motri-${id}-combat.glb`,document.baseURI).href).catch(error=>{cache.delete(id);throw error;}));return cache.get(id);};
  const [firstCar,crate]=await Promise.all([loadCar('h9'),loader.loadAsync(new URL('models/world/motri-crate.glb',document.baseURI).href)]);
  const arena=new Arena(scene,world,crate.scene),body=createSphereBody(world,SPAWN),input=new CombatInput(renderer.domElement);
  let vehicle,id='h9',hits=0,hitFlash=0,selection=0,paused=false;
  const aimMark=document.getElementById('aim-mark'),hitMark=document.getElementById('hit-mark'),hitCount=document.getElementById('hit-count'),hint=document.getElementById('hint');
  if('ontouchstart' in window)hint.textContent='حرّك العصا اليسرى للقيادة · اضغط إطلاق للرماية أو اسحبه للتصويب';
  const combat=new CombatSystem(scene,arena,()=>{hits++;hitFlash=.15;hitCount.textContent=`إصابات ${hits.toLocaleString('ar')}`;});
  function installCar(gltf,nextId) {
    const previous=vehicle,next=new Vehicle();
    next.physicsWorld=world;next.rigidBody=body;next.spawnPos=[...SPAWN];next.spawnAngle=0;
    next.init(createHajwalaModel(gltf.scene,.5));next.spherePos.set(...body.position);
    next.container.position.set(body.position[0],body.position[1]-.5,body.position[2]);next.prevModelPos.copy(next.container.position);
    if(previous){next.container.quaternion.copy(previous.container.quaternion);next.linearSpeed=previous.linearSpeed;next.angularSpeed=previous.angularSpeed;next.acceleration=previous.acceleration;scene.remove(previous.container);}
    next.container.traverse(node=>{if(node.isMesh)node.castShadow=node.receiveShadow=true;});scene.add(next.container);vehicle=next;id=nextId;
    combat.bind(vehicle,id);document.getElementById('weapon-name').textContent=WEAPONS[id].label;
    document.querySelectorAll('[data-car]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.car===id)));
  }
  installCar(firstCar,'h9');
  async function selectCar(nextId) {
    if(!WEAPONS[nextId])return;const token=++selection;
    document.querySelectorAll('[data-car]').forEach(button=>button.disabled=button.dataset.car===nextId);
    try {const gltf=await loadCar(nextId);if(token!==selection)return;installCar(gltf,nextId);}
    catch(error){if(token===selection){hint.textContent='تعذر تحميل السيارة. اضغط اسمها للمحاولة مجددًا.';hint.style.opacity=1;}console.error(error);}
    finally{if(token===selection)document.querySelectorAll('[data-car]').forEach(button=>button.disabled=false);}
  }
  function reset() {
    input.release();rigidBody.setPosition(world,body,[...SPAWN],true);rigidBody.setLinearVelocity(world,body,[0,0,0]);rigidBody.setAngularVelocity(world,body,[0,0,0]);
    vehicle.spherePos.set(...SPAWN);vehicle.sphereVel.set(0,0,0);vehicle.linearSpeed=vehicle.angularSpeed=vehicle.acceleration=0;
    vehicle.container.position.set(SPAWN[0],0,SPAWN[2]);vehicle.container.quaternion.identity();vehicle.prevModelPos.copy(vehicle.container.position);vehicle.modelVelocity.set(0,0,0);
    vehicle.bodyNode.rotation.set(0,0,0);vehicle.bodyNode.position.y=vehicle._bodyRestY;vehicle.wheels.forEach(wheel=>wheel.rotation.set(0,0,0));
    combat.clear();arena.reset();hits=0;hitFlash=0;hitCount.textContent='إصابات ٠';follow.set(SPAWN[0],.3,SPAWN[2]+2.5);moveCamera(1);
  }
  document.getElementById('reset').addEventListener('click',reset);
  document.querySelectorAll('[data-car]').forEach(button=>button.addEventListener('click',()=>selectCar(button.dataset.car)));
  window.addEventListener('keydown',event=>{if(event.repeat)return;if(event.code==='KeyR')reset();const car={Digit1:'h9',Digit2:'shas',Digit3:'datsun'}[event.code];if(car)selectCar(car);});
  function moveCamera(dt) {
    lookTarget.copy(vehicle.container.position);lookTarget.y=.3;lookTarget.z+=2.5;
    follow.lerp(lookTarget,1-Math.exp(-7*dt));camera.position.copy(follow).add(cameraOffset);camera.lookAt(follow);camera.updateMatrixWorld();
    sun.target.position.copy(vehicle.container.position);sun.position.copy(sun.target.position).add(new THREE.Vector3(-10,17,-6));sun.target.updateMatrixWorld();
  }
  function tick(controls) {
    const dt=1/60;updateWorld(world,null,dt);vehicle.update(dt,controls.drive);moveCamera(dt);arena.update(dt,camera);combat.update(dt,controls,camera);hitFlash=Math.max(0,hitFlash-dt);
  }
  function draw() {
    projected.copy(combat.aimPoint).project(camera);
    const visible=projected.z>-1&&projected.z<1&&Math.abs(projected.x)<.98&&Math.abs(projected.y)<.96;
    aimMark.style.display=visible?'block':'none';aimMark.style.left=`${(projected.x*.5+.5)*innerWidth}px`;aimMark.style.top=`${(-projected.y*.5+.5)*innerHeight}px`;aimMark.classList.toggle('locked',!!combat.lockedTarget);
    hitMark.style.opacity=String(Math.min(1,hitFlash*12));hitMark.style.left=aimMark.style.left;hitMark.style.top=aimMark.style.top;
    renderer.render(scene,camera);
  }
  moveCamera(1);tick(input.read(worldAngle));draw();loading.hidden=true;
  let last=performance.now(),accumulator=0;
  renderer.setAnimationLoop(now=>{
    const elapsed=Math.min((now-last)/1000,.1);last=now;
    if(document.hidden||paused){accumulator=0;return;}
    accumulator+=elapsed;const controls=input.read(worldAngle);let steps=0;
    while(accumulator>=1/60&&steps<5){tick(controls);accumulator-=1/60;steps++;}
    if(steps===5)accumulator=0;draw();
  });
  // The diagnostics API is opt-in and kept out of the player's interface.
  if(new URLSearchParams(location.search).has('debug'))window.__BOOM__={
    get vehicle(){return vehicle;},arena,combat,input,world,body,camera,renderer,selectCar,reset,
    pause(value=true){paused=value;},
    step(frames=1,controls){for(let i=0;i<frames;i++)tick(controls||input.read(worldAngle));draw();},
    snapshot(){return {car:id,position:vehicle.container.position.toArray(),speed:vehicle.linearSpeed,yaw:vehicle.container.rotation.y,hits,shotsFired:combat.shotsFired,activeShots:combat.shots.filter(shot=>shot.active).length,targets:arena.targets.map(t=>({id:t.id,health:t.health,active:t.active})),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,memory:{...renderer.info.memory}};}
  };
}
start().catch(error=>{console.error(error);loading.hidden=false;message.textContent='تعذر تشغيل الساحة. تحقق من الاتصال ودعم WebGL، ثم أعد المحاولة.';document.getElementById('retry').hidden=false;});
