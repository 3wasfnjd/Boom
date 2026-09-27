import * as THREE from 'three';
import {rigidBody,box,MotionType} from 'crashcat';

export const ARENA_HALF = 38;
export const SPAWN = [0,.5,-6];
export const TARGET_POSITIONS = [[0,9],[-6,14],[7,17],[-14,-3],[18,-9],[0,-21]];
const boxGeometry=new THREE.BoxGeometry(1,1,1);

function surfaceTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#c1a574';ctx.fillRect(0,0,1024,1024);
  let seed=41;const rnd=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  for(let i=0;i<19000;i++){ctx.fillStyle=i%2?'#ddc596':'#ac9164';ctx.globalAlpha=.16+rnd()*.20;ctx.fillRect(rnd()*1024,rnd()*1024,1+rnd()*3,1+rnd()*3);}
  ctx.globalAlpha=1;ctx.translate(512,512);ctx.scale(1024/84,1024/84);
  ctx.lineWidth=6;ctx.strokeStyle='#716f5f';ctx.beginPath();ctx.roundRect(-26,-26,52,52,10);ctx.stroke();
  ctx.lineWidth=.10;ctx.strokeStyle='#e2cd93';ctx.setLineDash([1.2,1.4]);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#9d8f70';ctx.fillRect(-3,-9,6,5);ctx.strokeStyle='#e7d9b2';ctx.lineWidth=.09;
  for(const x of [-3,3]){ctx.beginPath();ctx.moveTo(x,-9);ctx.lineTo(x,-4);ctx.stroke();}
  // Thin range markers give depth cues while testing speed and turns.
  ctx.fillStyle='#e5d2a4';for(const z of [0,5,10,15]){ctx.fillRect(-2,z,4,.08);}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;
}

export class Arena {
  constructor(scene,world,crateScene) {
    this.scene=scene;this.world=world;this.blockers=[];this.targets=[];this.time=0;
    const sand=new THREE.MeshStandardMaterial({color:'#c3ab7a',roughness:1});
    const outside=new THREE.Mesh(new THREE.PlaneGeometry(350,350),sand);outside.rotation.x=-Math.PI/2;outside.position.y=-.025;scene.add(outside);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(84,84),new THREE.MeshStandardMaterial({map:surfaceTexture(),roughness:1}));
    ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
    this.makeBody([0,-.10,0],[84,.2,84],5);
    // Four matching static walls; repeated visual blocks use a single draw.
    const wallMaterial=new THREE.MeshStandardMaterial({color:'#8d8f74',roughness:.96});
    const walls=new THREE.InstancedMesh(new THREE.BoxGeometry(2.05,.85,.60),wallMaterial,148);
    const dummy=new THREE.Object3D();let index=0;
    for(let i=0;i<37;i++)for(let side=0;side<4;side++){
      const t=-37+i*2.05;dummy.position.set(side<2?t:(side===2?-38:38),.425,side<2?(side===0?-38:38):t);
      dummy.rotation.y=side<2?0:Math.PI/2;dummy.updateMatrix();walls.setMatrixAt(index++,dummy.matrix);
    }
    walls.receiveShadow=true;scene.add(walls);
    for(const [p,s] of [[[0,.55,-38],[77,1.1,.6]],[[0,.55,38],[77,1.1,.6]],[[-38,.55,0],[.6,1.1,77]],[[38,.55,0],[.6,1.1,77]]])this.addBlocker(p,s);
    const coverMaterial=new THREE.MeshStandardMaterial({color:'#65775d',roughness:.9});
    const cover=[[-10,.6,4,3,1.2,1.8],[10,.6,5,3,1.2,1.8],[-17,.6,-14,3.4,1.2,2],[15,.6,23,4,1.2,2]];
    for(const [x,y,z,w,h,d] of cover){const mesh=new THREE.Mesh(boxGeometry,coverMaterial);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);this.addBlocker([x,y,z],[w,h,d]);}
    // Low rocks outside the boundary frame the test ground without blocking it.
    const rockGeometry=new THREE.IcosahedronGeometry(1,0),rockMaterial=new THREE.MeshStandardMaterial({color:'#aa9168',roughness:1,flatShading:true});
    const rocks=new THREE.InstancedMesh(rockGeometry,rockMaterial,32);
    for(let i=0;i<32;i++){const angle=i/32*Math.PI*2,radius=42+(i%3)*2;dummy.position.set(Math.cos(angle)*radius,.8,Math.sin(angle)*radius);dummy.scale.set(1.7+(i%3),1.3+(i%2),2.5);dummy.rotation.set(.12*i,.43*i,0);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);}scene.add(rocks);
    let template;crateScene.traverse(o=>{if(!template&&o.isMesh)template=o;});if(!template)throw Error('Motri crate mesh missing');
    TARGET_POSITIONS.forEach(([x,z],id)=>this.createTarget(template,x,z,id));
  }
  makeBody(position,size,friction=.7) {
    return rigidBody.create(this.world,{shape:box.create({halfExtents:size.map(n=>n/2)}),motionType:MotionType.STATIC,objectLayer:this.world._OL_STATIC,position,friction,restitution:.05});
  }
  addBlocker(position,size) {
    const item={kind:'wall',active:true,bounds:new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...position),new THREE.Vector3(...size))};
    item.body=this.makeBody(position,size);this.blockers.push(item);return item;
  }
  createTarget(template,x,z,id) {
    const group=new THREE.Group();group.position.set(x,.65,z);
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
    if(target.health===0){target.active=false;target.group.visible=false;target.respawnAt=this.time+6;rigidBody.remove(this.world,target.body);target.body=null;return true;}
    return false;
  }
  restore(target) {
    if(target.body)rigidBody.remove(this.world,target.body);
    target.health=100;target.active=true;target.group.visible=true;target.bar.scale.x=1;target.flash=0;target.respawnAt=0;
    target.body=this.makeBody(target.position.toArray(),[1.3,1.3,1.3]);
  }
  reset(){for(const target of this.targets)this.restore(target);}
  update(dt,camera) {
    this.time+=dt;
    for(const target of this.targets){
      if(!target.active&&this.time>=target.respawnAt)this.restore(target);
      target.flash=Math.max(0,target.flash-dt);target.crate.material.emissive.setHex(target.flash>0?0x664516:0);
      target.bar.quaternion.copy(camera.quaternion);
    }
  }
}
