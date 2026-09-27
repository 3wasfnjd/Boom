const AXES=['x','y','z'];

// Continuous segment-box test: a fast shot cannot skip a thin target or wall.
export function segmentBoxFraction(start,end,bounds,radius=0) {
  let near=0,far=1;
  for(const axis of AXES){
    const delta=end[axis]-start[axis],lo=bounds.min[axis]-radius,hi=bounds.max[axis]+radius;
    if(Math.abs(delta)<1e-9){if(start[axis]<lo||start[axis]>hi)return null;continue;}
    let a=(lo-start[axis])/delta,b=(hi-start[axis])/delta;if(a>b)[a,b]=[b,a];
    near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;
  }
  return near;
}
export function traceShot(start,end,items,radius=0) {
  let fraction=Infinity,item=null;
  for(const candidate of items){
    if(!candidate.active)continue;const t=segmentBoxFraction(start,end,candidate.bounds,radius);
    if(t!==null&&t<fraction){fraction=t;item=candidate;}
  }
  if(end.y<radius&&start.y>=radius){const t=(start.y-radius)/(start.y-end.y);if(t<fraction){fraction=t;item={kind:'ground'};}}
  return Number.isFinite(fraction)?{item,fraction}:null;
}
