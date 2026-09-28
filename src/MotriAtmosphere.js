import * as THREE from 'three';
import {weatherAt,DAY_KEYS,DAY_PALETTES,smooth,seededRandom} from './AtmosphereRules.js';

const noiseGLSL=`
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float cloudNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
float cloudField(vec2 p){return cloudNoise(p)*.65+cloudNoise(p*2.07+5.3)*.35;}
`;

export class MotriAtmosphere {
  constructor({scene,renderer,environment,sun,ambient}){
    Object.assign(this,{scene,renderer,environment,sun,ambient});
    this.uniforms=environment.uniforms;this.override=null;this.fixedTime=null;this.state={};
    this.palette=Object.fromEntries(Object.entries(DAY_PALETTES).map(([key,value])=>[key,{...value,...Object.fromEntries(['sky','haze','light','ambient'].map(k=>[k,new THREE.Color(value[k])]))}]));
    this.colors=Object.fromEntries(['sky','haze','light','ambient'].map(k=>[k,new THREE.Color()]));
    this.cloudGrey=new THREE.Color('#829aa9');this.groundBounce=new THREE.Color('#c7a275');
    this.sunDirection=new THREE.Vector3();this.spherical=new THREE.Spherical(25,.63,.72);
    this.makeSky();this.makeSurface();this.makeRain();this.makeLampPools();this.makeAudio();
  }
  makeSky(){
    const uniforms={...this.uniforms,skyColor:{value:this.colors.sky},hazeColor:{value:this.colors.haze},sunDirection:{value:this.sunDirection},night:{value:0}};
    const material=new THREE.ShaderMaterial({uniforms,side:THREE.BackSide,depthWrite:false,fog:false,
      vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec3 vDirection;uniform vec3 skyColor,hazeColor,sunDirection;uniform float boomTime,boomClouds,night;${noiseGLSL}
        void main(){vec3 d=normalize(vDirection);float h=smoothstep(-.12,.65,d.y);vec3 c=mix(hazeColor,skyColor,h);
          vec2 uv=d.xz/max(.2,d.y+.25)*1.7+vec2(boomTime*.007,-boomTime*.003);
          float clouds=smoothstep(.58-boomClouds*.23,.79-boomClouds*.18,cloudField(uv));
          clouds*=smoothstep(-.04,.25,d.y)*(.35+boomClouds*.48);
          c=mix(c,mix(vec3(.93,.93,.87),vec3(.27,.34,.47),night),clouds);
          float halo=pow(max(0.,dot(d,sunDirection)),64.);c+=vec3(.4,.28,.12)*halo*(1.-night)*(1.-clouds);
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`});
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(110,24,12),material);this.sky.name='MotriSky';this.sky.renderOrder=-10;this.sky.frustumCulled=false;this.scene.add(this.sky);
  }
  makeSurface(){
    const material=this.environment.terrain.mesh.material;
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,this.uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 boomSurface;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nboomSurface=(modelMatrix*vec4(position,1.)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 boomSurface;uniform float boomTime,boomClouds,boomRain;${noiseGLSL}`)
        .replace('#include <map_fragment>',`#include <map_fragment>
          float cloudShade=smoothstep(.44,.7,cloudField(boomSurface.xz*.045+vec2(boomTime*.009,-boomTime*.004)));
          float wetPatch=cloudNoise(boomSurface.xz*.7);
          diffuseColor.rgb*=(1.-cloudShade*boomClouds*.20)*(1.-boomRain*.18);`)
        .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.3,boomRain*smoothstep(.28,.8,wetPatch));');
    };
    material.customProgramCacheKey=()=> 'boom-weather-ground-v1';material.needsUpdate=true;
  }
  makeHeightTexture(){
    const side=128,data=new Float32Array(side*side),terrain=this.environment.terrain;
    for(let z=0;z<side;z++)for(let x=0;x<side;x++){
      const wx=(x+.5)/side*100-50,wz=(z+.5)/side*100-50;let h=terrain.heightAt(wx,wz);
      for(const b of this.environment.arena.blockers){const box=b.bounds;if(wx>=box.min.x&&wx<=box.max.x&&wz>=box.min.z&&wz<=box.max.z)h=Math.max(h,box.max.y);}
      data[z*side+x]=h;
    }
    const texture=new THREE.DataTexture(data,side,side,THREE.RedFormat,THREE.FloatType);texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.needsUpdate=true;
    this.heightTexture=texture;return texture;
  }
  makeRain(){
    const random=seededRandom(171),mobile=this.environment.mobile,count=mobile?1000:1800;
    const p=[],uv=[],seeds=[],indices=[];
    for(let i=0;i<count;i++){
      const x=random(),z=random(),phase=random();
      for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]]){p.push(0,0,0);uv.push(u,v);seeds.push(x,z,phase);}
      const k=i*4;indices.push(k,k+1,k+2,k,k+2,k+3);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('rainSeed',new THREE.Float32BufferAttribute(seeds,3));geometry.setIndex(indices);
    const uniforms={...this.uniforms,groundHeight:{value:this.makeHeightTexture()},cameraRight:{value:new THREE.Vector2(1,0)},rainColor:{value:new THREE.Color('#d7e8ef')}};
    const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,
      vertexShader:`attribute vec3 rainSeed;varying float rainAlpha;uniform float boomTime,boomRain,boomWind;uniform vec3 boomFocus;uniform vec2 boomWindDirection,cameraRight;uniform sampler2D groundHeight;
        void main(){float span=46.;vec2 xz=mod(rainSeed.xy*span-boomFocus.xz+span*.5,span)-span*.5+boomFocus.xz;
          float progress=fract(boomTime*(.4+boomRain*.2)+rainSeed.z);
          float length=.55+boomRain*.9;float height=clamp(10.-progress*11.+uv.y*length,0.,10.);
          xz+=boomWindDirection*height*(.06+boomWind*.17);xz+=cameraRight*(uv.x-.5)*.009;
          float floorY=texture2D(groundHeight,clamp((xz+50.)/100.,0.,1.)).r;
          float y=max(floorY+.03,height);
          rainAlpha=step(fract(rainSeed.z*99.),boomRain*boomRain)*smoothstep(.03,.5,height-floorY)*(.18+uv.y*.42);
          rainAlpha*=1.-smoothstep(18.,23.,distance(xz,boomFocus.xz));
          rainAlpha*=smoothstep(1.2,4.,distance(cameraPosition,vec3(xz.x,y,xz.y)));
          gl_Position=projectionMatrix*viewMatrix*vec4(xz.x,y,xz.y,1.);
        }`,
      fragmentShader:`varying float rainAlpha;uniform vec3 rainColor;void main(){gl_FragColor=vec4(rainColor,rainAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
    this.rain=new THREE.Mesh(geometry,material);this.rain.name='MotriRain';this.rain.frustumCulled=false;this.rain.renderOrder=3;this.scene.add(this.rain);this.rainCount=count;
    const splashGeometry=geometry.clone();splashGeometry.setDrawRange(0,(mobile?96:180)*6);
    const splashes=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,
      vertexShader:`attribute vec3 rainSeed;varying vec2 vUv;varying float splashAlpha;uniform float boomTime,boomRain;uniform vec3 boomFocus;uniform sampler2D groundHeight;
        void main(){float span=32.;vec2 xz=mod(rainSeed.xy*span-boomFocus.xz+span*.5,span)-span*.5+boomFocus.xz;
          float progress=fract(boomTime*1.8+rainSeed.z);vUv=uv;
          splashAlpha=(1.-progress)*step(fract(rainSeed.z*99.),boomRain*boomRain);
          float y=texture2D(groundHeight,clamp((xz+50.)/100.,0.,1.)).r+.025;
          xz+=(uv-.5)*(.04+progress*.35);gl_Position=projectionMatrix*viewMatrix*vec4(xz.x,y,xz.y,1.);
        }`,
      fragmentShader:`varying vec2 vUv;varying float splashAlpha;void main(){float r=length(vUv-.5);float ring=smoothstep(.3,.39,r)*(1.-smoothstep(.42,.5,r));gl_FragColor=vec4(.65,.8,.87,ring*splashAlpha*.3);}`});
    this.splashes=new THREE.Mesh(splashGeometry,splashes);this.splashes.name='MotriRainSplashes';this.splashes.frustumCulled=false;this.scene.add(this.splashes);
  }
  makeLampPools(){
    const geometry=new THREE.PlaneGeometry(4,4);geometry.rotateX(-Math.PI/2);
    const material=new THREE.ShaderMaterial({uniforms:{night:{value:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 vUv;uniform float night;void main(){float a=pow(max(0.,1.-length(vUv-.5)*2.),2.);gl_FragColor=vec4(1.,.57,.2,a*night*.45);}'});
    this.lampPools=new THREE.InstancedMesh(geometry,material,this.environment.lamps.length);this.lampPools.name='MotriLampPools';
    this.environment.lamps.forEach(([x,y,z],i)=>this.lampPools.setMatrixAt(i,new THREE.Matrix4().makeTranslation(x,y+.04,z)));this.scene.add(this.lampPools);
  }
  makeAudio(){
    this.audio=null;this.audioUnlocked=false;this.audioPending=false;
    const unlock=()=>{
      if(this.audioUnlocked||this.audioPending)return;
      if(!this.audio){this.audio=new Audio(new URL('assets/audio/motri-rain.mp3',document.baseURI).href);this.audio.loop=true;this.audio.volume=0;this.audio.preload='none';}
      this.audioPending=true;this.audio.play().then(()=>{this.audioUnlocked=true;this.audioPending=false;this.audio.pause();window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);}).catch(()=>{this.audioPending=false;});
    };
    window.addEventListener('pointerdown',unlock,{passive:true});window.addEventListener('keydown',unlock);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.audio?.pause();});
  }
  setOverride(value=null,seconds=null){this.override=value;this.fixedTime=seconds;}
  update(camera,player,seconds=Date.now()/1000){
    seconds=this.fixedTime??seconds;
    const state=Object.assign(this.state,weatherAt(seconds),this.override||{}),phase=state.dayPhase;
    let index=0;while(index<DAY_KEYS.length-2&&phase>DAY_KEYS[index+1][0])index++;
    const [start,ka]=DAY_KEYS[index],[end,kb]=DAY_KEYS[index+1],t=smooth(start,end,phase),a=this.palette[ka],b=this.palette[kb];
    for(const k of ['sky','haze','light','ambient'])this.colors[k].copy(a[k]).lerp(b[k],t);
    this.colors.sky.lerp(this.cloudGrey,state.clouds*.45);this.colors.haze.lerp(this.cloudGrey,state.rain*.3);
    const night=THREE.MathUtils.lerp(a.night,b.night,t);state.night=night;
    this.sun.color.copy(this.colors.light);this.sun.intensity=THREE.MathUtils.lerp(a.sun,b.sun,t)*(1-state.clouds*.38);
    this.ambient.color.copy(this.colors.ambient);this.ambient.groundColor.copy(this.groundBounce).lerp(this.colors.ambient,night*.55);this.ambient.intensity=THREE.MathUtils.lerp(a.fill,b.fill,t);
    // Motri Lighting.js's moving spherical sun, with Boom's shadow distance.
    this.spherical.theta=.72+Math.sin(-(phase+9/16)*Math.PI*2)*1.25;
    this.spherical.phi=.63+Math.cos(-(phase+9/16)*Math.PI*2)*.31;
    this.sunDirection.setFromSpherical(this.spherical).normalize();
    this.sun.target.position.copy(player);this.sun.position.copy(this.sunDirection).multiplyScalar(25).add(player);this.sun.target.updateMatrixWorld();
    this.scene.fog.color.copy(this.colors.haze);this.scene.fog.near=42-state.rain*13;this.scene.fog.far=112-state.rain*22;
    this.sky.position.copy(camera.position);this.sky.material.uniforms.night.value=night;
    const u=this.uniforms;u.boomTime.value=seconds%86400;u.boomWind.value=state.wind;u.boomRain.value=state.rain;u.boomClouds.value=state.clouds;u.boomPlayer.value.copy(player);u.boomFocus.value.copy(player);
    this.rain.material.uniforms.cameraRight.value.set(camera.matrixWorld.elements[0],camera.matrixWorld.elements[2]).normalize();
    this.rain.visible=this.splashes.visible=state.rain>.015;
    this.lampPools.material.uniforms.night.value=night;this.lampPools.visible=night>.02;
    this.environment.lampMaterial.color.setRGB(1.1+night*1.1,.66+night*.5,.26);
    if(this.audioUnlocked){
      this.audio.volume=state.rain*.16;
      if(state.rain<.02||document.hidden)this.audio.pause();
      else if(this.audio.paused&&!this.audioPending){this.audioPending=true;this.audio.play().catch(()=>{}).finally(()=>{this.audioPending=false;});}
    }
  }
  snapshot(){return {...this.state,rainCapacity:this.rainCount,rainVisible:this.rain.visible,grassBlades:this.environment.grass.count,grassTiles:this.environment.grass.meshes.length,foliageCardsPerCrown:this.environment.foliage.cardsPerCrown};}
}
