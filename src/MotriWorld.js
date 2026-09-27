import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ARENA_HALF,REST_HOUSE,BRIDGE,COVER,QUARRY_ROCKS,OUTSIDE_TREES} from './WorldLayout.js';

import {TerrainSurface} from './TerrainSurface.js';

const up=new THREE.Vector3(0,1,0),unit=new THREE.Vector3(1,1,1);
const helper=/^(cuboid|hull|trimesh|tube|ball)/i;
// Motri's RestHouseStyle palette, adapted from its node material to WebGL.
const housePalette={RH_Walls:['#f5e6c5'],RH_Pergola:['#f5e6c5'],RH_Roofs:['#c9ac7d'],RH_Ground:['#dbaa66'],RH_Lawn:['#769543'],RH_BlueRailings:['#42888f'],RH_DoorPanels:['#394d55'],RH_Gate_Left:['#38484e','#53696c'],RH_Gate_Right:['#38484e','#53696c'],RH_Glass:['#344c59'],RH_WindowFrames:['#3e555d','#d3c5a8'],RH_RoofTanks:['#cee0d2','#e1ecd9'],RH_Tent:['#65594c','#91816a','#d8b983','#efd39c'],RH_Basins:['#779677','#bda577','#ded0a7']};

function geometryCopy(geometry) {
  const copy=geometry.index?geometry.toNonIndexed():geometry.clone();
  for(const name of Object.keys(copy.attributes)) {
    if(!['position','normal','color','uv'].includes(name)){copy.deleteAttribute(name);continue;}
    const source=copy.getAttribute(name),data=new Float32Array(source.count*source.itemSize);
    for(let i=0;i<source.count;i++)for(let j=0;j<source.itemSize;j++)data[i*source.itemSize+j]=source.getComponent(i,j);
    copy.setAttribute(name,new THREE.BufferAttribute(data,source.itemSize));
  }
  return copy;
}

class StaticBatches {
  constructor(scene){this.scene=scene;this.items=new Map();this.instances=0;this.draws=0;}
  add(geometry,material,matrix,shadow=true,color=null) {
    const key=geometry.uuid+material.uuid+shadow;
    if(!this.items.has(key))this.items.set(key,{geometry,material,matrices:[],colors:[],shadow});
    const item=this.items.get(key);item.matrices.push(matrix.clone());item.colors.push(color);this.instances++;
  }
  finish() {
    for(const item of this.items.values()) {
      const mesh=new THREE.InstancedMesh(item.geometry,item.material,item.matrices.length);
      mesh.name='MotriInstances_'+item.material.name;mesh.castShadow=item.shadow;mesh.receiveShadow=true;
      item.matrices.forEach((matrix,i)=>{mesh.setMatrixAt(i,matrix);if(item.colors[i])mesh.setColorAt(i,item.colors[i]);});
      mesh.computeBoundingBox();mesh.computeBoundingSphere();this.scene.add(mesh);this.draws++;
    }
    this.items.clear();
  }
}

function prefab(root,palette,lampMaterial,{bridge=false,lamp=false}={}) {
  root=root.clone(true);root.position.set(0,0,0);root.quaternion.identity();root.updateMatrixWorld(true);
  const bounds=new THREE.Box3();
  root.traverse(node=>{if(node.isMesh&&!helper.test(node.name)){node.geometry.computeBoundingBox();bounds.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));}});
  const center=bounds.getCenter(new THREE.Vector3());
  if(bridge){const deck=root.children.find(n=>n.name==='cuboid');center.set(deck.position.x,deck.position.y+deck.scale.y/2,deck.position.z);}
  else center.y=bounds.min.y;
  root.position.sub(center);root.updateMatrixWorld(true);
  const result={parts:[],colliders:[]};
  root.traverse(node=>{
    if(helper.test(node.name)) {
      let matrix=node.matrixWorld.clone();
      if(!node.name.startsWith('cuboid')&&node.geometry){node.geometry.computeBoundingBox();const box=node.geometry.boundingBox;matrix.multiply(new THREE.Matrix4().compose(box.getCenter(new THREE.Vector3()),new THREE.Quaternion(),box.getSize(new THREE.Vector3())));}
      result.colliders.push({matrix,name:node.name,surface:bridge&&node.name==='cuboid'});return;
    }
    if(!node.isMesh)return;
    const material=node.name.startsWith('glass')?lampMaterial:palette;
    result.parts.push({geometry:node.geometry,material,matrix:node.matrixWorld.clone()});
  });
  if(lamp){result.colliders=[{matrix:new THREE.Matrix4().compose(new THREE.Vector3(0,1.72,0),new THREE.Quaternion(),new THREE.Vector3(.25,3.44,.25)),name:'lamp-post'}];}
  if(!result.colliders.length&&!lamp){const size=bounds.getSize(new THREE.Vector3());result.colliders.push({matrix:new THREE.Matrix4().compose(new THREE.Vector3(0,size.y/2,0),new THREE.Quaternion(),size),name:'solid'});}
  return result;
}

export class MotriWorld {
  constructor(arena,assets) {
    this.arena=arena;this.scene=arena.scene;this.batches=new StaticBatches(this.scene);this.treeCount=0;this.propCount=0;
    assets.palette.colorSpace=THREE.SRGBColorSpace;assets.palette.flipY=false;assets.palette.magFilter=assets.palette.minFilter=THREE.NearestFilter;assets.palette.generateMipmaps=false;
    this.palette=new THREE.MeshStandardMaterial({name:'MotriPalette',map:assets.palette,roughness:.95});
    this.lampMaterial=new THREE.MeshBasicMaterial({name:'MotriLanternGlow',color:'#ffcd81'});
    this.leafMaterial=new THREE.MeshStandardMaterial({name:'MotriOakCrown',color:'#91a34e',roughness:1,flatShading:true});
    this.prefabs={fence:prefab(assets.fence.children[0],this.palette,this.lampMaterial),brick:prefab(assets.brick.children[0],this.palette,this.lampMaterial),lamp:prefab(assets.lamp.children[0],this.palette,this.lampMaterial,{lamp:true})};
    const scenery=assets.scenery.children;
    this.prefabs.bridge=prefab(scenery.find(n=>n.name==='bridgePhysicalFixed'),this.palette,this.lampMaterial,{bridge:true});
    this.prefabs.rockA=prefab(scenery.find(n=>n.name==='basaltRocksPhysicalStatic001'||n.name==='basaltRocksPhysicalStatic.001'),this.palette,this.lampMaterial);
    this.prefabs.rockB=prefab(scenery.find(n=>n.name==='basaltRocksPhysicalStatic003'||n.name==='basaltRocksPhysicalStatic.003'),this.palette,this.lampMaterial);
    // GLTFLoader sanitizes names containing dots, so match prefixes for helpers.
    this.oak=assets.oak;this.oak.updateMatrixWorld(true);
    this.buildGround(assets);this.buildBoundary();this.buildHouse(assets.house,assets.paving);this.buildProps();this.buildPlanting();this.buildSigns();this.batches.finish();
    this.stats={propInstances:this.propCount,trees:this.treeCount,batchDraws:this.batches.draws,staticInstances:this.batches.instances,houseTriangles:this.houseTriangles,terrain:this.terrain.stats};
  }
  buildGround(assets) {
    this.terrain=new TerrainSurface(this.arena,assets);
    // An outer ring leaves the depressed terrain unobstructed underneath.
    const ring=new THREE.BufferGeometry(),v=[];
    for(const r of [50,175])for(const [x,z] of [[-1,-1],[1,-1],[1,1],[-1,1]])v.push(x*r,-.025,z*r);
    ring.setAttribute('position',new THREE.Float32BufferAttribute(v,3));const indices=[];
    for(let i=0;i<4;i++){const j=(i+1)%4;indices.push(i,j,i+4,j,j+4,i+4);}ring.setIndex(indices);ring.computeVertexNormals();
    const outside=new THREE.Mesh(ring,new THREE.MeshStandardMaterial({color:'#d9a65e',roughness:1,side:THREE.DoubleSide}));this.scene.add(outside);
  }
  place(name,position,scale=1,yaw=0,collide=true) {
    if(name!=='bridge')position=[position[0],position[1]+this.terrain.heightAt(position[0],position[2]),position[2]];
    const source=this.prefabs[name],matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromAxisAngle(up,yaw),new THREE.Vector3().setScalar(scale));
    for(const part of source.parts)this.batches.add(part.geometry,part.material,matrix.clone().multiply(part.matrix),name!=='fence');
    if(collide)for(const shape of source.colliders){
      const transform=matrix.clone().multiply(shape.matrix),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();transform.decompose(p,q,s);
      this.arena.addBlocker(p.toArray(),s.toArray(),{quaternion:q.toArray(),name:name+':'+shape.name,surface:!!shape.surface,friction:shape.surface?5:.7});
    }
    this.propCount++;
  }
  buildBoundary() {
    for(let i=0;i<46;i++)for(let side=0;side<4;side++){
      const t=-45+i*2;this.place('fence',[side<2?t:(side===2?-46:46),0,side<2?(side===0?-46:46):t],1,side<2?0:Math.PI/2,false);
    }
    for(const [p,s] of [[[0,.62,-46],[94,1.24,.31]],[[0,.62,46],[94,1.24,.31]],[[-46,.62,0],[.31,1.24,94]],[[46,.62,0],[.31,1.24,94]]])this.arena.addBlocker(p,s,{name:'boundary'});
  }
  buildHouse(scene,paving) {
    const root=scene.getObjectByName('RestHouse_Root');if(!root)throw Error('Motri rest-house root missing');
    root.position.fromArray(REST_HOUSE.position);root.scale.setScalar(REST_HOUSE.scale);
    this.gardenShapes=JSON.parse(root.userData.collision_boxes_json).filter(s=>s.name==='tree_trunk');
    let shapes=JSON.parse(root.userData.collision_boxes_json).filter(s=>s.name!=='tree_trunk');
    // Open a second, visible exit through the long east perimeter wall.
    // Remove only that wall's triangles, then rebuild its two remaining spans.
    const walls=root.getObjectByName('RH_Walls'),geometry=walls.geometry.clone(),pos=geometry.getAttribute('position'),index=geometry.index;
    const kept=[];let removed=0;
    for(let i=0;i<(index?index.count:pos.count);i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);if(ids.every(j=>pos.getX(j)>24.92&&pos.getY(j)<2.72))removed++;else kept.push(...ids);}
    if(removed<8)throw Error('Rest-house east-wall extraction did not match source');
    geometry.setIndex(kept);walls.geometry=geometry;this.removedWallTriangles=removed;
    shapes=shapes.filter(s=>s.name!=='wall_left');
    for(const [a,b] of [[0,18],[25,48.54]]){
      const size=[.26,2.65,b-a],center=[25.07,1.325,(a+b)/2],mesh=new THREE.Mesh(new THREE.BoxGeometry(...size));mesh.name='RH_Walls';mesh.position.fromArray(center);
      const colors=new Float32Array(mesh.geometry.getAttribute('position').count*3).fill(1);mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));root.add(mesh);
      shapes.push({name:'side_exit_wall',center,size,rotationY:0});
    }
    root.updateMatrixWorld(true);
    for(const shape of shapes){const p=root.localToWorld(new THREE.Vector3(...shape.center));this.arena.addBlocker(p.toArray(),shape.size.map(n=>n*REST_HOUSE.scale),{name:'house:'+shape.name,quaternion:new THREE.Quaternion().setFromAxisAngle(up,shape.rotationY||0).toArray(),surface:shape.size[1]<.22,friction:shape.size[1]<.22?5:.7});}
    for(const [center,size] of [[[5.2,-.15,24.4],[40,.3,48.8]],[[0,-.15,-3.2],[6.8,.3,6.4]]]){const p=root.localToWorld(new THREE.Vector3(...center));this.arena.makeBody(p.toArray(),size.map(n=>n*REST_HOUSE.scale),5);}
    const paint=new THREE.MeshStandardMaterial({name:'RestHouse_GamePalette',vertexColors:true,roughness:1});
    paving.colorSpace=THREE.SRGBColorSpace;paving.flipY=false;paving.wrapS=paving.wrapT=THREE.MirroredRepeatWrapping;paving.repeat.set(.35,.35);paving.anisotropy=2;
    const pavingMaterial=new THREE.MeshStandardMaterial({name:'RestHouse_GamePaving',map:paving,roughness:1});
    const painted=[],paved=[];this.houseTriangles=0;
    root.traverse(mesh=>{
      if(!mesh.isMesh)return;const copy=geometryCopy(mesh.geometry),color=copy.getAttribute('color');
      if(color){
        const palette=(housePalette[mesh.name]||['#e5cfaa']).map(hex=>new THREE.Color(hex)),shades=[];
        for(let i=0;i<color.count;i++)shades.push(Math.round((color.getX(i)+color.getY(i)+color.getZ(i))/3*1000));
        const levels=[...new Set(shades)].sort((a,b)=>a-b),ranks=new Map(levels.map((level,i)=>[level,i]));
        for(let i=0;i<color.count;i++){const c=palette[Math.round(ranks.get(shades[i])/Math.max(1,levels.length-1)*(palette.length-1))];color.setXYZ(i,c.r,c.g,c.b);}
        copy.deleteAttribute('uv');painted.push(copy);
      }else paved.push(copy);
      copy.applyMatrix4(mesh.matrixWorld);this.houseTriangles+=copy.getAttribute('position').count/3;
    });
    for(const [parts,material] of [[painted,paint],[paved,pavingMaterial]]){
      const merged=mergeGeometries(parts),mesh=new THREE.Mesh(merged,material);mesh.name='MotriRestHouse';mesh.castShadow=mesh.receiveShadow=true;this.scene.add(mesh);for(const part of parts)part.dispose();
    }
    this.houseRoot=root;
    this.landmarks={entrance:root.localToWorld(new THREE.Vector3(0,0,-3)).toArray(),sideExit:root.localToWorld(new THREE.Vector3(25.07,0,21.5)).toArray(),bridge:[...BRIDGE.position]};
  }
  buildProps() {
    this.place('bridge',BRIDGE.position,BRIDGE.scale,BRIDGE.yaw);
    // Three-brick covers keep the central driving lanes open.
    for(const [x,z,yaw] of COVER){
      for(const [offset,y] of [[-.55,0],[.55,0],[0,.6375]])this.place('brick',[x+Math.cos(yaw)*offset,y,z-Math.sin(yaw)*offset],.85,yaw);
    }
    QUARRY_ROCKS.forEach(([x,z,scale,yaw],i)=>this.place(i%2?'rockA':'rockB',[x,0,z],scale,yaw));
    for(let i=0;i<24;i++){const angle=i/24*Math.PI*2,radius=53+(i%3)*3;this.place(i%2?'rockA':'rockB',[Math.cos(angle)*radius,-.25,Math.sin(angle)*radius],.85+(i%4)*.22,i*.7,false);}
    for(const [x,z,yaw] of [[-24.8,-10.5,Math.PI/2],[-5.2,2,Math.PI/2],[7,-3,0],[12,10,0],[29,-24,0],[-28.8,26,0],[28,28,0],[-28,-25,0]])this.place('lamp',[x,0,z],.9,yaw);
    // Motri's yellow barriers frame two cover pockets, without closing routes.
    for(const [x,z,yaw] of [[11,0,Math.PI/2],[11,2.2,Math.PI/2],[23,-8,0],[25.15,-8,0],[-2,22,0],[.15,22,0]])this.place('fence',[x,0,z],1,yaw);
  }
  tree(position,scale,yaw,collide) {
    const placement=new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromAxisAngle(up,yaw),new THREE.Vector3().setScalar(scale));
    this.oak.traverse(node=>{
      if(!node.isMesh)return;
      const leaf=node.name.startsWith('treeLeaves'),color=leaf?new THREE.Color().setHSL(.205+(this.treeCount%4)*.009,.38,.57):null;
      this.batches.add(node.geometry,leaf?this.leafMaterial:this.palette,placement.clone().multiply(node.matrixWorld),true,color);
    });
    if(collide)this.arena.addBlocker([position[0],position[1]+2.5*scale,position[2]],[.30*scale,5*scale,.30*scale],{name:'oak-trunk'});
    this.treeCount++;
  }
  buildPlanting() {
    this.gardenShapes.filter((_,i)=>i%2===0).forEach((shape,i)=>{
      const p=this.houseRoot.localToWorld(new THREE.Vector3(shape.center[0],.02,shape.center[2]));
      // Keep Motri's planted tree locations and its height conversion.
      this.tree(p.toArray(),shape.size[1]*REST_HOUSE.scale/.8/8.3,i*2.399963,false);
    });
    OUTSIDE_TREES.forEach(([x,z],i)=>this.tree([x,this.terrain.heightAt(x,z)+.01,z],.38+(i%4)*.035,i*2.399963,true));
  }
  buildSigns() {
    const postMaterial=new THREE.MeshStandardMaterial({color:'#414b40',roughness:1}),postGeometry=new THREE.BoxGeometry(.10,1.5,.10);
    for(const [label,x,z] of [['الاستراحة',-23,-11.8],['ساحة الرماية',3,-3.8],['الجسر',14,-22.6]]){
      const groundY=this.terrain.heightAt(x,z);
      const canvas=document.createElement('canvas');canvas.width=384;canvas.height=128;const c=canvas.getContext('2d');
      c.fillStyle='#304738';c.fillRect(0,0,384,128);c.strokeStyle='#ceb36e';c.lineWidth=6;c.strokeRect(7,7,370,114);c.fillStyle='#f7e7bd';c.font='bold 46px Tahoma,Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(label,192,64);
      const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.4,.8),new THREE.MeshStandardMaterial({map,roughness:1,side:THREE.DoubleSide}));sign.position.set(x,groundY+1.6,z);sign.rotation.y=Math.PI;this.scene.add(sign);
      for(const dx of [-.9,.9]){const matrix=new THREE.Matrix4().makeTranslation(x+dx,groundY+.75,z);this.batches.add(postGeometry,postMaterial,matrix);this.arena.addBlocker([x+dx,groundY+.75,z],[.10,1.5,.10],{name:'sign-post'});}
    }
  }
}
