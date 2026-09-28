import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {seededRandom,WIND_DIRECTION} from './AtmosphereRules.js';
import {vegetationClearance} from './WorldLayout.js';

export function environmentUniforms(){return {
  boomTime:{value:0},boomWind:{value:.45},boomRain:{value:0},boomClouds:{value:0},
  boomPlayer:{value:new THREE.Vector3()},boomFocus:{value:new THREE.Vector3()},
  boomWindDirection:{value:new THREE.Vector2(...WIND_DIRECTION)}
};}

// Motri's two travelling wind frequencies, evaluated in GLSL instead of TSL.
const windGLSL=`
uniform float boomTime,boomWind,boomRain;
uniform vec2 boomWindDirection;
uniform vec3 boomPlayer,boomFocus;
float breeze(vec2 p){return (sin(dot(p,vec2(.31,.21))+boomTime*1.7)*.55+
  sin(dot(p,vec2(.13,-.17))+boomTime*.71)*.45)*boomWind;}
`;

export class MotriGrass {
  constructor(scene,terrain,uniforms,mobile){
    this.meshes=[];this.count=0;this.uniforms=uniforms;this.maxDistance=mobile?25:34;
    const random=seededRandom(),spacing=mobile?.38:.29,baseColor=new THREE.Color('#b8b62e');
    const material=new THREE.MeshLambertMaterial({name:'MotriGrass',vertexColors:true,side:THREE.DoubleSide});
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\n${windGLSL}\nattribute vec3 bladeRoot;attribute float bladeTip,bladeSide;`)
        .replace('#include <begin_vertex>',`#include <begin_vertex>
          vec2 facing=normalize(vec2(viewMatrix[0][0],viewMatrix[2][0]));
          transformed.xz=bladeRoot.xz+facing*bladeSide;
          float fade=1.-smoothstep(${this.maxDistance-6}.,${this.maxDistance}.,distance(bladeRoot.xz,boomFocus.xz));
          transformed=mix(bladeRoot,transformed,fade);
          float push=1.-smoothstep(.45,1.1,distance(bladeRoot.xz,boomPlayer.xz));
          vec2 away=(bladeRoot.xz-boomPlayer.xz)/max(.1,distance(bladeRoot.xz,boomPlayer.xz));
          transformed.xz+=bladeTip*(boomWindDirection*breeze(bladeRoot.xz)*.23+away*push*.27);
          transformed.y-=bladeTip*push*.18;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float boomRain;')
        .replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(vNormal);')
        .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=1.-boomRain*.15;');
    };
    material.customProgramCacheKey=()=>`boom-grass-${this.maxDistance}-v1`;
    this.material=material;
    // Fixed tiles can be culled normally, with no per-frame buffer uploads.
    for(let tz=-50;tz<50;tz+=20)for(let tx=-50;tx<50;tx+=20){
      const p=[],roots=[],tips=[],sides=[],colors=[],normals=[];
      for(let z=tz;z<tz+20;z+=spacing)for(let x=tx;x<tx+20;x+=spacing){
        const bx=x+(random()-.5)*spacing,bz=z+(random()-.5)*spacing;
        const density=terrain.grassAt(bx,bz)*vegetationClearance(bx,bz);
        if(random()>density||density<.1)continue;
        for(let tuft=0;tuft<3;tuft++){
        const gx=bx+(random()-.5)*.22,gz=bz+(random()-.5)*.22;
        if(vegetationClearance(gx,gz)<.08)continue;
        const by=terrain.heightAt(gx,gz)+.012,h=.18+random()*.23,w=.022+random()*.025,angle=random()*Math.PI*2;
        const dx=Math.cos(angle)*w,dz=Math.sin(angle)*w,shade=.75+random()*.35;
        p.push(gx-dx,by,gz-dz,gx+dx,by,gz+dz,gx+dx*.3,by+h,gz+dz*.3);
        for(let k=0;k<3;k++){roots.push(gx,by,gz);tips.push(k===2?1:0);sides.push(k===0?-w:k===1?w:w*.3);normals.push(0,1,0);const s=shade*(k===2?1.1:.8);colors.push(baseColor.r*s,baseColor.g*s,baseColor.b*s);}
        this.count++;
        }
      }
      if(!p.length)continue;
      const geometry=new THREE.BufferGeometry();
      for(const [key,data,size] of [['position',p,3],['normal',normals,3],['color',colors,3],['bladeRoot',roots,3],['bladeTip',tips,1],['bladeSide',sides,1]])geometry.setAttribute(key,new THREE.Float32BufferAttribute(data,size));
      geometry.computeBoundingBox();geometry.boundingBox.expandByScalar(.5);geometry.computeBoundingSphere();geometry.boundingSphere.radius+=.5;
      const mesh=new THREE.Mesh(geometry,material);mesh.name='MotriGrassTile';mesh.receiveShadow=true;scene.add(mesh);this.meshes.push(mesh);
    }
  }
}

// Same leaf-card clusters and SDF texture as Motri's Foliage.js. The shared
// canopy geometry uses fewer cards for mobile and keeps the original GLB pivots.
export function createMotriFoliage(texture,uniforms,mobile){
  const random=seededRandom(5517),planes=[],count=mobile?32:48;
  for(let i=0;i<count;i++){
    const plane=new THREE.PlaneGeometry(.8,.8);
    const p=new THREE.Vector3().setFromSpherical(new THREE.Spherical(1-Math.pow(random(),3),Math.acos(2*random()-1),random()*Math.PI*2));
    plane.rotateZ(random()*Math.PI*2);plane.rotateX(-.48);plane.rotateY(i%2?Math.PI/2:.22);plane.translate(p.x,p.y,p.z);
    const normal=plane.getAttribute('normal'),position=plane.getAttribute('position');
    for(let j=0;j<normal.count;j++){const n=new THREE.Vector3().fromBufferAttribute(position,j).normalize();normal.setXYZ(j,n.x,n.y,n.z);}
    planes.push(plane);
  }
  const geometry=mergeGeometries(planes);planes.forEach(p=>p.dispose());
  texture.colorSpace=THREE.NoColorSpace;
  const material=new THREE.MeshStandardMaterial({name:'MotriFoliage',color:'#a5b748',alphaMap:texture,alphaTest:.3,side:THREE.DoubleSide,roughness:1});
  const patch=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\n${windGLSL}`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vec2 treeOrigin=instanceMatrix[3].xz;
        transformed.xz+=boomWindDirection*breeze(treeOrigin+position.xz)*.07*(position.y+1.5);`);
  };
  material.onBeforeCompile=patch;material.customProgramCacheKey=()=> 'boom-foliage-v1';
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,alphaMap:texture,alphaTest:.3,side:THREE.DoubleSide});
  depth.onBeforeCompile=patch;depth.customProgramCacheKey=()=> 'boom-foliage-depth-v1';
  material.userData.depth=depth;
  return {geometry,material,cardsPerCrown:count};
}
