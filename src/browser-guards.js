// Install before the game bundle finishes loading. Keep Pointer Events flowing:
// prevent only browser defaults, never stop propagation or synthesize clicks.
(()=>{
 const editable='input,textarea,select,[contenteditable=""],[contenteditable="true"]';
 const nativeTap=editable+',button,a,label';
 const pointers='#game,.drive-zone,#aim-pad,#brake,#drop-crate';
 const closest=(event,selector)=>event.target instanceof Element&&event.target.closest(selector);
 const prevent=event=>{if(event.cancelable)event.preventDefault();};
 const listen=(type,handler)=>document.addEventListener(type,handler,{capture:true,passive:false});
 for(const type of ['gesturestart','gesturechange','gestureend'])listen(type,prevent);
 for(const type of ['contextmenu','selectstart','dragstart','dblclick'])listen(type,event=>{
  if(!closest(event,editable))prevent(event);
 });
 listen('touchstart',event=>{
  if(event.touches.length>1){prevent(event);return;}
  if(closest(event,editable)||closest(event,'#room-dialog'))return;
  const x=event.touches[0]?.clientX;
  if(closest(event,pointers)||(!closest(event,nativeTap)&&(x<20||x>innerWidth-20)))prevent(event);
 });
 listen('touchmove',event=>{
  if(event.touches.length>1||(!closest(event,editable)&&!closest(event,'#room-dialog')))prevent(event);
 });
 // Legacy Safari double-tap fallback on surfaces which do not use native clicks.
 let lastTap=null;
 listen('touchend',event=>{
  if(closest(event,nativeTap)||closest(event,'#room-dialog')||event.touches.length){lastTap=null;return;}
  const t=event.changedTouches[0];if(!t)return;
  const now=performance.now();
  if(lastTap&&now-lastTap.time<350&&Math.hypot(t.clientX-lastTap.x,t.clientY-lastTap.y)<32)prevent(event);
  lastTap={time:now,x:t.clientX,y:t.clientY};
 });
 listen('touchcancel',()=>{lastTap=null;});
 listen('wheel',event=>{if(event.ctrlKey&&!closest(event,editable))prevent(event);});
 listen('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&['+','-','=','0'].includes(event.key)&&!closest(event,editable))prevent(event);
 });
})();
