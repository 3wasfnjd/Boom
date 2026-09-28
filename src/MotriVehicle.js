import * as THREE from 'three';
import {PhysicsVehicle} from './motri/PhysicsVehicle.js';
import {Events} from './motri/Events.js';
import {RAPIER,PHYSICS_SCALE} from './PhysicsWorld.js';
const frame=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
export class MotriVehicle {
 constructor(world,scene){
  this.world=world;this.scene=scene;this.container=new THREE.Group();this.container.name='MotriVehicle';scene.add(this.container);
  this.game={RAPIER,debug:{active:false},quality:{level:1},world:{},physics:{world:world.native},ticker:{events:new Events(),elapsed:0,delta:1/60,deltaScaled:1/60,deltaAverage:1/60},player:{accelerating:0,steering:0,braking:0,boosting:0,suspensions:['low','low','low','low']},audio:{groups:{get:()=>({playRandomNext(){}})}},objects:{add:(_,description)=>({physical:world.createMotriChassis(description)})}};
  this.physical=new PhysicsVehicle(this.game);this.physical.topSpeed=14;this.physical.engineForceAmplitude=420;this.driftBlend=0;this.body=this.physical.chassis.physical.body;this.linearSpeed=0;this.heading=0;this.invertedTime=0;
 }
 setModel(scene){
  if(this.model)this.container.remove(this.model);
  this.model=scene.clone(true);this.model.scale.multiplyScalar(1/PHYSICS_SCALE);this.container.add(this.model);
  const body=this.model.getObjectByName('body');body.position.y=0;
  this.wheels=['wheel-front-left','wheel-front-right','wheel-back-left','wheel-back-right'].map(name=>this.model.getObjectByName(name));
  if(this.wheels.some(w=>!w))throw Error('Motri wheel rig incomplete');
  this.wheelSpin=0;this.wheelSteering=0;this.container.traverse(n=>{if(n.isMesh)n.castShadow=n.receiveShadow=true;});this.sync(0);
 }
 reset(x,y,z,heading=0){
  this.game.player.accelerating=this.game.player.steering=this.game.player.braking=this.game.player.boosting=0;
  this.physical.moveTo({x:x*PHYSICS_SCALE,y:y*PHYSICS_SCALE,z:z*PHYSICS_SCALE},heading-Math.PI/2);
  this.physical.quaternion.copy(this.body.rotation());this.physical.velocity.set(0,0,0);this.physical.speed=this.physical.xzSpeed=this.physical.forwardSpeed=0;
  this.physical.stuck.savedItems=[];this.physical.stuck.durationSaved=0;this.invertedTime=0;this.linearSpeed=0;this.driftBlend=0;this.wheelSpin=0;this.sync(0);
 }
 preStep(input,dt){
  const p=this.game.player;p.braking=input.handbrake?1:0;p.accelerating=p.braking?0:input.z;p.steering=input.x;p.boosting=input.boost?1:0;
  // Keep front grip; progressively loosen the rear only in powered forward turns.
  const speed=Math.abs(this.physical.forwardSpeed),settings=this.physical.wheels.settings;
  const pace=THREE.MathUtils.smoothstep(speed,4,12);
  const velocity=this.body.linvel(),side=this.physical.sideward,forward=this.physical.forward;
  const slipAngle=Math.atan2(Math.abs(velocity.x*side.x+velocity.z*side.z),Math.max(.1,Math.abs(velocity.x*forward.x+velocity.z*forward.z)));
  const recovery=1-THREE.MathUtils.smoothstep(slipAngle,.06,.18);
  const target=p.accelerating>0&&!p.braking&&this.physical.forwardSpeed>0&&this.physical.wheels.inContactCount>=3?pace*Math.abs(p.steering)*recovery:0;
  this.driftBlend+=(target-this.driftBlend)*(1-Math.exp(-dt*(target>this.driftBlend?5:8)));
  this.physical.steeringAmplitude=THREE.MathUtils.lerp(.5,.32,THREE.MathUtils.smoothstep(speed,8,22));
  for(let i=0;i<4;i++){
   const slip=i>=2?this.driftBlend:0;
   this.physical.controller.setWheelFrictionSlip(i,settings.frictionSlip*(1-.28*slip));
   this.physical.controller.setWheelSideFrictionStiffness(i,settings.sideFrictionStiffness*(1-.62*slip));
  }
  this.game.ticker.elapsed+=dt;this.physical.updatePrePhysics();
 }
 postStep(dt){this.physical.updatePostPhysics();this.sync(dt);
  this.invertedTime=this.physical.upsideDown.active?this.invertedTime+dt:0;
  if(this.invertedTime>3){this.physical.flip.jump();this.invertedTime=0;}
 }
 sync(dt){
  this.container.position.copy(this.body.translation()).multiplyScalar(1/PHYSICS_SCALE);this.container.quaternion.copy(this.body.rotation()).multiply(frame);
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(this.container.quaternion);this.heading=Math.atan2(forward.x,forward.z);
  this.linearSpeed=(this.physical.forwardSpeed||0)/PHYSICS_SCALE;
  if(!this.wheels)return;
  this.wheelSteering+=(this.game.player.steering*this.physical.steeringAmplitude-this.wheelSteering)*Math.min(1,dt*16);
  this.wheelSpin+=(this.physical.forwardSpeed||0)/this.physical.wheels.settings.radius*dt;
  for(let i=0;i<4;i++){
   const wheel=this.wheels[i],physical=this.physical.wheels.items[i];
   wheel.position.y=-(physical.suspensionLength??this.physical.suspensionsHeights.low);
   wheel.rotation.order='YXZ';wheel.rotation.set(this.wheelSpin,i<2?this.wheelSteering:0,0,'YXZ');
  }
 }
 snapshot(){return {engine:'Rapier 0.17.3 / Motri',nativeSpeed:this.physical.speed,contacts:this.physical.wheels.inContactCount,suspension:this.physical.wheels.items.map(w=>({contact:w.inContact,length:w.suspensionLength})),sleeping:this.body.isSleeping(),rotation:this.container.quaternion.toArray()};}
}
