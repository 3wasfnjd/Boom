import * as THREE from 'three';

// One small marker per remote player, with a tappable target label. Bearings use the
// camera's horizontal axes, so targets behind the camera never flip sides.
export class PlayerLocator {
 constructor(onSelect=()=>{}){
  this.element=document.createElement('div');this.element.className='player-locator';this.element.hidden=true;
  this.arrow=document.createElement('i');this.arrow.setAttribute('aria-hidden','true');
  this.label=document.createElement('button');this.label.className='locator-target';this.label.type='button';this.distance=document.createElement('small');
  this.label.addEventListener('pointerdown',event=>{event.preventDefault();onSelect();});this.label.addEventListener('click',onSelect);
  this.element.append(this.arrow,this.label,this.distance);document.body.append(this.element);
  this.projected=new THREE.Vector3();this.forward=new THREE.Vector3();this.right=new THREE.Vector3();this.delta=new THREE.Vector3();
 }
 update(position,origin,camera,name,alive){
  if(!alive){this.element.hidden=true;return;}
  this.projected.copy(position);this.projected.y+=1.5;this.projected.project(camera);
  const visible=this.projected.z>=-1&&this.projected.z<=1&&Math.abs(this.projected.x)<.92&&Math.abs(this.projected.y)<.88;
  this.element.hidden=visible;if(visible)return;
  this.delta.subVectors(position,origin);const distance=Math.round(this.delta.length());this.delta.y=0;
  camera.getWorldDirection(this.forward);this.forward.y=0;this.forward.normalize();
  this.right.setFromMatrixColumn(camera.matrixWorld,0);this.right.y=0;this.right.normalize();
  const x=this.delta.dot(this.right),y=-this.delta.dot(this.forward),length=Math.hypot(x,y)||1;
  const radiusX=Math.max(30,innerWidth*.5-44),radiusY=Math.max(32,innerHeight*.5-(innerHeight<500?105:175));
  this.element.style.left=`${innerWidth*.5+x/length*radiusX}px`;
  this.element.style.top=`${innerHeight*.5+y/length*radiusY}px`;
  this.arrow.style.transform=`rotate(${Math.atan2(x,-y)}rad)`;
  this.label.textContent=name;this.distance.textContent=`${distance} م`;
  this.element.setAttribute('aria-label',`${name} · ${distance} متر`);
 }
 remove(){this.element.remove();}
}
