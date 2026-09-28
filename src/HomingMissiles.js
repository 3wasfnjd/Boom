import * as THREE from 'three';
export class HomingMissiles {
 constructor(scene,combat){
  this.scene=scene;this.combat=combat;this.items=new Map();this.up=new THREE.Vector3(0,1,0);this.direction=new THREE.Vector3();this.predicted=new THREE.Vector3();
  this.body=new THREE.CylinderGeometry(.09,.12,.7,8);this.nose=new THREE.ConeGeometry(.12,.28,8);this.fin=new THREE.BoxGeometry(.46,.16,.05);this.flame=new THREE.ConeGeometry(.12,.45,8);
  this.metal=new THREE.MeshStandardMaterial({color:'#ebded0',metalness:.5,roughness:.45});this.accent=new THREE.MeshBasicMaterial({color:'#ff7641'});this.fire=new THREE.MeshBasicMaterial({color:'#ffce5a'});
 }
 sync(states,replace=true){const ids=new Set();for(const state of states){ids.add(state.id);let item=this.items.get(state.id);
   if(!item){const group=new THREE.Group();group.name='homing-missile';const body=new THREE.Mesh(this.body,this.metal),nose=new THREE.Mesh(this.nose,this.accent),a=new THREE.Mesh(this.fin,this.accent),b=a.clone(),flame=new THREE.Mesh(this.flame,this.fire);nose.position.y=.48;a.position.y=b.position.y=-.24;b.rotation.y=Math.PI/2;flame.position.y=-.55;flame.rotation.z=Math.PI;group.add(body,nose,a,b,flame);group.position.fromArray(state.p);this.scene.add(group);item={group,flame,target:new THREE.Vector3(),velocity:new THREE.Vector3(),age:0,trail:0};this.items.set(state.id,item);}
   item.target.fromArray(state.p);item.velocity.fromArray(state.v);item.age=0;
  }if(replace)for(const id of this.items.keys())if(!ids.has(id))this.remove(id);
 }
 update(dt){for(const item of this.items.values()){item.age+=dt;this.predicted.copy(item.target).addScaledVector(item.velocity,Math.min(.12,item.age));item.group.position.lerp(this.predicted,1-Math.exp(-24*dt));if(item.velocity.lengthSq()>.01)item.group.quaternion.setFromUnitVectors(this.up,this.direction.copy(item.velocity).normalize());item.flame.scale.y=.85+Math.sin(item.age*50)*.15;item.trail-=dt;if(item.trail<=0){this.combat.effect(item.group.position,'#c4c1b9',.45,.5);item.trail=.05;}}}
 remove(id){const item=this.items.get(id);if(item){item.group.removeFromParent();this.items.delete(id);}}
 clear(){for(const id of this.items.keys())this.remove(id);}
}
