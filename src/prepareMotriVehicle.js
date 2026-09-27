import * as THREE from 'three';
import { buildShasVehicleBody } from './ShasVehicleBody.js';
import { buildDatsunVehicleBody } from './DatsunVehicleBody.js';
import { addCombatKit } from './CombatKit.js';

export const VEHICLES = [
  { id:'h9', label:'هافال H9', color:'#63666b', weapon:'machinegun' },
  { id:'shas', label:'شاص', color:'#c9b58d', weapon:'cannon' },
  { id:'datsun', label:'ددسن', color:'#eeeadd', weapon:'rockets' }
];
const yaw = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
const h9Only = /^(bodyPainted|H9_Body_|H9_HavalBadge|H9_GWMBadge)/;
function findPrefix(root,prefix) { let found;root.traverse(o=>{if(!found&&o.name.startsWith(prefix))found=o;});return found; }

// Bake the source +X frame into geometry. Animated pivots remain identity
// rotations in Hajwala's +Z frame, including every wheel's axle (+X).
function flatten(root, parent, transform, prefix) {
  root.updateMatrixWorld(true);
  let index = 0;
  root.traverseVisible(node => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(transform, node.matrixWorld));
    const mesh = new THREE.Mesh(geometry, node.material);
    mesh.name = prefix + '_' + index++;
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
  });
}

export function prepareMotriVehicle(source, id = 'h9', {combat = false} = {}) {
  const spec = VEHICLES.find(v => v.id === id);
  if (!spec) throw new Error('Unknown vehicle: ' + id);
  const copy = source.clone(true);
  const chassis = findPrefix(copy,'chassis');
  const template = findPrefix(copy,'wheelContainer');
  if (!chassis || !template) throw new Error('Expected current Motri default.glb rig');
  chassis.removeFromParent(); chassis.position.set(0,0,0);
  chassis.quaternion.identity(); chassis.scale.set(1,1,1);
  // Runtime-only energy effects and turn-signal surfaces are hidden at rest.
  for (const child of [...chassis.children]) {
    if (/^(cell[123]|energy|blinker|stopLights)/.test(child.name)) child.removeFromParent();
    else if (id !== 'h9' && h9Only.test(child.name)) child.removeFromParent();
  }
  if (id !== 'h9') {
    const paint = new THREE.MeshStandardMaterial({color:spec.color, roughness:.83});
    const details = new THREE.MeshStandardMaterial({vertexColors:true, roughness:.8});
    paint.name = id + '_paint'; details.name = id + '_details';
    chassis.add((id === 'shas' ? buildShasVehicleBody : buildDatsunVehicleBody)(paint,details));
  }
  const root = new THREE.Group();
  root.name = 'Motri_' + id + (combat ? '_combat' : '_base');
  root.userData = {forward:'+Z', up:'+Y', sourceForward:'+X',
    sourceRevision:'ee7e01dfe848f1bc7e857d51bcee2e687bee21eb',
    bodyStyle:id, defaultHajwalaScale:.5, suspensionSink:.05,
    cosmeticCombatKit:combat, wheelCount:4};
  const body = new THREE.Group(); body.name = 'body';
  // Compact parked suspension height; source geometry and wheel size unchanged.
  body.position.y = 1.0;
  root.add(body);
  flatten(chassis, body, yaw, 'ChassisMesh');
  const cylinder = findPrefix(template,'wheelCylinder');
  if (!cylinder) throw new Error('Missing separate tire assembly');
  const tire = cylinder.clone(true); tire.removeFromParent();
  tire.position.set(0,0,0); tire.quaternion.identity(); tire.scale.set(1,1,1);
  const bounds = new THREE.Box3().setFromObject(tire);
  const radius = (bounds.max.y - bounds.min.y)/2;
  const centerY = (bounds.max.y + bounds.min.y)/2;
  root.userData.wheelRadius = radius;
  for (const axle of ['front','back']) for (const side of ['left','right']) {
    const group = new THREE.Group(); group.name = `wheel-${axle}-${side}`;
    group.position.set(side === 'left' ? -.75 : .75, radius, axle === 'front' ? .9 : -.9);
    const sideRotation = new THREE.Matrix4().makeRotationY(side === 'left' ? Math.PI : 0);
    const transform = yaw.clone().multiply(sideRotation).multiply(new THREE.Matrix4().makeTranslation(0,-centerY,0));
    flatten(tire, group, transform, 'TireMesh');
    root.add(group);
    // The arch guard belongs to the body, never the animated tire group.
    const guard = findPrefix(template,'wheelGuard')?.clone(true);
    if (guard) {
      guard.removeFromParent(); guard.updateMatrixWorld(true);
      const location = new THREE.Matrix4().makeTranslation(group.position.x, radius-body.position.y,group.position.z);
      flatten(guard,body,location.multiply(yaw).multiply(sideRotation),'Arch_'+axle+'_'+side);
    }
  }
  const mount = new THREE.Group(); mount.name = 'mount-primary';
  mount.position.set(0,id === 'h9' ? .76 : .49,id === 'h9' ? -.12 : -.86);
  body.add(mount);
  if (combat) addCombatKit(root, spec.weapon);
  root.updateMatrixWorld(true);
  return root;
}

// Use for exported normalized GLBs; do not also apply another 0.5 load scale.
export function createHajwalaModel(scene, scale = .5) {
  const wrapper = new THREE.Group(); wrapper.name='MotriHajwalaWrapper';
  wrapper.userData.suspensionSink=.05;
  wrapper.scale.setScalar(scale); wrapper.add(scene.clone(true));
  return wrapper;
}
