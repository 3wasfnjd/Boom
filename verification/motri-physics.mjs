import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import * as THREE from 'three';
import {PhysicsWorld,loadPhysics} from '../src/PhysicsWorld.js';
import {MotriVehicle} from '../src/MotriVehicle.js';
import {motriTouchInput} from '../src/MotriControls.js';
await loadPhysics(readFileSync('vendor/rapier/rapier_wasm3d_bg.wasm'));
const checks=[];
const check=(name,value,details)=>{assert.ok(value,name+' '+JSON.stringify(details||''));checks.push({name,status:'passed',...(details?{details}:{})});};
const create=()=>{const world=new PhysicsWorld(),vehicle=new MotriVehicle(world,new THREE.Scene());return {world,vehicle};};
const step=(world,vehicle,n,input={x:0,z:0})=>{for(let i=0;i<n;i++){vehicle.preStep(input,1/60);world.step();vehicle.postStep(1/60);}};
{
 const {world,vehicle:v}=create();world.createBox([0,-.1,0],[100,.2,100]);v.reset(0,.8,0);step(world,v,180);
 check('Four ray-cast wheels support the chassis',v.physical.wheels.inContactCount===4,v.snapshot());
 const rest=v.container.position.clone();step(world,v,300);
 check('Settled car sleeps without positional jitter',v.body.isSleeping()&&rest.distanceTo(v.container.position)<.001);
 step(world,v,120,{x:0,z:1});check('Throttle wakes the car and produces forward motion',!v.body.isSleeping()&&v.container.position.z>3&&v.linearSpeed>1);
 step(world,v,60,{x:1,z:1});check('Motri left input steers through the tires',v.heading>.2&&v.container.position.x>.3);
 step(world,v,180,{x:0,z:1,handbrake:true});check('Brake overrides throttle and stops physical motion',Math.abs(v.linearSpeed)<.1,{speed:v.linearSpeed});
 v.reset(0,.8,0);step(world,v,90);step(world,v,120,{x:0,z:-1});check('Reverse engages from rest',v.container.position.z< -2&&v.linearSpeed< -1);
 v.reset(0,.8,0);world.createBox([0,1,4],[8,2,.4]);step(world,v,90);step(world,v,360,{x:0,z:1});
 check('Full chassis collision stops at a thin wall',v.container.position.z>1&&v.container.position.z<3.6,{position:v.container.position.toArray()});world.native.free();
}
{
 const {world,vehicle:v}=create(),positions=[-20,0,-20,20,0,-20,-20,6,20,20,6,20];world.createTerrain(positions,[0,2,1,1,2,3]);v.reset(0,3.8,0);step(world,v,180);
 const p=v.container.position,q=v.container.quaternion;
 check('Ramp physically pitches the chassis',Math.abs(q.x)>.03&&v.physical.wheels.inContactCount===4,{rotation:q.toArray(),contacts:v.physical.wheels.inContactCount});
 const errors=v.physical.wheels.items.map(w=>Math.abs(w.contactPoint.y/2-(w.contactPoint.z/2*.15+3)));
 check('All four wheel rays contact the actual inclined mesh',Math.max(...errors)<.01,{errors});
 const start=p.z;step(world,v,120,{x:0,z:1});check('Vehicle climbs the ramp on its suspension',v.container.position.z>start+1&&v.container.position.y>3.5,{position:v.container.position.toArray()});world.native.free();
}
{
 const half=motriTouchInput(0,1,.5,0),full=motriTouchInput(0,1,1,0),back=motriTouchInput(0,-1,1,0),left=motriTouchInput(1,1,1,0);
 check('Touch throttle follows Motri cubic response',half.z===.125&&full.z===1);
 check('Dragging behind the car selects reverse',back.z===-1&&Math.abs(back.x)<1e-9);
 check('Touch target turns the wheels with bounded steering',left.x===1&&left.z===1);
}
const result={status:'passed',engine:'Rapier 0.17.3',sourceRevision:'ee7e01dfe848f1bc7e857d51bcee2e687bee21eb',fixedStep:1/60,physicsUnitsPerRenderUnit:2,checks};
writeFileSync('verification/motri-physics-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:checks.length}));
