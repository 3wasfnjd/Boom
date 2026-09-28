import * as THREE from 'three';

// Local-only identity effect: no shared vehicle materials or dynamic lights.
export class PlayerHighlight {
 constructor(scene,terrain){
  this.terrain=terrain;this.group=new THREE.Group();this.group.name='local-player-highlight';scene.add(this.group);
  this.material=new THREE.MeshBasicMaterial({color:0x59fff1,transparent:true,opacity:.75,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  this.ring=new THREE.Mesh(new THREE.RingGeometry(1.17,1.25,48),this.material);this.ring.rotation.x=-Math.PI/2;this.group.add(this.ring);
  const shape=new THREE.Shape();shape.moveTo(-.22,.12);shape.lineTo(0,-.12);shape.lineTo(.22,.12);shape.lineTo(.14,.2);shape.lineTo(0,.05);shape.lineTo(-.14,.2);shape.closePath();
  this.arrow=new THREE.Mesh(new THREE.ShapeGeometry(shape),this.material);this.group.add(this.arrow);
 }
 update(car,time){
  this.group.visible=car.visible;if(!car.visible)return;
  this.group.position.copy(car.position);this.ring.position.y=this.terrain.heightAt(car.position.x,car.position.z)-car.position.y+.08;
  this.arrow.position.y=1.9+Math.sin(time*3)*.06;this.material.opacity=.7+Math.sin(time*3)*.12;
 }
 faceCamera(camera){this.arrow.quaternion.copy(camera.quaternion);}
}
