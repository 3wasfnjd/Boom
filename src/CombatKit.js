import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Fictional low-poly game attachments. No damage, aiming AI, or firing logic.
// All dimensions are scene units. These parts follow body suspension and lean.
const mats = {
  armor:new THREE.MeshStandardMaterial({color:'#475246',roughness:.88}),
  dark:new THREE.MeshStandardMaterial({color:'#1c2427',roughness:.65,metalness:.35}),
  metal:new THREE.MeshStandardMaterial({color:'#77807b',roughness:.55,metalness:.5}),
  accent:new THREE.MeshStandardMaterial({color:'#d3a957',roughness:.8})
};
for (const [id,mat] of Object.entries(mats)) mat.name='Combat_'+id;
function piece(group,geometry,position,material='armor',rotation=[0,0,0]) {
  const mesh = new THREE.Mesh(geometry,mats[material]);
  mesh.position.set(...position); mesh.rotation.set(...rotation);
  mesh.castShadow=mesh.receiveShadow=true; group.add(mesh); return mesh;
}
const box=(g,p,s,m='armor',r)=>piece(g,new THREE.BoxGeometry(...s),p,m,r);
const tube=(g,p,r,l,m='dark')=>piece(g,new THREE.CylinderGeometry(r,r,l,8),p,m,[Math.PI/2,0,0]);
const marker=(g,name,p)=>{const o=new THREE.Group();o.name=name;o.position.set(...p);g.add(o);return o;};

// Merge static pieces by material within each moving section, limiting draws.
function compact(group,prefix) {
  const buckets=new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh) continue;
    child.updateMatrix(); const geo=child.geometry.clone();geo.applyMatrix4(child.matrix);
    for (const key of Object.keys(geo.attributes)) if (!['position','normal'].includes(key)) geo.deleteAttribute(key);
    const nonindexed=geo.index?geo.toNonIndexed():geo;
    if (nonindexed!==geo) geo.dispose();
    const arr=buckets.get(child.material)||[];arr.push(nonindexed);buckets.set(child.material,arr);
    child.geometry.dispose();child.removeFromParent();
  }
  for (const [material,parts] of buckets) {
    const mesh=new THREE.Mesh(mergeGeometries(parts),material);
    for(const p of parts)p.dispose(); mesh.name=prefix+'_'+material.name;
    mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  }
}

export function addCombatKit(root, kind='machinegun') {
  if (!['machinegun','cannon','rockets'].includes(kind)) throw new Error('Unknown combat kit');
  const body=root.getObjectByName('body'),mount=root.getObjectByName('mount-primary');
  if (!body||!mount) throw new Error('Normalized body and weapon mount required');
  if (root.getObjectByName('armor-kit')) throw new Error('Combat kit already installed');
  const armor=new THREE.Group();armor.name='armor-kit';body.add(armor);
  if(root.userData.bodyStyle!=='h9') {
    box(armor,[0,-.105,-.86],[.69,.075,.65],'dark');
    box(armor,[0,.185,-.86],[.22,.61,.22],'dark');
  }else box(armor,[0,.741,-.12],[.50,.038,.44],'dark');
  // Side protection sits between axles so front tire steering remains free.
  for(const s of [-1,1]) {
    box(armor,[s*.709,-.05,0],[.062,.39,.93]);
    box(armor,[s*.718,-.27,0],[.09,.12,1.04],'dark');
    box(armor,[s*.747,.06,.13],[.006,.057,.28],'accent');
  }
  // Low bumper extensions preserve headlights, grille and license plate.
  box(armor,[0,-.40,1.61],[1.56,.16,.20]);
  box(armor,[0,-.47,-1.46],[1.52,.12,.12],'dark');
  for(const s of [-1,1]) box(armor,[s*.57,-.16,1.66],[.10,.31,.09],'dark');
  compact(armor,'Armor');
  const base=new THREE.Group();base.name='weapon-base';mount.add(base);
  piece(base,new THREE.CylinderGeometry(.29,.34,.09,12),[0,.045,0]);
  compact(base,'Base');
  const yaw=new THREE.Group();yaw.name='weapon-yaw';yaw.position.y=.10;mount.add(yaw);
  box(yaw,[0,.11,0],[.53,.23,.51]);
  for(const s of [-1,1])box(yaw,[s*.25,.28,.025],[.10,.34,.38],'dark');
  compact(yaw,'Turret');
  const pitch=new THREE.Group();pitch.name='weapon-pitch';pitch.position.set(0,.27,0);yaw.add(pitch);
  if(kind==='machinegun') {
    box(pitch,[0,0,.10],[.35,.19,.51],'dark');
    for(const s of [-1,1]) {
      tube(pitch,[s*.104,.022,.63],.033,.64);
      tube(pitch,[s*.104,.022,.92],.048,.09,'metal');
      marker(pitch,'muzzle-'+(s<0?'left':'right'),[s*.104,.022,.975]);
    }
    box(pitch,[0,-.04,-.17],[.46,.24,.23],'armor');
  }else if(kind==='cannon') {
    box(pitch,[0,0,-.025],[.34,.30,.48]);
    tube(pitch,[0,0,.56],.077,.94);
    tube(pitch,[0,0,.14],.11,.33,'metal');
    box(pitch,[0,0,1.07],[.22,.15,.20],'dark');
    box(pitch,[0,0,1.175],[.11,.083,.014],'metal');
    marker(pitch,'muzzle-cannon',[0,0,1.19]);
  }else{
    for(const s of [-1,1]) {
      box(pitch,[s*.235,.10,.05],[.39,.34,.61]);
      for(const x of [-.085,.085])for(const y of [.02,.18]) {
        tube(pitch,[s*.235+x,y,.15],.071,.48);
        tube(pitch,[s*.235+x,y,.40],.046,.09,'accent');
        marker(pitch,`muzzle-rocket-${s}-${x}-${y}`,[s*.235+x,y,.46]);
      }
      box(pitch,[s*.235,.29,.05],[.42,.055,.66],'dark');
    }
  }
  compact(pitch,'Weapon');
  mount.userData={kind,visualOnly:true,yawNode:'weapon-yaw',pitchNode:'weapon-pitch'};
  root.userData.combatWeapon=kind;
  return {armor,mount,yaw,pitch};
}
