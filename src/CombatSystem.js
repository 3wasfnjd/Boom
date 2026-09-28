import * as THREE from 'three';
import {traceShot} from './ShotCollision.js';
import {BattleMusic} from './BattleMusic.js';

import {WEAPONS} from '../shared/BattleRules.js';
export {WEAPONS};
const forward=new THREE.Vector3(0,0,1);
const temp=new THREE.Vector3(),origin=new THREE.Vector3(),direction=new THREE.Vector3(),quaternion=new THREE.Quaternion();
const aimPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-.75);
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));

// All shots and flashes are bounded pools. Switching cars reuses these pools.
export class CombatSystem {
  constructor(scene,arena,onHit) {
    this.scene=scene;this.arena=arena;this.onHit=onHit;this.cooldown=0;this.serial=0;this.shotsFired=0;this.shots=[];this.effects=[];this.recoil=0;this.burstRemaining=0;this.burstTimer=0;
    this.aimPoint=new THREE.Vector3();this.lockedTarget=null;this.raycaster=new THREE.Raycaster();
    const geometries={
      machinegun:new THREE.BoxGeometry(.035,.035,.65),
      cannon:new THREE.SphereGeometry(.10,8,6),
      rockets:new THREE.CylinderGeometry(.025,.075,.38,8).rotateX(Math.PI/2)
    };
    for(const kind of Object.keys(geometries)) {
      const material=new THREE.MeshBasicMaterial({color:kind==='machinegun'?'#ffeab1':kind==='cannon'?'#ffc05d':'#ffdc86'});
      // Two six-rocket volleys for each of the six players, still a fixed pool.
      for(let i=0;i<(kind==='rockets'?72:24);i++) {
        const mesh=new THREE.Mesh(geometries[kind],material);mesh.visible=false;scene.add(mesh);
        this.shots.push({kind,mesh,active:false,velocity:new THREE.Vector3(),previous:new THREE.Vector3(),next:new THREE.Vector3(),life:0,trail:0,spec:null});
      }
    }
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,1,32,32,32);
    gradient.addColorStop(0,'#fff');gradient.addColorStop(.18,'#fff');gradient.addColorStop(.5,'#fff9');gradient.addColorStop(1,'#fff0');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    const map=new THREE.CanvasTexture(canvas);
    for(let i=0;i<72;i++) {
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
      sprite.visible=false;scene.add(sprite);this.effects.push({sprite,velocity:new THREE.Vector3(),life:0,total:1,size:1});
    }
    this.audio=null;
    const unlock=()=>{
      try {
        if(!this.audio) {
          const Audio=window.AudioContext||window.webkitAudioContext;
          if(Audio){this.audio=new Audio();this.music=new BattleMusic(this.audio);this.noise=this.audio.createBuffer(1,Math.ceil(this.audio.sampleRate*.16),this.audio.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);}
        }
        if(this.audio?.state==='suspended')this.audio.resume().then(()=>this.music.start()).catch(()=>{});
        else if(this.audio?.state==='running')this.music.start();
      }catch{/* Audio is optional; driving and shooting remain available. */}
    };
    window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);
    window.addEventListener('blur',()=>{this.burstRemaining=0;});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.burstRemaining=0;this.music?.stop();if(this.audio?.state==='running')this.audio.suspend().catch(()=>{});}else if(this.audio)this.audio.resume().then(()=>this.music.start()).catch(()=>{});});
  }
  bind(vehicle,id) {
    this.vehicle=vehicle;this.spec=WEAPONS[id];
    this.mount=vehicle.container.getObjectByName('mount-primary');this.yaw=vehicle.container.getObjectByName('weapon-yaw');this.pitch=vehicle.container.getObjectByName('weapon-pitch');
    this.muzzles=[];this.pitch.traverse(node=>{if(node.name.startsWith('muzzle-'))this.muzzles.push(node);});
    if(!this.muzzles.length)throw Error('Weapon muzzle missing');
    this.pitchRestZ=this.pitch.position.z;this.recoil=0;this.cooldown=0;this.serial=0;this.burstRemaining=0;
  }
  aim(dt,input,camera) {
    const container=this.vehicle.container;
    container.updateMatrixWorld(true);this.mount.getWorldPosition(origin);this.lockedTarget=null;
    direction.copy(forward).applyQuaternion(container.quaternion).setY(0).normalize();
    this.aimPoint.copy(origin).addScaledVector(direction,32);this.aimPoint.y=this.arena.environment.terrain.heightAt(this.aimPoint.x,this.aimPoint.z)+.75;
    if(input.mode==='mouse') {
      this.raycaster.setFromCamera(input.mouse,camera);
      const groundHit=this.arena.environment.terrain.raycast(this.raycaster.ray);
      aimPlane.constant=-(groundHit?groundHit.y+.75:.75);
      this.raycaster.ray.intersectPlane(aimPlane,this.aimPoint);
      let nearest=groundHit?this.raycaster.ray.origin.distanceToSquared(groundHit):Infinity;
      for(const target of (this.network?.enabled?[...this.arena.targets,...this.network.targets()]:this.arena.targets)){
        if(!target.active||!this.raycaster.ray.intersectBox(target.bounds,temp))continue;
        const distance=this.raycaster.ray.origin.distanceToSquared(temp);
        if(distance<nearest){nearest=distance;this.aimPoint.copy(temp);}
      }
      // Limit range on the horizon, where a ground ray becomes almost parallel.
      temp.subVectors(this.aimPoint,origin);if(temp.length()>65)this.aimPoint.copy(origin).addScaledVector(temp.normalize(),65);
    }else if(input.mode==='stick') {
      this.aimPoint.copy(origin).add(new THREE.Vector3(input.aim.x*32,0,input.aim.y*32));this.aimPoint.y=this.arena.environment.terrain.heightAt(this.aimPoint.x,this.aimPoint.z)+.75;
    }else {
      let nearest=28;
      for(const target of (this.network?.enabled?[...this.arena.targets,...this.network.targets()]:this.arena.targets)) {
        if(!target.active)continue;
        temp.subVectors(target.position,origin);const distance=temp.length();
        if(distance>nearest||temp.clone().normalize().dot(direction)<.40)continue;
        if(traceShot(origin,target.position,this.arena.blockers,0,this.arena.environment.terrain))continue;
        nearest=distance;this.lockedTarget=target;this.aimPoint.copy(target.position);
      }
    }
    temp.copy(this.aimPoint);this.mount.worldToLocal(temp);temp.sub(this.yaw.position);temp.y-=this.pitch.position.y;
    const targetYaw=Math.atan2(temp.x,temp.z),targetPitch=THREE.MathUtils.clamp(-Math.atan2(temp.y,Math.hypot(temp.x,temp.z)),-.65,.65);
    const smoothing=1-Math.exp(-15*dt);
    this.yaw.rotation.y+=wrap(targetYaw-this.yaw.rotation.y)*smoothing;
    this.pitch.rotation.x=THREE.MathUtils.lerp(this.pitch.rotation.x,targetPitch,smoothing);
    this.recoil*=Math.exp(-16*dt);this.pitch.position.z=this.pitchRestZ-this.recoil;
    container.updateMatrixWorld(true);
  }
  sound(heavy=false) {
    if(this.audio?.state!=='running')return;
    const source=this.audio.createBufferSource(),filter=this.audio.createBiquadFilter(),gain=this.audio.createGain();
    source.buffer=this.noise;filter.type='lowpass';filter.frequency.value=heavy?850:2700;
    const now=this.audio.currentTime,duration=heavy?.16:.075;
    gain.gain.setValueAtTime(heavy?.16:.055,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.audio.destination);source.start(now);source.stop(now+duration);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  effect(position,color,size,life,velocity) {
    const fx=this.effects.find(item=>item.life<=0);if(!fx)return;
    fx.sprite.position.copy(position);fx.sprite.material.color.set(color);fx.sprite.material.opacity=1;fx.sprite.scale.setScalar(size);fx.sprite.visible=true;
    fx.size=size;fx.life=fx.total=life;fx.velocity.copy(velocity||new THREE.Vector3());
  }
  burst(position,large=false) {
    this.effect(position,'#ffd386',large?2.0:.38,large?.38:.15);
    const count=large?10:3;
    for(let i=0;i<count;i++){
      const angle=(i/count)*Math.PI*2;
      temp.set(Math.cos(angle)*(large?3:1.5),.7+(i%3)*.6,Math.sin(angle)*(large?3:1.5));
      this.effect(position,i%2?'#ffb653':'#fff0b5',large?.20:.10,.22+(i%4)*.09,temp);
    }
  }
  shoot() {
    if(this.network&&!this.network.canAct)return;
    const shot=this.shots.find(item=>!item.active&&item.kind===this.spec.kind);if(!shot)return;
    const muzzle=this.muzzles[this.serial++%this.muzzles.length];muzzle.getWorldPosition(origin);muzzle.getWorldQuaternion(quaternion);
    direction.copy(forward).applyQuaternion(quaternion).normalize();
    shot.mesh.position.copy(origin);shot.mesh.quaternion.setFromUnitVectors(forward,direction);shot.velocity.copy(direction).multiplyScalar(this.spec.speed);
    shot.netId=this.network?.fire(origin,direction)||null;
    shot.life=this.spec.life;shot.trail=0;shot.spec=this.spec;shot.active=shot.mesh.visible=true;this.shotsFired++;
    this.recoil=this.spec.kind==='machinegun'?.04:.14;
    this.effect(origin,'#ffe3a0',this.spec.kind==='machinegun'?.22:.48,.07);
    this.sound(this.spec.kind!=='machinegun');
  }
  remoteShot(data) {
    const spec=WEAPONS[data.body],shot=this.shots.find(s=>!s.active&&s.kind===spec.kind);if(!shot)return;
    shot.mesh.position.fromArray(data.p);shot.velocity.fromArray(data.v);shot.mesh.quaternion.setFromUnitVectors(forward,shot.velocity.clone().normalize());shot.spec=spec;shot.life=spec.life;shot.trail=0;shot.netId=data.id;shot.active=shot.mesh.visible=true;
    this.effect(shot.mesh.position,'#ffe3a0',spec.splash?.48:.22,.07);
  }
  stopShot(id){for(const s of this.shots)if(s.netId===id)s.active=s.mesh.visible=false;}
  applyDamage(target,amount,position) {
    const destroyed=this.arena.damage(target,amount);this.onHit(target,destroyed,position);if(destroyed)this.burst(target.position,true);
  }
  impact(shot,hit) {
    const point=shot.mesh.position,spec=shot.spec;
    if(this.network?.enabled){shot.active=shot.mesh.visible=false;return;}
    if(hit.kind==='target')this.applyDamage(hit,spec.damage,point);
    if(spec.splash>0) {
      for(const target of (this.network?.enabled?[...this.arena.targets,...this.network.targets()]:this.arena.targets)){
        if(!target.active||target===hit)continue;
        const distance=point.distanceTo(target.position);if(distance>spec.splash)continue;
        // Cover also shields the area damage from shells and rockets.
        if(traceShot(point,target.position,this.arena.blockers,0,this.arena.environment.terrain))continue;
        this.applyDamage(target,spec.damage*(1-distance/spec.splash)*.7,point);
      }
    }
    this.burst(point,spec.splash>0);shot.active=shot.mesh.visible=false;
  }
  update(dt,input,camera) {
    this.aim(dt,input,camera);this.cooldown=Math.max(0,this.cooldown-dt);
    const blocked=(this.network&&!this.network.canAct)||document.getElementById('room-dialog')?.open;
    if(blocked)this.burstRemaining=0;
    if(!blocked&&input.fire&&this.cooldown<=0&&!this.burstRemaining){this.burstRemaining=this.spec.burst||1;this.burstTimer=0;this.cooldown=this.spec.interval;}
    if(this.burstRemaining){this.burstTimer-=dt;if(this.burstTimer<=0){this.shoot();this.burstRemaining--;this.burstTimer=this.spec.burstInterval||0;}}
    const items=[...this.arena.blockers,...this.arena.targets,...(this.network?.targets()||[])];
    for(const shot of this.shots) {
      if(!shot.active)continue;
      shot.previous.copy(shot.mesh.position);shot.next.copy(shot.previous).addScaledVector(shot.velocity,dt);
      const hit=traceShot(shot.previous,shot.next,items,shot.spec.radius,this.arena.environment.terrain);
      if(hit){shot.mesh.position.lerpVectors(shot.previous,shot.next,hit.fraction);this.impact(shot,hit.item);continue;}
      shot.mesh.position.copy(shot.next);shot.life-=dt;shot.trail-=dt;
      if(shot.kind==='rockets'&&shot.trail<=0){this.effect(shot.mesh.position,'#d6ae69',.30,.25);shot.trail=.05;}
      if(shot.life<=0)shot.active=shot.mesh.visible=false;
    }
    for(const fx of this.effects) {
      if(fx.life<=0)continue;fx.life-=dt;fx.sprite.visible=fx.life>0;
      fx.sprite.position.addScaledVector(fx.velocity,dt);const remaining=Math.max(0,fx.life/fx.total);
      fx.sprite.material.opacity=remaining;fx.sprite.scale.setScalar(fx.size*(1+(1-remaining)*.9));
    }
  }
  clear() {
    for(const shot of this.shots)shot.active=shot.mesh.visible=false;
    for(const fx of this.effects){fx.life=0;fx.sprite.visible=false;}
    this.cooldown=0;this.recoil=0;this.shotsFired=0;this.burstRemaining=0;
  }
}
