import {CollisionWorld} from './CollisionWorld.js';
import {HOMING} from '../shared/BattleRules.js';
import {randomId,PROTOCOL,MAX_PLAYERS,MAX_HEALTH,RESPAWN_MS,SHIELD_MS,CRATE_COOLDOWN_MS,WEAPONS,SPAWNS,cleanName,carId,validArray,dist,box,forward,blastKick} from '../shared/BattleRules.js';

// Motri's room/pose protocol is retained; health, shots and crates belong to
// this room authority. Clients can submit inputs/poses, never damage or HP.
export class BattleRoom {
 constructor({now=()=>Date.now(),broadcast=()=>{},world=new CollisionWorld(),saved=null}={}){
  this.now=now;this.broadcast=broadcast;this.world=world;this.players=new Map();this.shots=[];this.crates=[];this.sequence=0;this.lastTick=now();this.snapshotAt=0;this.dirty=false;
  this.targets=world.data.targets.map(t=>({...t,p:[...t.p],hp:100,respawn:0}));this.missiles=[];
  if(saved){this.sequence=saved.sequence||0;for(const p of saved.players||[])this.players.set(p.id,{...p,connected:false,leftAt:now(),lastState:now(),lastMessage:now(),tokens:100});this.targets=saved.targets||this.targets;this.crates=saved.crates||[];}
 }
 event(type,data={}){this.broadcast({type,eid:++this.sequence,ts:this.now(),...data});}
 view(p){return {id:p.id,name:p.name,body:p.body,p:p.p,q:p.q,v:p.v,wy:p.wy,steer:p.steer,spin:p.spin,yaw:p.yaw,pitch:p.pitch,hp:p.hp,alive:p.hp>0,shieldUntil:p.shieldUntil,respawnAt:p.respawnAt,crateAt:p.crateAt,homingAt:p.homingAt||0,kills:p.kills,deaths:p.deaths,connected:p.connected,seq:p.seq};}
 snapshot(){return {type:'snapshot',protocol:PROTOCOL,ts:this.now(),players:[...this.players.values()].filter(p=>p.connected).map(p=>this.view(p)),missiles:this.missiles.map(m=>({...m})),crates:this.crates.map(c=>({...c})),targets:this.targets.map(t=>({id:t.id,hp:t.hp,respawn:t.respawn}))};}
 save(){return {sequence:this.sequence,players:[...this.players.values()].map(p=>({...p})),targets:this.targets,crates:this.crates};}
 join({name,body,token}={}){
  const now=this.now();this.cleanup(now);let p=[...this.players.values()].find(p=>p.token===token&&typeof token==='string'&&token.length>=20);
  if(!p&&this.players.size>=MAX_PLAYERS)return {type:'full',max:MAX_PLAYERS};
  if(!p){const used=new Set([...this.players.values()].filter(p=>p.connected).map(p=>p.slot));let slot=SPAWNS.findIndex((_,i)=>!used.has(i));if(slot<0)slot=0;const pos=[...SPAWNS[slot]];pos[1]=this.world.heightAt(pos[0],pos[2])+.8;
   p={id:randomId(),token:randomId(),slot,name:cleanName(name),body:carId(body),p:pos,q:[0,0,0,1],v:[0,0,0],wy:[-.79,-.79,-.79,-.79],steer:0,spin:0,yaw:0,pitch:0,hp:MAX_HEALTH,shieldUntil:now+SHIELD_MS,respawnAt:0,crateAt:0,fireAt:0,recoverAt:0,kills:0,deaths:0,seq:-1,lastShotSeq:-1,lastState:now,lastMessage:now,tokens:100};this.players.set(p.id,p);
  }
  p.name=cleanName(name||p.name);p.connected=true;p.leftAt=0;p.lastMessage=p.lastState=now;p.seq=-1;p.lastShotSeq=-1;this.dirty=true;
  this.event('joined',{player:this.view(p)});return {...this.snapshot(),type:'welcome',id:p.id,token:p.token,max:MAX_PLAYERS,self:this.view(p)};
 }
 leave(id){const p=this.players.get(id);if(!p)return;p.connected=false;p.v=[0,0,0];p.leftAt=this.now();this.dirty=true;this.event('left',{id});}
 cleanup(now){for(const [id,p] of this.players)if(!p.connected&&now-p.leftAt>30000)this.players.delete(id);}
 message(id,m){const p=this.players.get(id);if(!p?.connected||!m||typeof m!=='object')return false;const now=this.now();p.tokens=Math.min(100,p.tokens+(now-p.lastMessage)*.06);p.lastMessage=now;if(p.tokens<1)return false;p.tokens--;
  if(m.type==='ping')return true;
  if(m.type==='state'){
   if(p.hp<=0||!validArray(m.p,3,80)||!validArray(m.q,4,1.01)||!validArray(m.v,3,65)||!Number.isSafeInteger(m.seq)||m.seq<=p.seq)return false;
   const norm=Math.hypot(...m.q),elapsed=Math.min(1,Math.max(.05,(now-p.lastState)/1000));if(norm<.9||norm>1.1||Math.abs(m.p[0])>47||Math.abs(m.p[2])>47||m.p[1]<-4||m.p[1]>25)return false;
   if(dist(p.p,m.p)>elapsed*38+2){this.event('correct',{id,p:p.p,q:p.q});return false;}
   // Prevent crossing walls while allowing suspension/ground movement.
   if(this.world.blocked([p.p[0],p.p[1]+.25,p.p[2]],[m.p[0],m.p[1]+.25,m.p[2]],.12)){this.event('correct',{id,p:p.p,q:p.q});return false;}
   p.p=m.p;p.q=m.q.map(n=>n/norm);p.v=m.v;p.seq=m.seq;p.lastState=now;p.body=carId(m.body);
   if(validArray(m.wy,4,3))p.wy=m.wy;if(Number.isFinite(m.steer))p.steer=Math.max(-.6,Math.min(.6,m.steer));if(Number.isFinite(m.spin))p.spin=m.spin%1000;
   if(Number.isFinite(m.yaw))p.yaw=m.yaw%(Math.PI*2);if(Number.isFinite(m.pitch))p.pitch=Math.max(-.65,Math.min(.65,m.pitch));return true;
  }
  if(m.type==='fire')return this.fire(p,m,now);
  if(m.type==='crate')return this.dropCrate(p,now);
  if(m.type==='homing')return this.launchHoming(p,m.targetId,now);
  if(m.type==='recover'&&p.hp>0&&now>=p.recoverAt){p.recoverAt=now+5000;this.moveToSpawn(p);this.event('recover',{id:p.id,player:this.view(p)});return true;}
  return false;
 }
 fire(p,m,now){const spec=WEAPONS[p.body];if(p.hp<=0||now<p.fireAt||!validArray(m.origin,3,80)||!validArray(m.direction,3,1.01)||dist(m.origin,p.p)>2.5||!Number.isSafeInteger(m.seq)||m.seq<=p.lastShotSeq)return false;
  const length=Math.hypot(...m.direction);if(length<.95||length>1.05||this.world.blocked([p.p[0],p.p[1]+.2,p.p[2]],m.origin,.02))return false;
  if(spec.burst){
   if(p.burstBody!==p.body||!p.burstLeft||now>=p.burstUntil){
    if(now<(p.volleyAt||0)-2)return false;
    p.burstBody=p.body;p.burstLeft=spec.burst;p.burstUntil=p.volleyAt=now+spec.interval*1000;
   }
   p.burstLeft--;p.fireAt=p.burstLeft?now+spec.burstInterval*1000-15:p.volleyAt-2;
  }else{p.burstLeft=0;p.fireAt=now+spec.interval*1000-2;}
  this.dirty=true;p.lastShotSeq=m.seq;p.shieldUntil=0;
  const shot={id:`${p.id}:${m.seq}`,owner:p.id,body:p.body,p:[...m.origin],v:m.direction.map(n=>n/length*spec.speed),life:spec.life};this.shots.push(shot);this.event('shot',{shot});return true;
 }
 dropCrate(p,now){if(p.hp<=0||now<p.crateAt||this.crates.filter(c=>c.owner===p.id).length>=3)return false;
  const f=forward(p.q),len=Math.hypot(f[0],f[2])||1,dir=[f[0]/len,0,f[2]/len],position=[p.p[0]-dir[0]*1.5,p.p[1]+.5,p.p[2]-dir[2]*1.5];
  if(this.world.blocked([p.p[0],p.p[1]+.3,p.p[2]],position,.3))return false;
  this.dirty=true;p.crateAt=now+CRATE_COOLDOWN_MS;p.shieldUntil=0;
  const crate={id:`crate:${++this.sequence}`,owner:p.id,p:position,v:[p.v[0]*.55-dir[0]*5,3,p.v[2]*.55-dir[2]*5],armedAt:now+650,expireAt:now+10000,fuseAt:0};this.crates.push(crate);this.event('crate',{crate});return true;
 }
 launchHoming(p,targetId,now){
  const target=this.players.get(targetId);
  if(p.hp<=0||now<(p.homingAt||0)||!target?.connected||target.hp<=0||target===p||dist(p.p,target.p)>HOMING.range)return false;
  const position=[p.p[0],p.p[1]+1.25,p.p[2]];
  if(this.world.blocked(p.p,position,HOMING.radius))return false;
  p.homingAt=now+HOMING.cooldown;p.shieldUntil=0;this.dirty=true;
  const missile={id:`homing:${++this.sequence}`,owner:p.id,targetId,targetDeaths:target.deaths,p:position,v:[0,HOMING.launchSpeed,0],launchedAt:now,expiresAt:now+HOMING.life};
  this.missiles.push(missile);this.event('homing-launch',{missile,readyAt:p.homingAt});return true;
 }
 tickHoming(now,dt){
  for(const missile of this.missiles){
   const target=this.players.get(missile.targetId);
   if(now>=missile.expiresAt||!target?.connected||target.hp<=0||target.deaths!==missile.targetDeaths){missile.dead=true;this.event('homing-end',{id:missile.id});continue;}
   if(now-missile.launchedAt>=HOMING.ascent*1000){
    const delta=target.p.map((value,i)=>value-missile.p[i]),length=Math.hypot(...delta)||1,blend=1-Math.exp(-8*dt);
    missile.v=missile.v.map((value,i)=>value+(delta[i]/length*HOMING.speed-value)*blend);
   }
   const next=missile.p.map((value,i)=>value+missile.v[i]*dt);
   const items=[...[...this.players.values()].filter(p=>p.connected&&p.hp>0&&p.id!==missile.owner).map(p=>this.world.playerCollider(p)),...this.targets.filter(t=>t.hp>0).map(t=>({kind:'target',id:t.id,active:true,bounds:box(t.p,[.65,.65,.65])})),...this.crates.map(c=>({kind:'crate',id:c.id,active:true,bounds:box(c.p,[.34,.34,.34])}))];
   const hit=this.world.traceAll(missile.p,next,items,HOMING.radius);
   if(hit){missile.p=missile.p.map((value,i)=>value+(next[i]-value)*hit.fraction);missile.dead=true;this.explode(missile.p,HOMING.splash,HOMING.damage,missile.owner,missile.id);}
   else missile.p=next;
  }
  this.missiles=this.missiles.filter(m=>!m.dead);
 }
 moveToSpawn(p){const candidates=SPAWNS.map((pos,slot)=>({pos,slot,clearance:Math.min(100,...[...this.players.values()].filter(o=>o.id!==p.id&&o.hp>0&&o.connected).map(o=>dist(pos,o.p)))})).sort((a,b)=>b.clearance-a.clearance);const choice=candidates[0];p.slot=choice.slot;p.p=[...choice.pos];p.p[1]=this.world.heightAt(p.p[0],p.p[2])+.8;p.q=[0,0,0,1];p.v=[0,0,0];p.lastState=this.now();p.seq=-1;}
 hurt(p,damage,owner,position,kick=[0,0,0]){if(p.hp<=0||!p.connected||this.now()<p.shieldUntil)return;p.hp=Math.max(0,p.hp-damage);this.dirty=true;
  if(p.hp===0){p.deaths++;p.respawnAt=this.now()+RESPAWN_MS;p.v=[0,0,0];const attacker=this.players.get(owner);if(attacker&&attacker!==p)attacker.kills++;this.event('destroyed',{id:p.id,owner,position:p.p,respawnAt:p.respawnAt});}
  this.event('damage',{id:p.id,owner,hp:p.hp,position,kick,respawnAt:p.respawnAt});
 }
 targetDamage(target,damage,owner){if(target.hp<=0)return;target.hp=Math.max(0,target.hp-damage);this.dirty=true;if(!target.hp){
  target.respawn=this.now()+6000;
  // Arena supplies heal the player landing the final hit. The explosion is
  // visual only; thrown combat crates still use the damaging explode() path.
  const player=this.players.get(owner);if(player?.connected&&player.hp>0)player.hp=MAX_HEALTH;
  this.event('explosion',{id:'target:'+target.id,position:target.p,radius:3.1});
 }this.event('target',{id:target.id,hp:target.hp,respawn:target.respawn,owner,position:target.p});}
 explode(position,radius,damage,owner,id){this.event('explosion',{id,position,radius});for(const p of this.players.values()){const d=dist(p.p,position);if(d>radius||this.world.blocked([position[0],position[1]+.2,position[2]],[p.p[0],p.p[1]+.2,p.p[2]]))continue;this.hurt(p,damage*Math.max(.1,1-d/radius),owner,position,blastKick(position,p.p,radius,4));}
  for(const target of this.targets)if(target.hp>0&&dist(target.p,position)<radius&&!this.world.blocked(position,target.p))this.targetDamage(target,damage*(1-dist(target.p,position)/radius),owner);
  for(const c of this.crates)if(!c.fuseAt&&c.id!==id&&dist(c.p,position)<radius)c.fuseAt=this.now()+400;
 }
 tick(){const now=this.now(),dt=Math.min(.15,Math.max(0,(now-this.lastTick)/1000));this.lastTick=now;this.cleanup(now);
  for(const p of this.players.values()){
   if(p.connected&&now-p.lastMessage>12000){this.leave(p.id);continue;}
   if(p.hp<=0&&now>=p.respawnAt){p.hp=MAX_HEALTH;p.respawnAt=0;p.shieldUntil=now+SHIELD_MS;this.moveToSpawn(p);this.dirty=true;this.event('respawn',{id:p.id,player:this.view(p)});}
  }
  for(const t of this.targets)if(!t.hp&&now>=t.respawn){t.hp=100;t.respawn=0;this.event('target',{id:t.id,hp:100,respawn:0});}
  this.tickHoming(now,dt);
  for(const c of this.crates){const next=c.p.map((v,i)=>v+c.v[i]*dt);c.v[1]-=4.905*dt;const wall=this.world.blocked(c.p,next,.3);if(wall){c.v[0]*=-.25;c.v[2]*=-.25;next[0]=c.p[0];next[2]=c.p[2];}c.p=next;const floor=this.world.heightAt(c.p[0],c.p[2])+.32;if(c.p[1]<=floor){c.p[1]=floor;c.v[1]=0;c.v[0]*=Math.exp(-5*dt);c.v[2]*=Math.exp(-5*dt);}
   if(!c.fuseAt&&now>=c.armedAt&&[...this.players.values()].some(p=>p.hp>0&&p.connected&&dist(p.p,c.p)<1.45))c.fuseAt=now+400;
   if(now>=c.expireAt||(c.fuseAt&&now>=c.fuseAt)){c.dead=true;this.explode(c.p,3.5,90,c.owner,c.id);}
  }this.crates=this.crates.filter(c=>!c.dead);
  const players=[...this.players.values()].filter(p=>p.hp>0&&p.connected);
  for(const shot of this.shots){const spec=WEAPONS[shot.body],next=shot.p.map((v,i)=>v+shot.v[i]*dt),items=[...players.filter(p=>p.id!==shot.owner).map(p=>this.world.playerCollider(p)),...this.targets.filter(t=>t.hp>0).map(t=>({kind:'target',id:t.id,active:true,bounds:box(t.p,[.65,.65,.65])})),...this.crates.map(c=>({kind:'crate',id:c.id,active:true,bounds:box(c.p,[.34,.34,.34])}))];const hit=this.world.traceAll(shot.p,next,items,spec.radius);
   if(hit){shot.p=shot.p.map((v,i)=>v+(next[i]-v)*hit.fraction);shot.life=0;const item=hit.item;
    if(item.kind==='player'){const p=this.players.get(item.id),n=Math.hypot(...shot.v)||1;this.hurt(p,spec.damage*.5,shot.owner,shot.p,shot.v.map((v,i)=>v/n*(spec.splash?.9:.10)+(i===1&&spec.splash?.25:0)));}
    if(item.kind==='crate'){const c=this.crates.find(c=>c.id===item.id);if(c&&!c.fuseAt)c.fuseAt=now+400;}
    if(spec.splash>0){this.event('explosion',{id:shot.id,position:shot.p,radius:spec.splash});for(const p of players)if(p.id!==item.id&&dist(p.p,shot.p)<spec.splash&&!this.world.blocked(shot.p,p.p))this.hurt(p,spec.damage*.35*(1-dist(p.p,shot.p)/spec.splash),shot.owner,shot.p,blastKick(shot.p,p.p,spec.splash,1.5));}
    if(item.kind==='target')this.targetDamage(this.targets.find(t=>t.id===item.id),spec.damage,shot.owner);
    this.event('impact',{id:shot.id,position:shot.p,large:spec.splash>0});
   }else{shot.p=next;shot.life-=dt;}
  }this.shots=this.shots.filter(s=>s.life>0).slice(-144);
  if(now-this.snapshotAt>=50){this.snapshotAt=now;this.broadcast(this.snapshot());}
 }
}
