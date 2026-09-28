// Keep simulation time independent of rendering down to 4 FPS. Long pauses
// are capped at 250 ms to avoid a large catch-up jump when resuming a tab.
export class FixedStepClock {
 constructor(){this.step=1/60;this.accumulator=0;this.simulated=0;this.elapsed=0;this.dropped=0;}
 advance(elapsed,tick){
  const delta=Math.max(0,Math.min(elapsed,.25));
  this.elapsed+=Math.max(0,elapsed);this.dropped+=Math.max(0,elapsed-delta);this.accumulator+=delta;
  let steps=0;
  while(this.accumulator+1e-9>=this.step&&steps<15){tick();this.accumulator=Math.max(0,this.accumulator-this.step);this.simulated+=this.step;steps++;}
  return steps;
 }
 reset(){this.accumulator=0;this.simulated=this.elapsed=this.dropped=0;}
}
