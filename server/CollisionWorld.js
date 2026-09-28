import map from '../shared/arena-collision.json' with {type:'json'};
import {traceShot} from '../src/ShotCollision.js';
import {box,point,forward} from '../shared/BattleRules.js';
export class CollisionWorld {
 constructor(data=map){this.data=data;this.blockers=data.blockers;}
 heightAt(x,z){const d=this.data.divisions,side=d+1,cell=this.data.size/d,gx=Math.max(0,Math.min(d,(x+this.data.size/2)/cell)),gz=Math.max(0,Math.min(d,(z+this.data.size/2)/cell)),ix=Math.min(d-1,Math.floor(gx)),iz=Math.min(d-1,Math.floor(gz)),u=gx-ix,v=gz-iz,k=iz*side+ix,h=this.data.heights;return u+v<=1?h[k]*(1-u-v)+h[k+1]*u+h[k+side]*v:h[k+1]*(1-v)+h[k+side]*(1-u)+h[k+side+1]*(u+v-1);}
 trace(start,end,radius=0){const clear=t=>start.y+(end.y-start.y)*t-radius-this.heightAt(start.x+(end.x-start.x)*t,start.z+(end.z-start.z)*t);if(clear(0)<=0)return 0;const steps=Math.max(1,Math.ceil(Math.hypot(end.x-start.x,end.z-start.z)/.35));for(let i=1;i<=steps;i++)if(clear(i/steps)<=0){let lo=(i-1)/steps,hi=i/steps;for(let k=0;k<10;k++){const m=(lo+hi)/2;if(clear(m)>0)lo=m;else hi=m;}return hi;}return null;}
 blocked(a,b,radius=0){return traceShot(point(a),point(b),this.blockers,radius,this);}
 traceAll(a,b,items,radius=0){return traceShot(point(a),point(b),[...this.blockers,...items],radius,this);}
 playerCollider(p){const f=forward(p.q),yaw=Math.atan2(f[0],f[2]),c=Math.cos(yaw),s=Math.sin(yaw),[x,y,z]=p.p;
  const half=[.48,.45,.85],localBounds=box([0,0,0],half),inverseMatrix=[c,0,s,0,0,1,0,0,-s,0,c,0,-c*x+s*z,-y,-s*x-c*z,1];
  return {kind:'player',id:p.id,active:p.hp>0&&p.connected,bounds:box(p.p,[Math.abs(c)*half[0]+Math.abs(s)*half[2],half[1],Math.abs(s)*half[0]+Math.abs(c)*half[2]]),localBounds,inverseMatrix};}
}
