// Motri's 240-second day, weather relationships and wind direction, adapted
// for Boom. A shared wall clock keeps the atmosphere consistent between peers.
export const DAY_SECONDS=240,WEATHER_SECONDS=300;
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export const noise=x=>Math.sin(x)*Math.sin(x*1.678)*Math.sin(x*2.345);
export const WIND_DIRECTION=[Math.sin(Math.PI*.6),Math.cos(Math.PI*.6)];
export function seededRandom(seed=17017){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export function weatherAt(seconds){
  const phase=seconds/WEATHER_SECONDS*Math.PI*2;
  const humidity=.65+.3*Math.sin(phase),clouds=clamp(.5+.5*Math.sin(phase+.3));
  return {dayPhase:((seconds/DAY_SECONDS)%1+1)%1,clouds,
    rain:clamp((humidity-.65)/.35)*clouds,
    wind:clamp(.4+noise(seconds/70)*.25+clouds*.3)};
}
// Original Motri keyframe timings; the colours are balanced for WebGL lighting
// and readable combat at night (Motri uses its own node-material light model).
export const DAY_PALETTES={
  day:{sky:'#75b5d7',haze:'#c2dce0',light:'#ffd2c2',ambient:'#c4dcff',sun:2.5,fill:1.85,night:0},
  dusk:{sky:'#786aab',haze:'#e5b5ac',light:'#ffad91',ambient:'#afb5eb',sun:1.8,fill:1.25,night:.3},
  night:{sky:'#26395a',haze:'#7b8bb4',light:'#a6b9ef',ambient:'#aabbe8',sun:1.25,fill:1.35,night:1},
  dawn:{sky:'#889bc9',haze:'#efc19c',light:'#ffa882',ambient:'#c9badd',sun:2.1,fill:1.4,night:.2}
};
export const DAY_KEYS=[[0,'day'],[.15,'day'],[.25,'dusk'],[.35,'night'],[.6,'night'],[.8,'dawn'],[.9,'day'],[1,'day']];
