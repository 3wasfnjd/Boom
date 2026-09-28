import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BattleRoom} from '../server/BattleRoom.js';
import {CollisionWorld} from '../server/CollisionWorld.js';
function fixture(){let time=10000;const events=[],world=new CollisionWorld({size:100,divisions:1,heights:[0,0,0,0],blockers:[],targets:[]}),room=new BattleRoom({now:()=>time,broadcast:e=>events.push(structuredClone(e)),world});const join=name=>{const w=room.join({name,body:'h9'});if(w.id)room.players.get(w.id).shieldUntil=0;return w;};return {room,world,events,join,advance(ms){for(let n=0;n<ms;n+=50){time+=50;room.tick();}}};}
function pose(p,pos){p.p=pos;p.q=[0,0,0,1];p.v=[0,0,0];}
function fire(f,a,seq,origin,direction=[0,0,1]){return f.room.message(a.id,{type:'fire',seq,origin,direction});}
test('room identity, full capacity and token reconnect retain health',()=>{const f=fixture(),a=f.join('<b>A</b>');assert.equal(f.room.players.get(a.id).name,'bAb');f.room.players.get(a.id).hp=37;for(let i=0;i<5;i++)f.join('P'+i);assert.equal(f.join('overflow').type,'full');f.room.leave(a.id);const resumed=f.room.join({name:'A',token:a.token});assert.equal(resumed.id,a.id);assert.equal(resumed.self.hp,37);assert.equal(f.room.players.size,6);});
test('server rejects forged HP, damage, shot rates, dead actions and teleport',()=>{const f=fixture(),a=f.join('A'),p=f.room.players.get(a.id);pose(p,[0,.6,0]);assert.equal(f.room.message(a.id,{type:'damage',hp:999}),false);assert.equal(p.hp,100);assert.equal(fire(f,a,1,[0,.8,1]),true);assert.equal(fire(f,a,2,[0,.8,1]),false);assert.equal(f.room.message(a.id,{type:'state',seq:1,p:[40,.6,40],q:[0,0,0,1],v:[0,0,0]}),false);p.hp=0;f.advance(200);p.hp=0;p.respawnAt=99999;assert.equal(fire(f,a,3,[0,.8,1]),false);assert.equal(f.room.message(a.id,{type:'crate'}),false);});
test('authoritative projectile damages once; health, kill and respawn agree',()=>{const f=fixture(),a=f.join('A'),b=f.join('B'),pa=f.room.players.get(a.id),pb=f.room.players.get(b.id);pose(pa,[0,.6,0]);pose(pb,[0,.6,7]);fire(f,a,1,[0,.8,1]);f.advance(200);assert.equal(pb.hp,94);assert.equal(f.events.filter(e=>e.type==='damage').length,1);pb.hp=6;fire(f,a,2,[0,.8,1]);f.advance(200);assert.equal(pb.hp,0);assert.equal(pa.kills,1);assert.equal(pb.deaths,1);assert.equal(f.room.message(b.id,{type:'recover'}),false);f.advance(5000);assert.equal(pb.hp,100);assert.ok(pb.shieldUntil>f.room.now());});
test('thin wall blocks bullets and blast; sweeps cannot tunnel',()=>{const f=fixture(),a=f.join('A'),b=f.join('B');pose(f.room.players.get(a.id),[0,.6,0]);pose(f.room.players.get(b.id),[0,.6,7]);f.world.blockers.push({kind:'wall',active:true,bounds:{min:{x:-2,y:0,z:3},max:{x:2,y:4,z:3.1}}});fire(f,a,1,[0,.8,1]);f.advance(500);assert.equal(f.room.players.get(b.id).hp,100);f.room.explode([0,.7,2],9,100,a.id,'test');assert.equal(f.room.players.get(b.id).hp,100);});
test('crate is thrown behind, arms, chains and deals damage with knockback',()=>{const f=fixture(),a=f.join('A'),b=f.join('B'),p=f.room.players.get(a.id),enemy=f.room.players.get(b.id);pose(p,[0,.6,0]);pose(enemy,[0,.6,-5]);assert.equal(f.room.message(a.id,{type:'crate'}),true);assert.equal(f.room.message(a.id,{type:'crate'}),false);const crate=f.room.crates[0];assert.ok(crate.p[2]<p.p[2]&&crate.v[2]<0);f.advance(700);pose(enemy,[...crate.p]);f.advance(500);assert.ok(enemy.hp<100);assert.equal(f.room.crates.length,0);assert.ok(f.events.some(e=>e.type==='damage'&&e.kick[1]>0));});
test('shooting a crate triggers Motri 400ms fuse and snapshot is complete',()=>{const f=fixture(),a=f.join('A'),b=f.join('B');pose(f.room.players.get(a.id),[0,.6,0]);pose(f.room.players.get(b.id),[10,.6,0]);f.room.crates.push({id:'mine',owner:b.id,p:[0,.8,5],v:[0,0,0],armedAt:999999,expireAt:999999,fuseAt:0});fire(f,a,1,[0,.8,1]);f.advance(150);assert.ok(f.room.crates[0].fuseAt>f.room.now());assert.equal(f.room.snapshot().crates.length,1);f.advance(450);assert.equal(f.room.crates.length,0);assert.ok(f.events.some(e=>e.type==='explosion'&&e.id==='mine'));});
test('recover cannot heal; disconnect grace expires; room restart retains health',()=>{const f=fixture(),a=f.join('A'),p=f.room.players.get(a.id);p.hp=25;assert.equal(f.room.message(a.id,{type:'recover'}),true);assert.equal(p.hp,25);const room2=new BattleRoom({now:()=>f.room.now(),world:f.world,saved:f.room.save()});assert.equal(room2.join({token:a.token}).self.hp,25);f.room.leave(a.id);f.advance(30100);assert.equal(f.room.players.size,0);});
test('actual world map contains terrain, bridge and rest-house blockers',()=>{const w=new CollisionWorld();assert.equal(w.data.heights.length,9409);assert.equal(w.blockers.length,109);assert.ok(w.heightAt(20,-20)<-.6);assert.ok(w.blocked([13,0,-20],[27,0,-20]));});
test('cannon and rockets use the selected vehicle weapon on the server',()=>{for(const [car,damage] of [['shas',35],['datsun',27.5]]){const f=fixture(),a=f.join('A'),b=f.join('B'),p=f.room.players.get(a.id),enemy=f.room.players.get(b.id);p.body=car;pose(p,[0,.6,0]);pose(enemy,[0,.6,7]);fire(f,a,1,[0,.8,1]);f.advance(500);assert.equal(enemy.hp,100-damage,car);assert.ok(f.events.some(e=>e.type==='explosion'));}});
test('separate rooms do not exchange players, damage or crates',()=>{const a=fixture(),b=fixture(),p=a.join('A'),q=b.join('B');a.room.message(p.id,{type:'crate'});a.advance(500);assert.equal(b.room.snapshot().players.length,1);assert.equal(b.room.snapshot().crates.length,0);assert.equal(b.room.players.get(q.id).hp,100);});
test('arena supply heals only the final-hit player, once, and its blast is harmless',()=>{
 const f=fixture(),a=f.join('A'),b=f.join('B'),pa=f.room.players.get(a.id),pb=f.room.players.get(b.id);
 const target={id:0,p:[0,.6,0],hp:100,respawn:0};f.room.targets.push(target);pose(pa,[0,.6,0]);pose(pb,[0,.6,1]);pa.hp=20;pb.hp=30;
 f.room.targetDamage(target,90,a.id);assert.equal(pa.hp,20);assert.equal(pb.hp,30);
 f.room.targetDamage(target,10,b.id);assert.equal(pb.hp,100);assert.equal(pa.hp,20);assert.equal(pb.kills,0);assert.equal(target.hp,0);
 pb.hp=40;f.room.targetDamage(target,100,b.id);assert.equal(pb.hp,40);
 assert.equal(f.room.message(a.id,{type:'heal',hp:100}),false);assert.equal(pa.hp,20);
 f.advance(6000);assert.equal(target.hp,100);f.room.targetDamage(target,100,a.id);f.advance(50);
 assert.equal(pa.hp,100);assert.equal(pb.hp,40);assert.equal(f.room.snapshot().players.find(p=>p.id===a.id).hp,100);
 assert.equal(f.room.save().players.find(p=>p.id===a.id).hp,100);
});
test('each vehicle can restore health by shooting an arena supply',()=>{
 for(const body of ['h9','shas','datsun']){
  const f=fixture(),a=f.join('A'),p=f.room.players.get(a.id);p.body=body;p.hp=23;pose(p,[0,.6,0]);
  f.room.targets.push({id:0,p:[0,.8,5],hp:10,respawn:0});assert.equal(fire(f,a,1,[0,.8,1]),true);f.advance(300);
  assert.equal(f.room.targets[0].hp,0,body);assert.equal(p.hp,100,body);assert.ok(f.events.some(e=>e.type==='explosion'&&e.id==='target:0'));
 }
});
test('supply rewards cannot resurrect dead or disconnected attackers',()=>{
 const f=fixture(),a=f.join('A'),p=f.room.players.get(a.id);p.hp=0;p.respawnAt=99999;
 f.room.targetDamage({id:0,p:[0,0,0],hp:10},10,a.id);assert.equal(p.hp,0);
 p.hp=25;f.room.leave(a.id);f.room.targetDamage({id:1,p:[0,0,0],hp:10},10,a.id);assert.equal(p.hp,25);
 assert.doesNotThrow(()=>f.room.targetDamage({id:2,p:[0,0,0],hp:10},10,'departed'));
});
test('rocket volley permits six timed rockets, rejects a seventh and enforces reload',()=>{
 const f=fixture(),a=f.join('A'),p=f.room.players.get(a.id);p.body='datsun';pose(p,[0,.6,0]);
 assert.equal(fire(f,a,1,[0,.8,1]),true);assert.equal(fire(f,a,2,[0,.8,1]),false);
 for(let seq=2;seq<=6;seq++){f.advance(150);assert.equal(fire(f,a,seq,[0,.8,1]),true);}
 f.advance(150);assert.equal(fire(f,a,7,[0,.8,1]),false);assert.equal(f.events.filter(e=>e.type==='shot').length,6);
 f.advance(1000);assert.equal(fire(f,a,7,[0,.8,1]),true);p.hp=0;p.respawnAt=99999;f.advance(150);assert.equal(fire(f,a,8,[0,.8,1]),false);
});
test('homing launches vertically, follows the selected moving enemy and damages only once',()=>{
 const f=fixture(),a=f.join('A'),b=f.join('B'),c=f.join('C'),pa=f.room.players.get(a.id),pb=f.room.players.get(b.id),pc=f.room.players.get(c.id);pose(pa,[0,.6,0]);pose(pb,[0,.6,18]);pose(pc,[-20,.6,0]);
 assert.equal(f.room.message(a.id,{type:'homing',targetId:b.id,p:[99,99,99]}),true);const missile=f.room.missiles[0];assert.deepEqual(missile.p,[0,1.85,0]);
 f.advance(400);assert.ok(missile.p[1]>8);assert.equal(missile.p[0],0);assert.equal(missile.p[2],0);
 pose(pb,[9,.6,18]);f.advance(4000);assert.equal(f.room.missiles.length,0);assert.ok(pb.hp<100);assert.equal(pc.hp,100);assert.equal(pa.hp,100);
 assert.equal(f.events.filter(e=>e.type==='damage'&&e.id===b.id).length,1);assert.equal(f.room.snapshot().players.find(p=>p.id===b.id).hp,pb.hp);
});
test('homing validates target and range, enforces cooldown and persists its timer',()=>{
 const f=fixture(),a=f.join('A'),b=f.join('B'),pa=f.room.players.get(a.id),pb=f.room.players.get(b.id);pose(pa,[0,.6,0]);pose(pb,[0,.6,20]);
 for(const targetId of [null,'unknown',a.id])assert.equal(f.room.message(a.id,{type:'homing',targetId}),false);
 pose(pb,[100,.6,0]);assert.equal(f.room.message(a.id,{type:'homing',targetId:b.id}),false);pose(pb,[0,.6,20]);
 assert.equal(f.room.message(a.id,{type:'homing',targetId:b.id}),true);assert.equal(f.room.message(a.id,{type:'homing',targetId:b.id}),false);assert.equal(f.room.snapshot().missiles[0].targetId,b.id);
 const restored=new BattleRoom({now:()=>f.room.now(),world:f.world,saved:f.room.save()});assert.equal(restored.join({token:a.token}).self.homingAt,pa.homingAt);
 f.advance(10000);assert.equal(f.room.message(a.id,{type:'homing',targetId:b.id}),true);
});
test('homing cancels if target leaves or dies and never retargets a respawn',()=>{
 for(const scenario of ['leave','dead','respawn']){
  const f=fixture(),a=f.join('A'),b=f.join('B'),pa=f.room.players.get(a.id),pb=f.room.players.get(b.id);pose(pa,[0,.6,0]);pose(pb,[0,.6,20]);f.room.message(a.id,{type:'homing',targetId:b.id});
  if(scenario==='leave')f.room.leave(b.id);else if(scenario==='dead'){pb.hp=0;pb.respawnAt=99999;}else pb.deaths++;
  f.advance(50);assert.equal(f.room.missiles.length,0,scenario);assert.ok(f.events.some(e=>e.type==='homing-end'));assert.ok(!f.events.some(e=>e.type==='damage'));
 }
});
test('homing cannot pass through cover or fire through a roof',()=>{
 const f=fixture(),a=f.join('A'),b=f.join('B'),pa=f.room.players.get(a.id),pb=f.room.players.get(b.id);pose(pa,[0,.6,0]);pose(pb,[0,.6,18]);
 f.world.blockers.push({kind:'wall',active:true,bounds:{min:{x:-20,y:0,z:8},max:{x:20,y:30,z:9}}});
 assert.equal(f.room.message(a.id,{type:'homing',targetId:b.id}),true);f.advance(4000);assert.equal(pb.hp,100);assert.equal(f.room.missiles.length,0);
 const roof={kind:'wall',active:true,bounds:{min:{x:-2,y:1.1,z:-2},max:{x:2,y:1.3,z:2}}};f.world.blockers.push(roof);pa.homingAt=0;assert.equal(f.room.message(a.id,{type:'homing',targetId:b.id}),false);
});
