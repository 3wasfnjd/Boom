import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {registerAll,rigidBody,box,MotionType,updateWorld} from 'crashcat';
import {Vehicle} from './Vehicle.js';
import {Controls} from './Controls.js';
import {createSphereBody} from './SphereBody.js';
import {createPhysicsWorld} from './World.js';
import {createHajwalaModel} from '../src/prepareMotriVehicle.js';

// Textures are visually verified by preview.html. This run needs rig/geometry.
globalThis.ProgressEvent ??= class {constructor(type,init){Object.assign(this,init);this.type=type;}};
async function readModel(path) {
 const raw=fs.readFileSync(new URL(path,import.meta.url)),length=raw.readUInt32LE(12);
 const doc=JSON.parse(raw.subarray(20,20+length));
 assert(!doc.extensionsRequired?.includes('KHR_draco_mesh_compression'));
 doc.buffers[0].uri='data:application/octet-stream;base64,'+raw.subarray(28+length).toString('base64');
 doc.materials=doc.materials.map(m=>({name:m.name}));
 delete doc.images;delete doc.textures;delete doc.extensionsUsed;delete doc.extensionsRequired;
 return (await new GLTFLoader().parseAsync(JSON.stringify(doc),'')).scene;
}
const controls=Object.create(Controls.prototype);
controls.keys={KeyW:true};controls.touchActive=false;
Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>[]},configurable:true});
assert.deepEqual(controls.update(),{x:0,z:1,touchActive:false,handbrake:false});
controls.keys={KeyA:true,KeyB:true};let input=controls.update();assert.equal(input.x,-1);assert(input.handbrake);
controls.keys={};controls.touchActive=true;controls.touchDirX=.5;controls.touchDirY=-.5;
input=controls.update();assert(input.touchActive&&Math.hypot(input.x,input.z)>.999);
controls.touchActive=false;navigator.getGamepads=()=>[{axes:[.4],buttons:Array.from({length:8},(_,i)=>({value:i===7?.8:0}))}];
input=controls.update();assert.equal(input.x,.4);assert.equal(input.z,.8);
navigator.getGamepads=()=>[];
registerAll();
const phases=[
 {name:'accelerate',frames:180,input:{x:0,z:1}},
 {name:'steer',frames:75,input:{x:.7,z:1}},
 {name:'handbrake',frames:45,input:{x:.8,z:1,handbrake:true}},
 {name:'reverse',frames:180,input:{x:0,z:-1}},
 {name:'touch',frames:120,input:{x:.8,z:.6,touchActive:true}}
];
function simulate(model,expectedMotri=false){
 const world=createPhysicsWorld();
 rigidBody.create(world,{shape:box.create({halfExtents:[100,.05,100]}),motionType:MotionType.STATIC,objectLayer:world._OL_STATIC,position:[0,-.05,0],friction:5,restitution:0});
 const vehicle=new Vehicle();vehicle.physicsWorld=world;vehicle.rigidBody=createSphereBody(world,[0,.5,0]);
 vehicle.spherePos.set(0,.5,0);vehicle.prevModelPos.set(0,0,0);vehicle.spawnPos=[0,.5,0];
 vehicle.init(createHajwalaModel(model));
 assert.equal(vehicle.wheels.length,4,'exactly four wheel pivots');
 assert(vehicle.bodyNode&&vehicle.wheelFL&&vehicle.wheelFR&&vehicle.wheelBL&&vehicle.wheelBR);
 const points=[];
 for(const phase of phases){
  for(let i=0;i<phase.frames;i++){
   updateWorld(world,null,1/60);vehicle.update(1/60,phase.input);
   vehicle.container.updateMatrixWorld(true);
   assert([...vehicle.container.position,...vehicle.container.quaternion,vehicle.linearSpeed].every(Number.isFinite));
  }
  points.push({phase:phase.name,position:vehicle.container.position.toArray(),heading:vehicle.container.rotation.y,speed:vehicle.linearSpeed});
  if(phase.name==='steer')assert(Math.abs(vehicle.wheelFL.rotation.y)>.1,'front tires steer');
  if(phase.name==='reverse')assert(vehicle.linearSpeed<0,'reverse engages');
 }
 assert(points[0].position[2]>1,'accelerates forward along +Z');
 assert(Math.abs(vehicle.wheelFL.rotation.x)>1,'tires roll');
 if(expectedMotri){
  const weapon=vehicle.container.getObjectByName('weapon-yaw');
  if(weapon){let parent=weapon;while(parent&&parent!==vehicle.bodyNode)parent=parent.parent;assert.equal(parent,vehicle.bodyNode,'weapon follows body suspension');}
 }
 return points;
}
const reference=await readModel('../originals/hajwala-reference-truck.glb');
const referencePath=simulate(reference);
const results=[];
for(const id of ['h9','shas','datsun'])for(const variant of ['base','combat']){
 const file=`../models/motri-${id}-${variant}.glb`,model=await readModel(file);
 const wheelNodes=[];model.traverse(o=>{if(o.name.toLowerCase().includes('wheel'))wheelNodes.push(o)});
 assert.equal(wheelNodes.length,4,'no nested wheel name matches');
 const ground=new THREE.Box3().setFromObject(model).min.y;assert(Math.abs(ground)<.0001,'tires aligned to y=0');
 const trajectory=simulate(model,true);
 let maxDelta=0;for(let i=0;i<trajectory.length;i++)for(let a=0;a<3;a++)maxDelta=Math.max(maxDelta,Math.abs(trajectory[i].position[a]-referencePath[i].position[a]));
 assert(maxDelta<1e-9,'same physics trajectory as original Hajwala vehicle');
 results.push({id,variant,bytes:fs.statSync(new URL(file,import.meta.url)).size,wheels:wheelNodes.length,groundMinY:ground,trajectoryMaxDelta:maxDelta,phases:trajectory});
}
const output={status:'passed',source:{motri:'ee7e01dfe848f1bc7e857d51bcee2e687bee21eb',hajwala:'4c9e421b469118c353724944a3b1465a0c1c0fc0'},
 three:THREE.REVISION,crashcat:'0.0.3',inputMappings:['keyboard','touch-vector','gamepad','handbrake'],
 framesPerVehicle:600,reference:'original Hajwala yellow truck',results,
 limits:['Synthetic input and controlled flat ground; no real-phone performance measurement.','Default driving uses a sphere collider; no added body-part collision or combat damage.','Weapon models are cosmetic; no projectile, aiming AI or multiplayer systems.']};
fs.writeFileSync(new URL('compatibility-results.json',import.meta.url),JSON.stringify(output,null,2));
console.log(JSON.stringify({status:output.status,vehicles:results.map(({id,variant,bytes,wheels,trajectoryMaxDelta})=>({id,variant,bytes,wheels,trajectoryMaxDelta})),framesPerVehicle:600,inputMappings:output.inputMappings},null,2));
