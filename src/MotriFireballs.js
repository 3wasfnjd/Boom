import * as THREE from 'three';
// WebGL port of Motri Fireballs.js and Noises.perlinNode: same sphere,
// triplanar noise dissolve, red/orange emission and 0.6/2.25s animation.
function perlinTexture(){
 const fract=x=>x-Math.floor(x),mod=x=>(x%6+6)%6,random=(x,y)=>[-1+2*fract(Math.sin(x*127.1+y*311.7)*43758.5453123),-1+2*fract(Math.sin(x*269.5+y*183.3)*43758.5453123)],data=new Uint8Array(128*128);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){const u=(x+.5)/128*6,v=(y+.5)/128*6,ix=Math.floor(u),iy=Math.floor(v),fx=fract(u),fy=fract(v),sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),dots=[];
  for(const [dx,dy] of [[0,0],[1,0],[0,1],[1,1]]){const d=random(mod(ix+dx),mod(iy+dy));dots.push(d[0]*(fx-dx)+d[1]*(fy-dy));}
  const a=dots[0]*(1-sx)+dots[1]*sx,b=dots[2]*(1-sx)+dots[3]*sx,n=((a*(1-sy)+b*sy)*.8+.5-.1)/.8;data[y*128+x]=Math.max(0,Math.min(255,Math.round(n*255)));
 }
 const texture=new THREE.DataTexture(data,128,128,THREE.RedFormat);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
export class MotriFireballs {
 constructor(scene){this.scene=scene;this.items=[];this.audio=null;this.buffers=[];const noise=perlinTexture(),geometry=new THREE.SphereGeometry(.5,12,6);
  for(let i=0;i<18;i++){const material=new THREE.ShaderMaterial({uniforms:{noiseMap:{value:noise},progress:{value:.15},floorY:{value:0},fogColor:{value:scene.fog.color}},vertexShader:`varying vec3 p;varying vec3 n;varying vec3 w;varying float depth;void main(){p=position;n=normal;vec4 world=modelMatrix*vec4(position,1.);w=world.xyz;vec4 view=modelViewMatrix*vec4(position,1.);depth=-view.z;gl_Position=projectionMatrix*view;}`,fragmentShader:`uniform sampler2D noiseMap;uniform float progress;uniform float floorY;uniform vec3 fogColor;varying vec3 p;varying vec3 n;varying vec3 w;varying float depth;void main(){vec3 weights=abs(normalize(n));weights/=weights.x+weights.y+weights.z;float value=texture2D(noiseMap,p.yz*.8).r*weights.x+texture2D(noiseMap,p.xz*.8+.8).r*weights.y+texture2D(noiseMap,p.xy*.8+1.6).r*weights.z;value=(value-.15)/.75;value*=clamp((w.y-floorY)*4.,0.,1.);value-=progress;if(value<0.)discard;vec3 emission=mix(vec3(1.,0.,0.),vec3(1.,.376262,0.),value)*8.;vec3 c=mix(emission,vec3(.018),1.-step(.1,value));gl_FragColor=vec4(mix(c,fogColor,smoothstep(48.,110.,depth)),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,toneMapped:true});const mesh=new THREE.Mesh(geometry,material);mesh.visible=false;scene.add(mesh);this.items.push({mesh,age:9,radius:0});}
  const unlock=()=>{if(this.audio)return;try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;this.audio=new Audio();for(const n of [2,3])fetch(new URL(`assets/audio/motri-explosion-${n}.mp3`,document.baseURI)).then(r=>r.arrayBuffer()).then(b=>this.audio.decodeAudioData(b)).then(b=>this.buffers.push(b)).catch(()=>{});}catch{}};
  window.addEventListener('pointerdown',unlock,{once:true});window.addEventListener('keydown',unlock,{once:true});
 }
 create(position,radius=2.5,floor=0,listener=position){const item=this.items.find(i=>i.age>=2.25)||this.items.reduce((a,b)=>a.age>b.age?a:b);item.age=0;item.radius=radius;item.mesh.position.copy(position);item.mesh.rotation.set(Math.random()*6.28,Math.random()*6.28,0);item.mesh.scale.setScalar(.25);item.mesh.visible=true;item.mesh.material.uniforms.floorY.value=floor;item.mesh.material.uniforms.progress.value=.15;
  if(this.audio&&this.buffers.length){this.audio.resume().catch(()=>{});const source=this.audio.createBufferSource(),gain=this.audio.createGain();source.buffer=this.buffers[Math.floor(Math.random()*this.buffers.length)];source.playbackRate.value=.9+Math.random()*.3;gain.gain.value=.45*Math.max(0,1-position.distanceTo(listener)/35);source.connect(gain);gain.connect(this.audio.destination);source.start();source.onended=()=>{source.disconnect();gain.disconnect();};}
 }
 update(dt){for(const i of this.items){if(i.age>=2.25)continue;i.age+=dt;i.mesh.visible=i.age<2.25;const t=Math.min(1,i.age/.6);i.mesh.scale.setScalar(.25+(i.radius-.25)*(1-(1-t)**4));i.mesh.rotation.z=-i.age/2.25;i.mesh.material.uniforms.progress.value=.15+.85*Math.max(0,(i.age-.25)/2);}}
 clear(){for(const i of this.items){i.age=9;i.mesh.visible=false;}}
}
