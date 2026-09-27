import * as THREE from 'three';
import {Controls} from '../verification/Controls.js';

export class CombatInput {
  constructor(canvas) {
    this.drive=new Controls();this.mouse=new THREE.Vector2();this.mouseAiming=false;this.mouseFire=false;this.padFire=false;this.braking=false;
    this.stick=new THREE.Vector2();this.padPointer=null;this.brakePointer=null;this.canvas=canvas;
    const pad=document.getElementById('aim-pad'),knob=document.getElementById('aim-knob'),brake=document.getElementById('brake');
    const resetPad=()=>{this.padFire=false;this.padPointer=null;this.stick.set(0,0);knob.style.transform='';pad.classList.remove('active');};
    const resetBrake=()=>{this.braking=false;this.brakePointer=null;brake.classList.remove('active');};
    pad.addEventListener('pointerdown',e=>{if(this.padPointer!==null)return;e.preventDefault();this.mouseAiming=false;this.padPointer=e.pointerId;pad.setPointerCapture(e.pointerId);this.padFire=true;pad.classList.add('active');});
    pad.addEventListener('pointermove',e=>{
      if(e.pointerId!==this.padPointer)return;const r=pad.getBoundingClientRect();this.stick.set((e.clientX-r.left-r.width/2)/35,(e.clientY-r.top-r.height/2)/35);
      if(this.stick.length()>1)this.stick.normalize();knob.style.transform=`translate(${this.stick.x*24}px,${this.stick.y*24}px)`;
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,e=>{if(e.pointerId===this.padPointer)resetPad();});
    brake.addEventListener('pointerdown',e=>{if(this.brakePointer!==null)return;e.preventDefault();this.brakePointer=e.pointerId;brake.setPointerCapture(e.pointerId);this.braking=true;brake.classList.add('active');});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])brake.addEventListener(event,e=>{if(e.pointerId===this.brakePointer)resetBrake();});
    const readMouse=e=>{const r=canvas.getBoundingClientRect();this.mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);};
    canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;readMouse(e);this.mouseAiming=true;});
    canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;readMouse(e);this.mouseAiming=true;this.mouseFire=true;canvas.setPointerCapture(e.pointerId);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>this.mouseFire=false);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();});
    pad.addEventListener('keydown',e=>{if(e.code==='Enter')this.padFire=true;});pad.addEventListener('keyup',()=>this.padFire=false);
    this.release=()=>{this.drive.keys={};this.drive.touchActive=false;this.drive.steerPointerId=null;this.drive.touchDirX=0;this.drive.touchDirY=0;this.mouseFire=false;this.mouseAiming=false;resetPad();resetBrake();document.querySelector('.steer-base')?.classList.remove('active');const k=document.querySelector('.steer-knob');if(k)k.style.transform='';};
    window.addEventListener('blur',this.release);document.addEventListener('visibilitychange',()=>{if(document.hidden)this.release();});
  }
  read(worldAngle) {
    const input=this.drive.update(worldAngle);
    const gp=Array.from(navigator.getGamepads?.()??[]).find(Boolean);
    input.handbrake ||= this.braking||!!gp?.buttons[4]?.pressed;
    const aim=new THREE.Vector2();let mode='assist';
    if(this.padFire&&this.stick.length()>.2){mode='stick';aim.copy(this.stick);}
    else if(gp&&Math.hypot(gp.axes[2]||0,gp.axes[3]||0)>.2){mode='stick';aim.set(gp.axes[2],gp.axes[3]);}
    else if(this.mouseAiming&&!this.padFire)mode='mouse';
    if(mode==='stick'){
      const x=aim.x,y=aim.y,c=Math.cos(worldAngle),s=Math.sin(worldAngle);aim.set(x*c+y*s,-x*s+y*c).normalize();
    }
    return {drive:input,mode,aim,mouse:this.mouse,fire:this.padFire||this.mouseFire||!!this.drive.keys.Space||!!gp?.buttons[5]?.pressed};
  }
}
