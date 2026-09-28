const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
// Legacy direction conversion retained for the physics reference checks.
// The floating stick below uses independent throttle and steering axes.
export function motriTouchInput(x,z,progress,heading){
 let delta=angle(heading,Math.atan2(x,z));const forward=Math.abs(delta)<Math.PI*.75;
 if(!forward)delta=angle(heading+Math.PI,Math.atan2(x,z));
 const steering=clamp(delta/(Math.PI/4),-1,1)*(forward?1:-1);
 const throttle=Math.pow(clamp((progress-.06)/.74,0,1),.85);
 return {x:steering,z:throttle*(forward?1:-1)};
}
// Independent car-relative axes: camera rotation never changes the driving input.
const axis=(value,power)=>Math.sign(value)*Math.pow(clamp((Math.abs(value)-.08)/.92,0,1),power);
export class MotriControls {
 constructor(){
  this.keys={};this.touchActive=false;this.touchDirX=this.touchDirY=0;this.pointer=null;
  window.addEventListener('keydown',e=>{if(!e.target.closest?.('input,textarea,select,[contenteditable]'))this.keys[e.code]=true;});window.addEventListener('keyup',e=>{this.keys[e.code]=false;});
  this.setupTouchUI();
  window.addEventListener('blur',()=>this.release());window.addEventListener('resize',()=>this.release());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.release();});
 }
 setupTouchUI(){
  if(!('ontouchstart' in window))return;
  const zone=document.createElement('div');zone.className='drive-zone';zone.setAttribute('aria-label','اسحب للقيادة: فوق بنزين وتحت فرامل ثم ريوس');
  zone.innerHTML='<div class="drive-stick"><span class="drive-axis vertical"></span><span class="drive-axis horizontal"></span><span class="drive-knob"></span><small>قيادة</small></div>';document.body.appendChild(zone);
  this.zone=zone;this.base=zone.firstElementChild;this.knob=zone.querySelector('.drive-knob');
  zone.addEventListener('pointerdown',e=>{
   if(this.pointer!==null||e.pointerType==='mouse')return;e.preventDefault();this.pointer=e.pointerId;zone.setPointerCapture(e.pointerId);
   this.originX=e.clientX;this.originY=e.clientY;this.touchActive=true;this.touchDirX=this.touchDirY=0;
   this.base.style.left=`${e.clientX}px`;this.base.style.top=`${e.clientY}px`;this.base.classList.add('active');
  });
  zone.addEventListener('pointermove',e=>{
   if(e.pointerId!==this.pointer)return;e.preventDefault();
   const dx=(e.clientX-this.originX)/48,dy=(e.clientY-this.originY)/48;
   this.touchDirX=-axis(dx,1.35);this.touchDirY=-axis(dy,1.1);
   const length=Math.max(1,Math.hypot(dx,dy));this.knob.style.transform=`translate(${dx/length*40}px,${dy/length*40}px)`;
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(type,e=>{if(e.pointerId===this.pointer)this.releaseTouch();});
 }
 releaseTouch(){this.pointer=null;this.touchActive=false;this.touchDirX=this.touchDirY=0;if(this.base){this.base.classList.remove('active');this.base.style.left=this.base.style.top='';this.knob.style.transform='';}}
 release(){this.keys={};this.releaseTouch();}
 update(worldAngle,heading=0){
  const k=this.keys,gp=Array.from(navigator.getGamepads?.()??[]).find(Boolean);
  let x=(k.KeyA||k.ArrowLeft?1:0)-(k.KeyD||k.ArrowRight?1:0),z=(k.KeyW||k.ArrowUp?1:0)-(k.KeyS||k.ArrowDown?1:0);
  if(gp){if(!x&&Math.abs(gp.axes[0]||0)>.12)x=-gp.axes[0];if(!z)z=(gp.buttons[7]?.value||0)-(gp.buttons[6]?.value||0);if(gp.buttons[14]?.pressed)x=1;if(gp.buttons[15]?.pressed)x=-1;if(gp.buttons[12]?.pressed)z=1;if(gp.buttons[13]?.pressed)z=-1;}
  if(this.touchActive){x=this.touchDirX;z=this.touchDirY;}
  return {x,z,touchActive:this.touchActive,handbrake:!!(k.KeyB||k.ControlLeft||gp?.buttons[2]?.pressed),boost:!!(k.ShiftLeft||k.ShiftRight||gp?.buttons[1]?.pressed)};
 }
}
