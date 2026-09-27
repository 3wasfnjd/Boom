import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {prepareMotriVehicle,VEHICLES} from './prepareMotriVehicle.js';

const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();
const env=pmrem.fromScene(room,.035).texture;room.dispose();pmrem.dispose();
const scenes=[],models={},cameras=[];let combat=true,selected=0;
try{
 const source=(await new GLTFLoader().loadAsync('originals/motri-default.glb')).scene;
 for(const [i,v] of VEHICLES.entries()){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#171c1e');scene.environment=env;scene.environmentIntensity=.65;
  scene.add(new THREE.HemisphereLight('#e9f4ff','#53533d',2));
  const light=new THREE.DirectionalLight('#fff5df',3.5);light.position.set(4,7,5);light.castShadow=true;
  light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-4;light.shadow.camera.right=4;light.shadow.camera.top=4;light.shadow.camera.bottom=-4;light.shadow.normalBias=.025;scene.add(light);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#151b1d',roughness:1}));plane.rotation.x=-Math.PI/2;plane.position.y=-.008;plane.receiveShadow=true;scene.add(plane);
  const camera=new THREE.PerspectiveCamera(34,1,.1,80);camera.position.set(3.9,3.05,5.6);camera.lookAt(0,1.05,0);
  const base=prepareMotriVehicle(source,v.id),armed=prepareMotriVehicle(source,v.id,{combat:true});
  models[v.id]={base,combat:armed};scene.add(base,armed);base.visible=false;
  scenes.push(scene);cameras.push(camera);
 }
 function render(){
  renderer.setScissorTest(true);const mobile=innerWidth<650,w=innerWidth/(mobile?1:3),h=innerHeight;
  scenes.forEach((scene,i)=>{
   if(mobile&&i!==selected)return;
   const camera=cameras[i];camera.aspect=w/h;camera.updateProjectionMatrix();
   const target=new THREE.Vector3(0,1.14,0),direction=new THREE.Vector3(3.9,2.1,5.6).normalize();
   let distance=7;const bounds=new THREE.Box3().setFromObject(models[VEHICLES[i].id].combat);
   for(let step=0;step<3;step++){
    camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateMatrixWorld(true);
    let ratio=1;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
     const point=new THREE.Vector3(x,y,z).project(camera);ratio=Math.max(ratio,Math.abs(point.x)/.86,Math.abs(point.y)/.64);
    }
    distance*=ratio;
   }
   camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);
   const x=mobile?0:i*w;renderer.setViewport(x,0,w,h);renderer.setScissor(x,0,w,h);renderer.render(scene,camera);
  });
 }
 document.querySelectorAll('.labels>div').forEach((el,i)=>{el.style.pointerEvents='auto';el.style.cursor='pointer';el.onclick=()=>{selected=i;render();};});
 window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);render();});
 document.getElementById('toggle').onclick=()=>{
  combat=!combat;for(const model of Object.values(models)){model.base.visible=!combat;model.combat.visible=combat;}
  document.getElementById('toggle').textContent=combat?'عرض السيارات بدون إضافات':'عرض التجهيزات القتالية';render();
 };
 render();
 window.exportVehicle=async(id,variant)=>{
  const model=models[id][variant].clone(true);model.visible=true;
  const result=await new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:true});
  let text='';for(const byte of new Uint8Array(result))text+=String.fromCharCode(byte);
  return btoa(text);
 };
 window.modelStats=()=>Object.fromEntries(Object.entries(models).map(([id,variants])=>[id,Object.fromEntries(Object.entries(variants).map(([key,model])=>{
  let triangles=0,draws=0;model.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;draws++;}});
  model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model);
  return[key,{triangles,draws,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}}];
 }))]));
 window.ready=true;
}catch(e){document.getElementById('error').textContent=e.stack;throw e;}
