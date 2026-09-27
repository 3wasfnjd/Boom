// Unchanged createPhysicsWorld excerpt from hajwala/js/main.js (4c9e421).
import {createWorldSettings,createWorld,addBroadphaseLayer,addObjectLayer,enableCollision} from 'crashcat';
export function createPhysicsWorld( gravityScale = 1 ) {

	const worldSettings = createWorldSettings();
	worldSettings.gravity = [ 0, - 9.81 * gravityScale, 0 ];

	// crashcat's own distance-based tolerances (speculative-contact
	// radius, allowed penetration slop, sleep-velocity threshold, …)
	// default to values tuned for roughly real-world-sized objects —
	// e.g. a 2cm penetrationSlop/speculativeContactDistance and a
	// 3cm/s sleep threshold. Both AR floating modes call this with
	// gravityScale = arTransform.scale (≈0.016), spawning a car whose
	// own radius shrinks to under a centimeter — smaller than those
	// default tolerances. The result: the car can rest half-buried in
	// the track/floor (penetrationSlop bigger than the whole car) and
	// gets treated as "at rest" and put to sleep almost immediately
	// (its whole achievable speed range sits under the 3cm/s sleep
	// threshold), which is exactly the "floating/sunk, then doesn't
	// move at all" symptom. Scaling every one of these by the same
	// factor keeps them proportional to the (also scaled) car instead
	// of proportional to a real-world car, and is a no-op at
	// gravityScale = 1 (every NORMAL-mode caller), so nothing changes
	// there.
	if ( gravityScale !== 1 ) {

		worldSettings.narrowphase.speculativeContactDistance *= gravityScale;
		worldSettings.narrowphase.manifoldTolerance *= gravityScale;
		worldSettings.contacts.contactPointPreserveLambdaMaxDistSq *= gravityScale * gravityScale;
		worldSettings.solver.penetrationSlop *= gravityScale;
		worldSettings.solver.maxPenetrationDistance *= gravityScale;
		worldSettings.sleeping.pointVelocitySleepThreshold *= gravityScale;

	}

	const BPL_MOVING = addBroadphaseLayer( worldSettings );
	const BPL_STATIC = addBroadphaseLayer( worldSettings );
	const OL_MOVING = addObjectLayer( worldSettings, BPL_MOVING );
	const OL_STATIC = addObjectLayer( worldSettings, BPL_STATIC );

	enableCollision( worldSettings, OL_MOVING, OL_STATIC );
	enableCollision( worldSettings, OL_MOVING, OL_MOVING );

	const world = createWorld( worldSettings );
	world._OL_MOVING = OL_MOVING;
	world._OL_STATIC = OL_STATIC;

	return world;

}

