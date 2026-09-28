import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import * as THREE from 'three';
import {PhysicsWorld,loadPhysics} from '../src/PhysicsWorld.js';
import {MotriVehicle} from '../src/MotriVehicle.js';
import {FixedStepClock} from '../src/FixedStepClock.js';
import {motriTouchInput} from '../src/MotriControls.js';
await loadPhysics(readFileSync('vendor/rapier/rapier_wasm3d_bg.wasm'));
function measure(throttle){
 const world=new PhysicsWorld(),v=new MotriVehicle(world,new THREE.Scene());world.createBox([0,-.1,0],[600,.2,600]);v.reset(0,.8,0);
 const step=(frames,z)=>{for(let i=0;i<frames;i++){v.preStep({x:0,z},1/60);world.step();v.postStep(1/60);}};
 step(120,0);step(360,throttle);const result={throttle,speed:v.linearSpeed,distance:v.container.position.z};world.native.free();return result;
}
const rows=[0,.25,.4,.5,.75,.8,1].map(travel=>({travel,previous:measure(travel**3),current:measure(motriTouchInput(0,1,travel,0).z)}));
const half=rows.find(r=>r.travel===.5),full=rows.at(-1);
assert.ok(half.current.speed>half.previous.speed*2.5,'Half travel reaches useful speed');
assert.ok(rows[0].current.speed===0&&rows.at(-2).current.throttle===1,'Neutral and full throttle limits');
assert.ok(Math.abs(full.previous.speed-full.current.speed)<.001,'Full throttle preserves tested physics');
const clocks=[60,30,15,12,10,8,5].map(fps=>{const clock=new FixedStepClock();let ticks=0;for(let i=0;i<fps*6;i++)clock.advance(1/fps,()=>ticks++);assert.equal(ticks,360,'Simulation time at '+fps+' FPS');return {fps,seconds:clock.simulated,ticks};});
const pause=new FixedStepClock();let resumedTicks=0;pause.advance(20,()=>resumedTicks++);assert.equal(resumedTicks,15,'Bound tab resume catch-up');
console.log(JSON.stringify({status:'passed',halfTravel:half,clocks},null,2));
writeFileSync('verification/touch-response-results.json',JSON.stringify({status:'passed',clocks,durationSeconds:6,units:'render units; not calibrated km/h',rows},null,2)+'\n');
