// Original 136 BPM electronic chase score. Scheduled ahead on the audio
// clock, with no download or per-frame audio work.
export class BattleMusic {
 constructor(context){
  this.context=context;this.step=0;this.next=0;this.timer=null;
  this.master=context.createGain();this.master.gain.value=.23;
  this.limiter=context.createDynamicsCompressor();this.limiter.threshold.value=-14;this.limiter.ratio.value=5;
  this.master.connect(this.limiter);this.limiter.connect(context.destination);
  this.noise=context.createBuffer(1,context.sampleRate*.25,context.sampleRate);
  const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
 }
 tone(time,midi,duration,volume,type='triangle',endFrequency){
  const c=this.context,o=c.createOscillator(),gain=c.createGain(),hz=440*2**((midi-69)/12);
  o.type=type;o.frequency.setValueAtTime(hz,time);if(endFrequency)o.frequency.exponentialRampToValueAtTime(endFrequency,time+duration);
  gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(volume,time+.008);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
  o.connect(gain);gain.connect(this.master);o.start(time);o.stop(time+duration+.01);o.onended=()=>{o.disconnect();gain.disconnect();};
 }
 percussion(time,duration,frequency,volume){
  const c=this.context,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.noise;
  filter.type='highpass';filter.frequency.value=frequency;gain.gain.setValueAtTime(volume,time);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
  source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(time);source.stop(time+duration);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
 }
 schedule(){
  if(this.context.state!=='running'||document.hidden)return;
  if(this.next<this.context.currentTime)this.next=this.context.currentTime+.03;
  while(this.next<this.context.currentTime+.15){
   const step=this.step%16,bar=Math.floor(this.step/16)%8,root=[40,40,36,36,43,43,38,38][bar],t=this.next;
   if(step%4===0||step===14)this.tone(t,48,.17,.8,'sine',38);
   if(step===4||step===12){this.percussion(t,.14,1300,.26);this.tone(t,50,.09,.14);}
   if(step%2===0)this.percussion(t,.035,7500,step%4===2?.12:.065);
   if(step%2===0)this.tone(t,root+(step===10?12:0),.16,.23,'sawtooth');
   const arpeggio=[0,7,12,7,3,7,15,12];this.tone(t,root+24+arpeggio[step%8],.12,bar<4?.045:.075,'triangle');
   if(step===0)for(const note of [0,3,7])this.tone(t,root+12+note,1.5,.045,'triangle');
   this.step++;this.next+=60/136/4;
  }
 }
 start(){if(this.timer!==null||document.hidden)return;this.schedule();this.timer=setInterval(()=>this.schedule(),50);}
 stop(){if(this.timer!==null)clearInterval(this.timer);this.timer=null;}
}
