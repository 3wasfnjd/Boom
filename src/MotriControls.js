const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
// Legacy direction conversion retained for the physics reference checks.
// On-screen arrows below use car-relative throttle and tire steering.
export function motriTouchInput(x,z,progress,heading){
 let delta=angle(heading,Math.atan2(x,z));const forward=Math.abs(delta)<Math.PI*.75;
 if(!forward)delta=angle(heading+Math.PI,Math.atan2(x,z));
 const steering=clamp(delta/(Math.PI/4),-1,1)*(forward?1:-1);
 const throttle=Math.pow(clamp((progress-.06)/.74,0,1),.85);
 return {x:steering,z:throttle*(forward?1:-1)};
}
export class MotriControls {
 constructor(){
  this.keys={};this.touchActive=false;this.touchDirX=this.touchDirY=0;this.steerPointerId=null;
  window.addEventListener('keydown',e=>{if(!e.target.matches('input,textarea'))this.keys[e.code]=true;});window.addEventListener('keyup',e=>{this.keys[e.code]=false;});
  this.setupTouchUI();
 }
 setupTouchUI(){
  this.pointers=new Map();
  if(!('ontouchstart' in window))return;
  const zone=document.createElement('div');zone.className='drive-pad';zone.setAttribute('role','group');zone.setAttribute('aria-label','أسهم القيادة');
  zone.innerHTML='<button data-drive="up" aria-label="بنزين">▲</button><button data-drive="left" aria-label="يسار">◀</button><span class="drive-center" aria-hidden="true"></span><button data-drive="right" aria-label="يمين">▶</button><button data-drive="down" aria-label="فرامل ثم ريوس">▼</button>';document.body.appendChild(zone);this.zone=zone;
  const sample=e=>{const r=zone.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;this.pointers.set(e.pointerId,{x:x<0||x>1||y<0||y>1?0:x<1/3?1:x>2/3?-1:0,z:x<0||x>1||y<0||y>1?0:y<1/3?1:y>2/3?-1:0});this.syncTouch();};
  zone.addEventListener('pointerdown',e=>{e.preventDefault();zone.setPointerCapture(e.pointerId);sample(e);});
  zone.addEventListener('pointermove',e=>{if(this.pointers.has(e.pointerId))sample(e);});
  const end=e=>{this.pointers.delete(e.pointerId);this.syncTouch();};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(name,end);
  window.addEventListener('blur',()=>this.release());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.release();});
 }
 syncTouch(){
  const values=[...this.pointers.values()],left=values.some(v=>v.x>0),right=values.some(v=>v.x<0),up=values.some(v=>v.z>0),down=values.some(v=>v.z<0);
  this.touchDirX=Number(left)-Number(right);this.touchDirY=Number(up)-Number(down);this.touchActive=this.pointers.size>0;
  for(const [name,active] of Object.entries({left,right,up,down}))this.zone?.querySelector(`[data-drive="${name}"]`).classList.toggle('active',active);
 }
 release(){this.keys={};this.pointers.clear();this.syncTouch();}
 update(worldAngle,heading=0){
  const k=this.keys,gp=Array.from(navigator.getGamepads?.()??[]).find(Boolean);
  let x=(k.KeyA||k.ArrowLeft?1:0)-(k.KeyD||k.ArrowRight?1:0),z=(k.KeyW||k.ArrowUp?1:0)-(k.KeyS||k.ArrowDown?1:0);
  if(gp){if(!x&&Math.abs(gp.axes[0]||0)>.12)x=-gp.axes[0];if(!z)z=(gp.buttons[7]?.value||0)-(gp.buttons[6]?.value||0);if(gp.buttons[14]?.pressed)x=1;if(gp.buttons[15]?.pressed)x=-1;if(gp.buttons[12]?.pressed)z=1;if(gp.buttons[13]?.pressed)z=-1;}
  if(this.touchActive){x=this.touchDirX;z=this.touchDirY;}
  return {x,z,touchActive:this.touchActive,handbrake:!!(k.KeyB||k.ControlLeft||gp?.buttons[2]?.pressed),boost:!!(k.ShiftLeft||k.ShiftRight||gp?.buttons[1]?.pressed)};
 }
}
