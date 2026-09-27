// BOOM's driving layout. Prefab geometry and palettes come from Motri.
export const ARENA_HALF = 46;
export const SPAWN = [0,.5,-6];
export const TARGET_POSITIONS = [[0,9],[9,16],[17,6],[-18,4],[24,-12],[0,-24]];
export const REST_HOUSE = {position:[-21,.018,-8],scale:.58,sideExit:[18,25]};
export const BRIDGE = {position:[20,.025,-20],scale:.7,yaw:Math.PI/2};
export const COVER = [[8,4,0],[-3,17,0],[12,-5,Math.PI/2],[27,24,0],[3,-18,0],[-35,-16,Math.PI/2]];
export const QUARRY_ROCKS = [[20,12,.60,0],[27,18,.62,1],[19,24,.60,2],[29,7,.52,3],[13,26,.52,1]];
export const OUTSIDE_TREES = [[-39,-27],[-39,-13],[-39,6],[-39,23],[-27,40],[-12,40],[5,40],[22,40],[39,28],[39,12],[39,-4],[39,-25],[28,-40],[10,-40],[-9,-40],[-28,-40],[5,0],[7,-10],[-5,-12],[-29,-13],[13,13],[27,-7],[-1,25]];
// Connected loop with room to enter and leave the central combat yard.
export const LOOP_ROUTE = [[-34,-25],[-34,25],[-31,31],[-25,34],[25,34],[31,31],[34,25],[34,-25],[31,-31],[25,-34],[-25,-34],[-31,-31],[-34,-25]];

export const ROADS=[{p:[[-34,-20],[34,-20]],w:4.8},{p:[[0,-34],[0,27],[7,34]],w:6},{p:[[0,-14],[-21,-14],[-21,-8]],w:4.2},{p:[[-6.45,4.5],[0,4.5],[12,4.5],[25,13],[34,13]],w:4}];

export function groundTexture(THREE,base) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1536;
  const c=canvas.getContext('2d');c.drawImage(base,0,0,1536,1536);
  c.globalAlpha=1;c.translate(768,768);c.scale(1536/100,1536/100);
  // Canvas V runs in the opposite direction after the ground plane rotation.
  c.scale(1,-1);
  const line=(points,width,color)=>{c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();points.forEach(([x,z],i)=>i?c.lineTo(x,z):c.moveTo(x,z));c.stroke();};
  const loop=(width,color)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.roundRect(-34,-34,68,68,9);c.stroke();};
  // Roads remain level; the surrounding native terrain carries the elevation.
  loop(8.3,'#d9c6a0');loop(6.6,'#555a53');
  for(const road of ROADS){line(road.p,road.w+1.1,'#d6bd91');line(road.p,road.w,'#66685a');}
  // The bridge is a narrow service crossing beside a dry stone channel.
  c.fillStyle='#927453';c.fillRect(17,-25,6,10);line([[14,-20],[26,-20]],2.65,'#c9b28c');
  c.setLineDash([1.2,1.7]);loop(.10,'#dccb99');c.setLineDash([]);
  // Paved combat yard, parking bays and directional chevrons.
  c.fillStyle='#b6a583';c.beginPath();c.roundRect(-3.6,-9,15.5,30,1.8);c.fill();
  c.strokeStyle='#e3d3ab';c.lineWidth=.10;
  for(const x of [-2.6,2.6]){c.beginPath();c.moveTo(x,-8.7);c.lineTo(x,-3.3);c.stroke();}
  for(const z of [0,5,10,15])line([[-1.2,z],[1.2,z]],.07,'#ddc8a0');
  for(const [x,z,angle] of [[0,24,0],[0,-27,0],[-29,-20,Math.PI/2],[30,13,Math.PI/2]]){
    c.save();c.translate(x,z);c.rotate(angle);line([[-.48,-.5],[0,.1],[.48,-.5]],.15,'#e9d6a3');c.restore();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
