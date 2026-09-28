export const PROTOCOL=1,MAX_PLAYERS=6,MAX_HEALTH=100,RESPAWN_MS=5000,SHIELD_MS=2000,CRATE_COOLDOWN_MS=5000;
export const WEAPONS={
 h9:{kind:'machinegun',label:'رشاش مزدوج',interval:.11,speed:70,damage:12,radius:.035,life:1,splash:0},
 shas:{kind:'cannon',label:'مدفع',interval:.85,speed:34,damage:70,radius:.10,life:2,splash:1.8},
 datsun:{kind:'rockets',label:'قاذف صواريخ',interval:.55,speed:26,damage:55,radius:.09,life:2.5,splash:2.2}
};
export const SPAWNS=[[-2,.8,-22],[2,.8,-22],[6,.8,-22],[-2,.8,-28],[2,.8,-28],[6,.8,-28]];
export const cleanName=v=>String(v||'لاعب').replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,14)||'لاعب';
export const cleanRoom=v=>String(v||'public').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,24)||'public';
export const carId=v=>Object.hasOwn(WEAPONS,v)?v:'h9';
export const validArray=(a,n,limit)=>Array.isArray(a)&&a.length===n&&a.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=limit);
export const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export const point=a=>({x:a[0],y:a[1],z:a[2]});
export const array=p=>[p.x,p.y,p.z];
export function forward(q){return [2*(q[0]*q[2]+q[3]*q[1]),2*(q[1]*q[2]-q[3]*q[0]),1-2*(q[0]*q[0]+q[1]*q[1])];}
export function box(p,half){return {min:{x:p[0]-half[0],y:p[1]-half[1],z:p[2]-half[2]},max:{x:p[0]+half[0],y:p[1]+half[1],z:p[2]+half[2]}};}
export function blastKick(center,position,radius,strength=4){
 const dx=position[0]-center[0],dz=position[2]-center[2],distance=Math.hypot(dx,dz),falloff=Math.max(0,Math.min(1,(radius-distance)/(radius-.5))),magnitude=strength*falloff;
 const horizontal=distance>1e-6?.4472135955*magnitude/distance:0;
 return [dx*horizontal,.894427191*magnitude,dz*horizontal];
}

export function randomId(){if(globalThis.crypto.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);}
