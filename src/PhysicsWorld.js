import RAPIER from '@dimforge/rapier3d';
import {initializeRapier} from '@dimforge/rapier3d/rapier_wasm3d.js';
export {RAPIER};
export const PHYSICS_SCALE=2;
const vector=p=>({x:p[0]*PHYSICS_SCALE,y:p[1]*PHYSICS_SCALE,z:p[2]*PHYSICS_SCALE});
export async function loadPhysics(source=new URL('vendor/rapier/rapier_wasm3d_bg.wasm',document.baseURI)){await initializeRapier(source);}
export class PhysicsWorld {
 constructor(){this.native=new RAPIER.World({x:0,y:-9.81,z:0});this.native.timestep=1/60;}
 createBox(position,size,friction=.2,quaternion=[0,0,0,1]){
  const p=vector(position),body=this.native.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x,p.y,p.z).setRotation({x:quaternion[0],y:quaternion[1],z:quaternion[2],w:quaternion[3]}));
  this.native.createCollider(RAPIER.ColliderDesc.cuboid(...size.map(n=>n*PHYSICS_SCALE/2)).setFriction(friction).setRestitution(.15).setCollisionGroups((3<<16)|5),body);return body;
 }
 createTerrain(positions,indices){
  const body=this.native.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  this.native.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(positions.map(n=>n*PHYSICS_SCALE)),new Uint32Array(indices),RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.2).setRestitution(.15).setCollisionGroups((1<<16)|1),body);return body;
 }
 // Chassis descriptions remain in Motri's original +X frame and native units.
 createMotriChassis(description){
  const body=this.native.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(description.position.x,description.position.y,description.position.z).setLinearDamping(.1).setAngularDamping(.1).setCanSleep(true).setCcdEnabled(true));
  const colliders=[];
  for(const shape of description.colliders){
   const collider=RAPIER.ColliderDesc.cuboid(...shape.parameters).setTranslation(shape.position.x,shape.position.y,shape.position.z).setFriction(.4).setRestitution(.15);
   if(shape.centerOfMass)collider.setMassProperties(shape.mass,shape.centerOfMass,{x:1,y:1,z:1},{x:0,y:0,z:0,w:1});else collider.setMass(shape.mass);
   // Motri's bumper collides with props, not the terrain. Main/top retain floor contacts.
   if(shape.category==='bumper')collider.setCollisionGroups((4<<16)|2);else collider.setCollisionGroups((3<<16)|5);
   colliders.push(this.native.createCollider(collider,body));
  }
  return {body,colliders};
 }
 removeBody(body){if(body?.isValid())this.native.removeRigidBody(body);}
 step(){this.native.step();}
}
