// Unchanged createSphereBody excerpt from hajwala/js/Physics.js (4c9e421).
import {rigidBody,sphere,MotionType,MotionQuality} from 'crashcat';
const DEFAULT_MAX_ANGULAR_VELOCITY = 0.25 * Math.PI * 60.0;

export function createSphereBody( world, spawnPos, radius = 0.5 ) {

	// Vehicle.js drives this body by directly setting angular velocity
	// scaled by radiusRatio = 0.5/radius (so a smaller sphere spins
	// proportionally faster for the same rolling linear speed — see
	// Vehicle.js's own comment on radiusRatio). The engine's default
	// maxAngularVelocity clamp is a flat, radius-independent constant
	// though, so at AR's shrunk radius that same clamp caps the
	// achievable ROLLING SPEED (angularVelocity * radius) far below
	// what NORMAL mode reaches at radius 0.5 — read as the car being
	// unable to get up to speed / stuck. Scaling the clamp by the same
	// 0.5/radius ratio keeps the achievable rolling speed ceiling
	// constant across scales; at radius=0.5 (every NORMAL-mode caller)
	// this multiplies by exactly 1, so nothing changes there.
	const maxAngularVelocity = DEFAULT_MAX_ANGULAR_VELOCITY * ( 0.5 / Math.max( radius, 0.001 ) );

	const body = rigidBody.create( world, {
		shape: sphere.create( { radius } ),
		motionType: MotionType.DYNAMIC,
		objectLayer: world._OL_MOVING,
		position: spawnPos || [ 3.5, 0.5, 5 ],
		mass: Math.max( 1000.0 * Math.pow( radius / 0.5, 3 ), 2.0 ), // volume-proportional, so tiny AR-scaled spheres aren't absurdly heavy for their size — floored so it never gets so light that collision/damping forces (tuned for realistic masses) start feeling erratic/jittery
		friction: 5.0,
		restitution: 0.1,
		linearDamping: 0.1,
		angularDamping: 4.0,
		gravityFactor: 1.5,
		motionQuality: MotionQuality.LINEAR_CAST,
		maxAngularVelocity,
	} );

	return body;

}

