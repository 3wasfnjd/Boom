import * as THREE from 'three';
import {RAPIER,PHYSICS_SCALE} from './PhysicsWorld.js';
import {BattleRoom} from '../server/BattleRoom.js';
import {randomId,PROTOCOL,cleanRoom,cleanName,CRATE_COOLDOWN_MS} from '../shared/BattleRules.js';
import {MotriFireballs} from './MotriFireballs.js';
const uuid=randomId;
export class BattleClient {
 constructor({scene,world,arena,vehicle,combat,input,camera,loadCar,selectCar}){
  Object.assign(this,{scene,world,arena,vehicle,combat,input,camera,loadCar,selectCar});this.remotes=new Map();this.crateMeshes=new Map();this.sequence=0;this.shotSequence=0;this.ready=false;this.online=false;this.time=0;this.sendTime=0;this.lastSnapshot=0;this.serverOffset=0;this.id=null;this.self=null;this.endpoint='';this.closed=false;this.session=0;this.events=new Set();this.fireballs=new MotriFireballs(scene);this.car='h9';
  this.room=cleanRoom(new URLSearchParams(location.search).get('room'));try{this.name=localStorage.getItem('boom:name')||'لاعب '+Math.floor(100+Math.random()*900);}catch{this.name='لاعب';}
  this.status=document.getElementById('network-status');this.health=document.getElementById('player-health-fill');this.healthText=document.getElementById('player-health-text');this.killCount=document.getElementById('player-kills');this.crateButton=document.getElementById('drop-crate');this.notice=document.getElementById('battle-notice');
  this.crateButton.addEventListener('pointerdown',e=>{e.preventDefault();this.drop();});window.addEventListener('keydown',e=>{if(e.code==='KeyE'&&!e.repeat&&!e.target.matches('input'))this.drop();});
  this.setupRoomUI();window.addEventListener('pagehide',()=>this.socket?.close(1000,'left'));document.addEventListener('visibilitychange',()=>{if(!document.hidden&&this.online&&!this.ready)this.connect();});
 }
 get enabled(){return this.ready;}
 get canAct(){return this.ready&&this.self?.hp>0;}
 serverNow(){return this.local?this.time*1000:Date.now()+this.serverOffset;}
 setupRoomUI(){const dialog=document.getElementById('room-dialog'),name=document.getElementById('player-name'),room=document.getElementById('room-name');name.value=this.name;room.value=this.room;document.getElementById('room-button').onclick=()=>{this.input.release();dialog.showModal();};document.getElementById('close-room').onclick=()=>dialog.close();
  document.getElementById('join-room').onclick=()=>{room.setCustomValidity('');if(room.value.trim()&&!/^[A-Za-z0-9_-]{1,24}$/.test(room.value.trim())){room.setCustomValidity('استخدم حروفًا إنجليزية أو أرقامًا لرمز الغرفة');room.reportValidity();return;}this.name=cleanName(name.value);this.room=cleanRoom(room.value);try{localStorage.setItem('boom:name',this.name);}catch{}const url=new URL(location.href);url.searchParams.set('room',this.room);history.replaceState(null,'',url);dialog.close();if(this.endpoint)this.connect();else{this.notice.textContent='الخادم الجماعي لم يُفعّل بعد · التدريب متاح';this.beginSolo();}};
  document.getElementById('invite-room').onclick=async()=>{const url=new URL(location.href);url.searchParams.set('room',this.room);url.searchParams.delete('debug');try{await navigator.clipboard.writeText(url.href);document.getElementById('invite-room').textContent='تم نسخ الرابط';}catch{document.getElementById('invite-link').value=url.href;document.getElementById('invite-link').hidden=false;}};
 }
 async start(){try{const config=await fetch(new URL('multiplayer.json',document.baseURI),{cache:'no-store'}).then(r=>r.json());this.endpoint=config.serverUrl||'';}catch{}
  if(location.hostname.endsWith('.workers.dev'))this.endpoint=location.origin;
  const params=new URLSearchParams(location.search);if(params.has('debug')&&['localhost','127.0.0.1','boom.test'].includes(location.hostname)&&params.get('server'))this.endpoint=params.get('server');
  if(params.get('offline')==='1')this.endpoint='';if(this.endpoint)this.connect();else this.beginSolo();
 }
 clearPeers(){for(const id of [...this.remotes.keys()])this.removeRemote(id);for(const m of this.crateMeshes.values()){m.removeFromParent();m.material.dispose();}this.crateMeshes.clear();}
 beginSolo(){this.session++;this.socket?.close();this.socket=null;this.online=false;this.clearPeers();this.local=new BattleRoom({now:()=>this.time*1000,broadcast:m=>this.receive(m)});this.local.lastTick=this.time*1000;const welcome=this.local.join({name:this.name,body:this.car});const p=this.local.players.get(welcome.id);p.p=this.vehicle.container.position.toArray();p.q=this.vehicle.container.quaternion.toArray();p.shieldUntil=0;welcome.self=this.local.view(p);welcome.players=[welcome.self];this.receive(welcome);this.status.textContent='تدريب فردي';}
 connect(){const session=++this.session;this.socket?.close();this.local=null;this.online=true;this.ready=false;this.clearPeers();this.status.textContent='جارٍ الاتصال…';this.notice.textContent='';this.input.release();const base=new URL(this.endpoint);base.protocol=base.protocol==='http:'?'ws:':'wss:';base.pathname='/room/'+this.room;base.search='';let token;try{token=sessionStorage.getItem('boom:token:'+this.room);}catch{}
  const socket=this.socket=new WebSocket(base);socket.onopen=()=>{if(session!==this.session)return;socket.send(JSON.stringify({type:'hello',protocol:PROTOCOL,name:this.name,body:this.car,token}));};
  socket.onmessage=e=>{if(session!==this.session)return;try{this.receive(JSON.parse(e.data));}catch(error){console.error('Battle message failed',error);}};
  socket.onclose=e=>{if(session!==this.session)return;this.ready=false;this.clearPeers();this.status.textContent=e.code===4001?'الغرفة ممتلئة':e.code===4002?'فُتحت الجلسة في تبويب آخر':'انقطع الاتصال · إعادة المحاولة';this.notice.textContent='توقف القتال حتى عودة الاتصال';if(![4001,4002].includes(e.code))setTimeout(()=>{if(session===this.session)this.connect();},2000);};
 }
 send(message){if(this.local){this.local.message(this.id,message);return;}if(this.socket?.readyState===WebSocket.OPEN&&this.socket.bufferedAmount<65536)this.socket.send(JSON.stringify(message));}
 state(){return {type:'state',seq:++this.sequence,p:this.vehicle.container.position.toArray(),q:this.vehicle.container.quaternion.toArray(),v:[this.vehicle.body.linvel().x/PHYSICS_SCALE,this.vehicle.body.linvel().y/PHYSICS_SCALE,this.vehicle.body.linvel().z/PHYSICS_SCALE],body:this.car,wy:this.vehicle.physical.wheels.items.map(w=>-(w.suspensionLength||.79)),steer:this.vehicle.wheelSteering||0,spin:this.vehicle.wheelSpin||0,yaw:this.combat.yaw?.rotation.y||0,pitch:this.combat.pitch?.rotation.x||0};}
 fire(origin,direction){if(!this.canAct)return null;const seq=++this.shotSequence;this.send(this.state());this.send({type:'fire',origin:origin.toArray(),direction:direction.toArray(),seq});return `${this.id}:${seq}`;}
 drop(){if(!this.canAct||this.serverNow()<(this.self.crateAt||0))return;this.send(this.state());this.send({type:'crate'});}
 recover(){if(this.online){this.send({type:'recover'});return true;}return false;}
 resetSolo(){if(this.local){this.fireballs.clear();this.beginSolo();}}
 targets(){return [...this.remotes.values()].filter(r=>r.hp>0&&r.group.visible).map(r=>r.target);}
 receive(m){if(m.type==='full'){this.status.textContent='الغرفة ممتلئة · اختر غرفة أخرى';return;}
  if(m.eid){if(this.events.has(m.eid))return;this.events.add(m.eid);if(this.events.size>256)this.events.delete(this.events.values().next().value);}
  if(m.ts!=null&&!this.local)this.serverOffset=m.ts-Date.now();
  if(m.type==='welcome'){if(m.protocol!==PROTOCOL){this.status.textContent='حدّث الصفحة لتوافق الخادم';return;}this.events.clear();this.id=m.id;this.ready=true;this.self=m.self;this.arena.networked=true;this.placeLocal(m.self);try{if(this.online)sessionStorage.setItem('boom:token:'+this.room,m.token);}catch{}this.applySnapshot(m);this.notice.textContent='';return;}
  if(m.type==='snapshot'){this.applySnapshot(m);return;}
  if(m.type==='left'){this.removeRemote(m.id);return;}
  if(m.type==='shot'){if(m.shot.owner!==this.id)this.combat.remoteShot(m.shot);return;}
  if(m.type==='impact'){this.combat.stopShot(m.id);if(!m.large)this.combat.burst(new THREE.Vector3(...m.position));return;}
  if(m.type==='explosion'){const p=new THREE.Vector3(...m.position);this.fireballs.create(p,m.radius,this.arena.environment.terrain.heightAt(p.x,p.z),this.vehicle.container.position);return;}
  if(m.type==='damage'){
   if(m.owner===this.id)this.combat.onHit({id:m.id},m.hp===0,new THREE.Vector3(...m.position));
   if(m.id===this.id){this.self.hp=m.hp;this.self.respawnAt=m.respawnAt;this.vehicle.physical.rest.wake();if(m.hp>0){const mass=this.vehicle.body.mass();this.vehicle.body.applyImpulse({x:m.kick[0]*mass*2,y:m.kick[1]*mass*2,z:m.kick[2]*mass*2},true);}else this.setDead(true);document.getElementById('damage-flash').classList.remove('hit');void document.getElementById('damage-flash').offsetWidth;document.getElementById('damage-flash').classList.add('hit');}return;
  }
  if(m.type==='destroyed'){this.fireballs.create(new THREE.Vector3(...m.position),3,this.arena.environment.terrain.heightAt(m.position[0],m.position[2]),this.vehicle.container.position);return;}
  if(m.type==='respawn'||m.type==='recover'){if(m.id===this.id){this.self=m.player;this.placeLocal(m.player);}else{const r=this.remotes.get(m.id);if(r)r.frames=[];}return;}
  if(m.type==='correct'&&m.id===this.id){this.vehicle.body.setTranslation({x:m.p[0]*2,y:m.p[1]*2,z:m.p[2]*2},true);this.vehicle.body.setLinvel({x:0,y:0,z:0},true);return;}
  if(m.type==='target'){this.setTarget(m);if(m.owner===this.id)this.combat.onHit({id:m.id},m.hp===0,new THREE.Vector3(...m.position));}
 }
 setDead(dead){if(this.dead===dead)return;this.dead=dead;this.vehicle.container.visible=!dead;this.vehicle.body.setEnabled(!dead);if(dead)this.input.release();}
 placeLocal(p){this.setDead(false);const q=new THREE.Quaternion(...p.q),f=new THREE.Vector3(0,0,1).applyQuaternion(q);this.vehicle.reset(...p.p,Math.atan2(f.x,f.z));if(p.hp<=0)this.setDead(true);this.input.release();}
 setTarget(t){const target=this.arena.targets.find(x=>x.id===t.id);if(!target)return;if(t.hp>0&&!target.active)this.arena.restore(target);if(t.hp<=0&&target.active)this.arena.damage(target,100);if(target.health>t.hp)target.flash=.13;target.health=t.hp;target.bar.scale.x=t.hp/100;}
 applySnapshot(m){if(!this.ready)return;this.lastSnapshot=performance.now();const ids=new Set();for(const p of m.players||[]){if(p.id===this.id){this.self=p;this.setDead(p.hp<=0);continue;}ids.add(p.id);let r=this.remotes.get(p.id);if(!r){r=this.addRemote(p);}r.hp=p.hp;r.data=p;r.frames.push({ts:m.ts,p:new THREE.Vector3(...p.p),q:new THREE.Quaternion(...p.q),v:new THREE.Vector3(...p.v)});if(r.frames.length>20)r.frames.shift();if(r.car!==p.body)this.installRemote(r,p.body);}
  for(const id of this.remotes.keys())if(!ids.has(id))this.removeRemote(id);for(const t of m.targets||[])this.setTarget(t);this.updateCrates(m.crates||[]);
  if(this.online)this.status.textContent=`${this.room==='public'?'الساحة العامة':this.room} · ${(m.players||[]).length}/٦`;
 }
 addRemote(p){const group=new THREE.Group();this.scene.add(group);const tag=document.createElement('div');tag.className='player-tag';const name=document.createElement('span');name.textContent=p.name;const track=document.createElement('i'),fill=document.createElement('b');track.append(fill);tag.append(name,track);document.body.append(tag);
  const body=this.world.native.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...p.p.map(v=>v*2)));this.world.native.createCollider(RAPIER.ColliderDesc.cuboid(.48*2,.35*2,.8*2).setFriction(.35).setCollisionGroups((2<<16)|5),body);
  const r={id:p.id,group,tag,fill,name,frames:[],body,car:null,data:p,hp:p.hp,target:{kind:'player',id:p.id,active:true,position:group.position,bounds:new THREE.Box3()}};group.position.fromArray(p.p);group.quaternion.fromArray(p.q);this.remotes.set(p.id,r);this.installRemote(r,p.body);return r;
 }
 async installRemote(r,id){r.car=id;const token=uuid();r.loadToken=token;try{const gltf=await this.loadCar(id);if(r.loadToken!==token||!this.remotes.has(r.id))return;r.group.clear();const model=gltf.scene.clone(true);model.scale.multiplyScalar(.5);model.getObjectByName('body').position.y=0;model.traverse(n=>{if(n.isMesh){n.castShadow=false;n.receiveShadow=true;}});r.group.add(model);r.model=model;r.wheels=['wheel-front-left','wheel-front-right','wheel-back-left','wheel-back-right'].map(n=>model.getObjectByName(n));r.yaw=model.getObjectByName('weapon-yaw');r.pitch=model.getObjectByName('weapon-pitch');}catch(error){console.error('Remote car failed to load',error);}}
 removeRemote(id){const r=this.remotes.get(id);if(!r)return;r.loadToken=null;r.group.removeFromParent();r.tag.remove();this.world.removeBody(r.body);this.remotes.delete(id);}
 updateCrates(crates){const ids=new Set();for(const c of crates){ids.add(c.id);let mesh=this.crateMeshes.get(c.id);if(!mesh){mesh=this.arena.targets[0].crate.clone();mesh.material=mesh.material.clone();mesh.scale.multiplyScalar(.5);mesh.castShadow=true;this.scene.add(mesh);this.crateMeshes.set(c.id,mesh);}mesh.userData.state=c;mesh.position.fromArray(c.p);mesh.material.emissive.setHex(c.fuseAt?0x771500:0);}
  for(const [id,mesh] of this.crateMeshes)if(!ids.has(id)){mesh.removeFromParent();mesh.material.dispose();this.crateMeshes.delete(id);}
 }
 update(dt){this.time+=dt;this.fireballs.update(dt);if(!this.ready)return;
  this.sendTime+=dt;if(this.sendTime>=.05){this.sendTime%=.05;this.send(this.state());}
  if(this.local)this.local.tick();
  const renderTime=this.serverNow()-80,projected=new THREE.Vector3();
  for(const r of this.remotes.values()){
   const frames=r.frames;while(frames.length>=3&&frames[1].ts<=renderTime)frames.shift();const a=frames[0],b=frames[1];if(!a)continue;
   if(b&&a.ts<=renderTime&&renderTime<=b.ts){const t=Math.max(0,Math.min(1,(renderTime-a.ts)/Math.max(1,b.ts-a.ts)));r.group.position.lerpVectors(a.p,b.p,t);r.group.quaternion.copy(a.q).slerp(b.q,t);}else{const last=frames.at(-1),extra=Math.max(0,Math.min(.12,(renderTime-last.ts)/1000));r.group.position.copy(last.p).addScaledVector(last.v,extra);r.group.quaternion.copy(last.q);}
   r.group.visible=r.hp>0;r.body.setEnabled(r.hp>0);r.body.setNextKinematicTranslation({x:r.group.position.x*2,y:r.group.position.y*2,z:r.group.position.z*2});r.body.setNextKinematicRotation(r.group.quaternion);
   r.target.active=r.hp>0;r.target.bounds.setFromCenterAndSize(r.group.position,new THREE.Vector3(1.5,.9,1.8));
   if(r.wheels)for(let i=0;i<4;i++){r.wheels[i].position.y=r.data.wy[i];r.wheels[i].rotation.set(r.data.spin,i<2?r.data.steer:0,0,'YXZ');}
   if(r.yaw)r.yaw.rotation.y=r.data.yaw;if(r.pitch)r.pitch.rotation.x=r.data.pitch;
   projected.copy(r.group.position);projected.y+=1.5;projected.project(this.camera);r.tag.hidden=r.hp<=0||projected.z< -1||projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1;r.tag.style.left=`${(projected.x*.5+.5)*innerWidth}px`;r.tag.style.top=`${(-projected.y*.5+.5)*innerHeight}px`;r.fill.style.transform=`scaleX(${r.hp/100})`;r.fill.classList.toggle('low',r.hp<35);r.name.textContent=r.data.name;
  }
  if(this.self){this.killCount.textContent=`القتل ${(this.self.kills||0).toLocaleString('ar',{numberingSystem:'arab'})}`;const hp=this.self.hp;this.health.style.transform=`scaleX(${hp/100})`;this.health.classList.toggle('low',hp<35);this.healthText.textContent=`${Math.ceil(hp)} / 100`;const wait=Math.max(0,(this.self.crateAt-this.serverNow())/1000);this.crateButton.disabled=!this.canAct||wait>0;this.crateButton.textContent=wait>0?`صندوق ${Math.ceil(wait)}`:'صندوق ↧';this.crateButton.style.setProperty('--ready',String(1-wait/(CRATE_COOLDOWN_MS/1000)));if(hp<=0)this.notice.textContent=`تحطمت السيارة · عودة خلال ${Math.max(1,Math.ceil((this.self.respawnAt-this.serverNow())/1000))}`;else if(this.ready)this.notice.textContent='';}
 }
}
