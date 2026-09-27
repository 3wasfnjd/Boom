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
export function traceShot(start,end,items,radius=0,ground=null) {
  let fraction=Infinity,item=null;
  for(const candidate of items){
    if(!candidate.active)continue;
    let t=segmentBoxFraction(start,end,candidate.bounds,radius);
    if(t!==null&&candidate.inverseMatrix){
      const m=candidate.inverseMatrix;
      const local=p=>({x:m[0]*p.x+m[4]*p.y+m[8]*p.z+m[12],y:m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13],z:m[2]*p.x+m[6]*p.y+m[10]*p.z+m[14]});
      t=segmentBoxFraction(local(start),local(end),candidate.localBounds,radius);
    }
    if(t!==null&&t<fraction){fraction=t;item=candidate;}
  }
  const groundHit=ground?ground.trace(start,end,radius):(end.y<radius&&start.y>=radius?(start.y-radius)/(start.y-end.y):null);
  if(groundHit!==null&&groundHit<fraction){fraction=groundHit;item={kind:'ground'};}
  return Number.isFinite(fraction)?{item,fraction}:null;
}
