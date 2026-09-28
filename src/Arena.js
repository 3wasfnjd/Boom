import * as THREE from 'three';
import {MotriWorld} from './MotriWorld.js';
import {TARGET_POSITIONS} from './WorldLayout.js';
export {ARENA_HALF,SPAWN,TARGET_POSITIONS} from './WorldLayout.js';

export class Arena {
  constructor(scene,world,crateScene,assets) {
    this.scene=scene;this.world=world;this.blockers=[];this.targets=[];this.time=0;
    this.environment=new MotriWorld(this,assets);
    let template;crateScene.traverse(o=>{if(!template&&o.isMesh)template=o;});if(!template)throw Error('Motri crate mesh missing');
    TARGET_POSITIONS.forEach(([x,z],id)=>this.createTarget(template,x,z,id));
  }
  makeBody(position,size,friction=.2,quaternion=[0,0,0,1]) {
    return this.world.createBox(position,size,friction,quaternion);
  }
  addBlocker(position,size,{quaternion=[0,0,0,1],name='wall',surface=false,friction=.2}={}) {
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion(...quaternion),new THREE.Vector3(1,1,1));
    const localBounds=new THREE.Box3(new THREE.Vector3(...size).multiplyScalar(-.5),new THREE.Vector3(...size).multiplyScalar(.5));
    const item={kind:'wall',active:true,name,surface,localBounds,inverseMatrix:matrix.clone().invert().elements.slice(),bounds:localBounds.clone().applyMatrix4(matrix)};
    item.body=this.makeBody(position,size,friction,quaternion);this.blockers.push(item);return item;
  }
  createTarget(template,x,z,id) {
    const group=new THREE.Group();group.position.set(x,this.environment.terrain.heightAt(x,z)+.65,z);
    const crate=template.clone();crate.position.set(0,0,0);crate.material=crate.material.clone();
    const bounds=new THREE.Box3().setFromObject(crate),size=bounds.getSize(new THREE.Vector3());
    crate.scale.multiplyScalar(1.3/Math.max(size.x,size.y,size.z));crate.updateMatrixWorld(true);
    crate.position.sub(new THREE.Box3().setFromObject(crate).getCenter(new THREE.Vector3()));
    crate.castShadow=crate.receiveShadow=true;group.add(crate);
    const ring=new THREE.Mesh(new THREE.RingGeometry(1.03,1.10,24),new THREE.MeshBasicMaterial({color:'#efdcaa',side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-.638;group.add(ring);
    const bar=new THREE.Mesh(new THREE.PlaneGeometry(1.25,.09),new THREE.MeshBasicMaterial({color:'#d1d996',depthTest:false}));bar.position.y=1.08;bar.renderOrder=2;group.add(bar);
    this.scene.add(group);
    const target={id,kind:'target',active:true,health:100,group,crate,bar,position:group.position.clone(),flash:0,respawnAt:0,
      bounds:new THREE.Box3().setFromCenterAndSize(group.position,new THREE.Vector3(1.3,1.3,1.3))};
    target.body=this.makeBody(group.position.toArray(),[1.3,1.3,1.3]);this.targets.push(target);
  }
  damage(target,amount) {
    if(!target.active)return false;
    target.health=Math.max(0,target.health-amount);target.flash=.13;
    target.bar.scale.x=target.health/100;
    if(target.health===0){target.active=false;target.group.visible=false;target.respawnAt=this.time+6;this.world.removeBody(target.body);target.body=null;return true;}
    return false;
  }
  restore(target) {
    if(target.body)this.world.removeBody(target.body);
    target.health=100;target.active=true;target.group.visible=true;target.bar.scale.x=1;target.flash=0;target.respawnAt=0;
    target.body=this.makeBody(target.position.toArray(),[1.3,1.3,1.3]);
  }
  reset(){for(const target of this.targets)this.restore(target);}
  update(dt,camera) {
    this.time+=dt;
    for(const target of this.targets){
      if(!this.networked&&!target.active&&this.time>=target.respawnAt)this.restore(target);
      target.flash=Math.max(0,target.flash-dt);target.crate.material.emissive.setHex(target.flash>0?0x664516:0);
      target.bar.quaternion.copy(camera.quaternion);
    }
  }
}
