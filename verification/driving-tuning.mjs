import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import * as THREE from 'three';
import {PhysicsWorld,loadPhysics} from '../src/PhysicsWorld.js';
import {MotriVehicle} from '../src/MotriVehicle.js';
await loadPhysics(readFileSync('vendor/rapier/rapier_wasm3d_bg.wasm'));
function run(legacy,steering=.65){
 const world=new PhysicsWorld(),v=new MotriVehicle(world,new THREE.Scene());world.createBox([0,-.1,0],[600,.2,600]);
 if(legacy){v.physical.brakeAmplitude=35;v.physical.topSpeed=5;v.physical.engineForceAmplitude=300;v.preStep=function(input,dt){Object.assign(this.game.player,{accelerating:input.handbrake?0:input.z,steering:input.x,braking:input.handbrake?1:0,boosting:0});this.game.ticker.elapsed+=dt;this.physical.updatePrePhysics();};}
 const step=(n,input)=>{for(let i=0;i<n;i++){v.preStep(input,1/60);world.step();v.postStep(1/60);}};
 v.reset(0,.8,0);step(120,{x:0,z:0});step(360,{x:0,z:1});
 const speed=v.linearSpeed,distance=v.container.position.z;let maxSlip=0,minUp=1;
 for(let i=0;i<120;i++){step(1,{x:steering,z:1});const vel=new THREE.Vector3().copy(v.body.linvel()),forward=new THREE.Vector3(0,0,1).applyQuaternion(v.container.quaternion);vel.y=forward.y=0;maxSlip=Math.max(maxSlip,vel.angleTo(forward)*180/Math.PI);minUp=Math.min(minUp,new THREE.Vector3(0,1,0).applyQuaternion(v.container.quaternion).y);}
 step(180,{x:0,z:1});const recoveredGrip=v.driftBlend;
 step(180,{x:0,z:0,handbrake:true});const stoppedSpeed=new THREE.Vector3().copy(v.body.linvel()).length()/2;
 world.native.free();return {speedAfter6Seconds:speed,distanceAfter6Seconds:distance,maxTurnSlipDegrees:maxSlip,minUp,recoveredGrip,stoppedSpeed};
}
const baseline=run(true),tuned=run(false),fullLeft=run(false,1),fullRight=run(false,-1);
console.log(JSON.stringify({baseline,tuned,fullLeft,fullRight},null,2));
assert.ok(tuned.speedAfter6Seconds>baseline.speedAfter6Seconds*1.5,'Material speed increase');
assert.ok(tuned.maxTurnSlipDegrees>baseline.maxTurnSlipDegrees&&tuned.maxTurnSlipDegrees<30,'Mild controlled slip');
assert.ok(tuned.minUp>.9,'No rollover during powered turn');
assert.ok(tuned.recoveredGrip<.001&&tuned.stoppedSpeed<.1,'Grip recovery and braking');
assert.ok([fullLeft,fullRight].every(r=>r.maxTurnSlipDegrees<30&&r.minUp>.9&&r.stoppedSpeed<.1),'Full steering stays controllable');
writeFileSync('verification/driving-tuning-results.json',JSON.stringify({status:'passed',baseline,tuned,fullLeft,fullRight},null,2)+'\n');
