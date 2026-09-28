import * as THREE from 'three';
import {buildDunes,DUNES,smooth} from './motri/DunesField.js';
import {LOOP_ROUTE,ROADS,TARGET_POSITIONS,groundTexture} from './WorldLayout.js';

const SIZE=100,DIVISIONS=96,SIDE=DIVISIONS+1,CELL=SIZE/DIVISIONS;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function sampleGrid(data,width,depth,x,z) {
  x=clamp(x,0,width-1);z=clamp(z,0,depth-1);
  const ix=Math.min(width-2,Math.floor(x)),iz=Math.min(depth-2,Math.floor(z)),u=x-ix,v=z-iz,k=iz*width+ix;
  return (1-v)*((1-u)*data[k]+u*data[k+1])+v*((1-u)*data[k+width]+u*data[k+width+1]);
}
function pathDistance(x,z,points) {
  let distance=Infinity;
  for(let i=1;i<points.length;i++){
    const [ax,az]=points[i-1],[bx,bz]=points[i],dx=bx-ax,dz=bz-az,t=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);
    distance=Math.min(distance,Math.hypot(x-ax-t*dx,z-az-t*dz));
  }
  return distance;
}
const rectangleDistance=(x,z,x0,z0,x1,z1)=>Math.hypot(Math.max(x0-x,0,x-x1),Math.max(z0-z,0,z-z1));
function terrainWeight(x,z) {
  let weight=1-smooth(40,44,Math.max(Math.abs(x),Math.abs(z)));
  weight*=smooth(4.4,7.5,pathDistance(x,z,LOOP_ROUTE));
  for(const road of ROADS)weight*=smooth(road.w/2+.6,road.w/2+3.6,pathDistance(x,z,road.p));
  weight*=smooth(0,3,rectangleDistance(x,z,-31.5,-12.7,-5.5,21));
  weight*=smooth(0,2.8,rectangleDistance(x,z,-4,-9,12,21));
  for(const [tx,tz] of TARGET_POSITIONS)weight*=smooth(1.5,3.2,Math.hypot(x-tx,z-tz));
  return weight;
}
function pixels(image) {
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);
  return {data:c.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};
}

// The rendered triangles, vehicle collision mesh and projectile sampler share
// this one height grid. Roads and service pads blend smoothly to level ground.
export class TerrainSurface {
  constructor(arena,assets) {
    const original=new Float32Array(assets.heightfield);
    if(original.length!==129*129)throw Error('Motri terrain height grid is incomplete');
    const sourceAt=(x,z)=>sampleGrid(original,129,129,(x/192+.5)*128,(z/192+.5)*128);
    // Reuse Motri's deterministic, slope-limited dune field without modifying it.
    const dunes=buildDunes(sourceAt),duneHeights=new Float32Array(dunes.width*dunes.depth);
    for(let i=0;i<duneHeights.length;i++)duneHeights[i]=dunes.positions[i*3+1];
    this.heights=new Float32Array(SIDE*SIDE);
    for(let iz=0;iz<SIDE;iz++)for(let ix=0;ix<SIDE;ix++){
      const x=-50+ix*CELL,z=-50+iz*CELL,base=sourceAt(x*1.92,z*1.92)*.7;
      const dx=(x-6)*3.8,dz=(z-2)*3.8;
      const dune=dx>=DUNES.minX&&dx<=DUNES.maxX&&dz>=DUNES.minZ&&dz<=DUNES.maxZ?
        sampleGrid(duneHeights,dunes.width,dunes.depth,dx-DUNES.minX,dz-DUNES.minZ)*.44:0;
      let height=(dune>0?dune:base)*terrainWeight(x,z);
      // A real shallow channel beneath the imported bridge, with sloping banks.
      const channel=(1-smooth(1.3,3,Math.abs(x-20)))*(1-smooth(3.3,5,Math.abs(z+20)));
      if(channel>0)height=height*(1-channel)-.85*channel;
      this.heights[iz*SIDE+ix]=height;
    }
    // Resampling and road blending must not create steep lips for a .5m sphere.
    for(let pass=0;pass<6;pass++)for(const direction of [1,-1])for(let n=0;n<this.heights.length;n++){
      const i=direction>0?n:this.heights.length-1-n,x=i%SIDE,z=Math.floor(i/SIDE);let h=this.heights[i];
      if(h===0)continue;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        if(x+dx<0||x+dx>=SIDE||z+dz<0||z+dz>=SIDE)continue;
        const other=this.heights[i+dx+dz*SIDE];h=h>0?Math.min(h,other+CELL*.48):Math.max(h,other-CELL*.48);
      }
      this.heights[i]=h;
    }
    const positions=[],uv=[],indices=[];
    for(let z=0;z<SIDE;z++)for(let x=0;x<SIDE;x++){positions.push(-50+x*CELL,this.heights[z*SIDE+x],-50+z*CELL);uv.push(x/DIVISIONS,z/DIVISIONS);}
    for(let z=0;z<DIVISIONS;z++)for(let x=0;x<DIVISIONS;x++){const a=z*SIDE+x,b=a+1,c=a+SIDE,d=c+1;indices.push(a,c,b,b,c,d);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    const base=this.paintSourceGround(assets.terrain.image,assets.slabs.image);
    this.mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:groundTexture(THREE,base),roughness:1}));this.mesh.name='MotriTerrain';this.mesh.receiveShadow=true;arena.scene.add(this.mesh);
    this.body=arena.world.createTerrain(positions,indices);
    this.stats={vertices:SIDE*SIDE,triangles:indices.length/3,minHeight:Math.min(...this.heights),maxHeight:Math.max(...this.heights)};
  }
  heightAt(x,z) {
    const gx=clamp((x+50)/CELL,0,DIVISIONS),gz=clamp((z+50)/CELL,0,DIVISIONS);
    const ix=Math.min(DIVISIONS-1,Math.floor(gx)),iz=Math.min(DIVISIONS-1,Math.floor(gz)),u=gx-ix,v=gz-iz,k=iz*SIDE+ix,h=this.heights;
    // Match the mesh's a-c-b / b-c-d diagonals exactly, not bilinear heights.
    return u+v<=1?h[k]*(1-u-v)+h[k+1]*u+h[k+SIDE]*v:h[k+1]*(1-v)+h[k+SIDE]*(1-u)+h[k+SIDE+1]*(u+v-1);
  }
  raycast(ray) {
    const end=ray.origin.clone().addScaledVector(ray.direction,160),fraction=this.trace(ray.origin,end);
    return fraction===null?null:ray.origin.clone().lerp(end,fraction);
  }
  trace(start,end,radius=0) {
    const clearance=t=>start.y+(end.y-start.y)*t-radius-this.heightAt(start.x+(end.x-start.x)*t,start.z+(end.z-start.z)*t);
    if(clearance(0)<=0)return 0;
    const steps=Math.max(1,Math.ceil(Math.hypot(end.x-start.x,end.z-start.z)/(CELL*.35)));
    for(let i=1;i<=steps;i++)if(clearance(i/steps)<=0){
      let lo=(i-1)/steps,hi=i/steps;
      for(let k=0;k<9;k++){const mid=(lo+hi)/2;if(clearance(mid)>0)lo=mid;else hi=mid;}
      return hi;
    }
    return null;
  }
  paintSourceGround(terrainImage,slabImage) {
    const terrain=pixels(terrainImage),slabs=pixels(slabImage),canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const c=canvas.getContext('2d'),image=c.createImageData(512,512),sand=[217,166,94],grass=[184,182,46],wet=[85,142,135];
    for(let py=0;py<512;py++)for(let px=0;px<512;px++){
      // Canvas top corresponds to +Z, as on Three's original rotated plane.
      const x=(px/511-.5)*100,z=(.5-py/511)*100,tx=Math.round(px/511*(terrain.width-1)),tz=Math.round((1-py/511)*(terrain.height-1));
      const ti=(tz*terrain.width+tx)*4,g=terrain.data[ti+1]/255,b=terrain.data[ti+2]/255,r=terrain.data[ti]/255;
      const h=this.heightAt(x,z),dune=smooth(.02,.3,h),water=Math.min(b,clamp(-h/.7,0,1))*(1-dune),plant=g*(1-dune);
      const sx=((Math.floor(x*.175*slabs.width)%slabs.width)+slabs.width)%slabs.width,sz=((Math.floor(z*.175*slabs.height)%slabs.height)+slabs.height)%slabs.height;
      const slab=slabs.data[(sz*slabs.width+sx)*4]/255,stoneLow=[168,119,98],stoneHigh=[255,207,139];
      const grain=.97+.03*Math.sin(px*12.97+py*78.23),out=(py*512+px)*4;
      for(let k=0;k<3;k++){
        let color=sand[k]*(1-water)+wet[k]*water;color=color*(1-plant)+grass[k]*plant;
        const paving=stoneLow[k]*(1-slab)+stoneHigh[k]*slab;color=color*(1-r*.65*(1-dune))+paving*r*.65*(1-dune);
        image.data[out+k]=clamp(color*grain+(dune?10*dune:0),0,255);
      }
      image.data[out+3]=255;
    }
    c.putImageData(image,0,0);return canvas;
  }
}
