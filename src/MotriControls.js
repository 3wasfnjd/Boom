const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
// Motri's forward/reverse cone, with a responsive curve for Boom's small touch pad.
// The existing compact touch pad replaces its world-space ring so a second
// finger can aim/fire. Steering is tire steering; it never rotates the body.
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
  window.addEventListener('keydown',e=>{this.keys[e.code]=true;});window.addEventListener('keyup',e=>{this.keys[e.code]=false;});
  this.setupTouchUI();
 }
 setupTouchUI(){
  if(!('ontouchstart' in window))return;
  const zone=document.createElement('div');zone.className='steer-zone';zone.innerHTML='<div class="steer-base"><div class="steer-knob"></div></div>';document.body.appendChild(zone);
  const base=zone.firstElementChild,knob=base.firstElementChild;
  const sample=e=>{const r=base.getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/40,y=(e.clientY-r.top-r.height/2)/40;const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}this.touchDirX=x;this.touchDirY=y;knob.style.transform=`translate(${x*40}px,${y*40}px)`;};
  zone.addEventListener('pointerdown',e=>{if(this.steerPointerId!==null)return;e.preventDefault();this.steerPointerId=e.pointerId;zone.setPointerCapture(e.pointerId);this.touchActive=true;sample(e);base.classList.add('active');});
  zone.addEventListener('pointermove',e=>{if(e.pointerId===this.steerPointerId)sample(e);});
  const end=e=>{if(e&&e.pointerId!==this.steerPointerId)return;this.steerPointerId=null;this.touchActive=false;this.touchDirX=this.touchDirY=0;knob.style.transform='';base.classList.remove('active');};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(name,end);
  window.addEventListener('blur',()=>end());document.addEventListener('visibilitychange',()=>{if(document.hidden)end();});
 }
 update(worldAngle,heading=0){
  const k=this.keys,gp=Array.from(navigator.getGamepads?.()??[]).find(Boolean);
  let x=(k.KeyA||k.ArrowLeft?1:0)-(k.KeyD||k.ArrowRight?1:0),z=(k.KeyW||k.ArrowUp?1:0)-(k.KeyS||k.ArrowDown?1:0);
  if(gp){if(!x&&Math.abs(gp.axes[0]||0)>.12)x=-gp.axes[0];if(!z)z=(gp.buttons[7]?.value||0)-(gp.buttons[6]?.value||0);if(gp.buttons[12]?.pressed)z=1;if(gp.buttons[13]?.pressed)z=-1;}
  if(this.touchActive){const dx=this.touchDirX,dy=this.touchDirY,progress=Math.hypot(dx,dy),c=Math.cos(worldAngle),s=Math.sin(worldAngle);if(progress>.03)({x,z}=motriTouchInput(dx*c+dy*s,-dx*s+dy*c,progress,heading));else{x=0;z=0;}}
  return {x,z,touchActive:this.touchActive,handbrake:!!(k.KeyB||k.ControlLeft||gp?.buttons[2]?.pressed),boost:!!(k.ShiftLeft||k.ShiftRight||gp?.buttons[1]?.pressed)};
 }
}
