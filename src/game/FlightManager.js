import * as CANNON from 'cannon-es';
import { CONSTANTS } from '../utils/Constants.js';

export class FlightManager {
    constructor(game) {
        this.game = game;
    }

    applyAeroForces(chassisBody) {
        if (!chassisBody) return;

        const velocity = chassisBody.velocity;
        const speed = velocity.length();
        if (speed < 0.1) return;

        // 1. Drag (Opposite to velocity)
        const dragMagnitude = speed * speed * CONSTANTS.AERO.DRAG_COEFFICIENT;
        const dragForce = velocity.clone().negate().unit().scale(dragMagnitude);
        chassisBody.applyForce(dragForce, new CANNON.Vec3(0, 0, 0));

        // 2. Lift (Vertical, based on forward speed and pitch)
        // Simple lift formula: Lift = 0.5 * rho * v^2 * S * Cl
        // We'll simplify: magnitude proportional to speed squared

        // Get forward vector
        const forward = new CANNON.Vec3(1, 0, 0);
        chassisBody.quaternion.vmult(forward, forward);

        // Project velocity onto forward vector to get "airspeed"
        const airSpeed = velocity.dot(forward);

        if (airSpeed > 5) { // Only lift if moving forward fast enough
            const liftMagnitude = airSpeed * airSpeed * CONSTANTS.AERO.LIFT_COEFFICIENT;

            // Lift direction is "up" relative to the vehicle's wing surface
            const liftDir = new CANNON.Vec3(0, 1, 0);
            chassisBody.quaternion.vmult(liftDir, liftDir);

            const liftForce = liftDir.scale(liftMagnitude);
            chassisBody.applyLocalForce(liftForce, new CANNON.Vec3(0, 0, 0));
        }

        // 3. Thrust (In Flight Mode)
        const keys = this.game.inputManager.keys;
        if (keys['ShiftLeft'] || keys['ShiftRight']) {
            const thrustForce = forward.scale(CONSTANTS.AERO.THRUST_FORCE);
            chassisBody.applyForce(thrustForce, new CANNON.Vec3(0, 0, 0));
        }

        // 4. Pitch/Yaw Control (In Air)
        const torque = new CANNON.Vec3(0, 0, 0);
        const sensitivity = 2000;

        if (keys.ArrowUp) torque.z -= sensitivity; // Pitch Down
        if (keys.ArrowDown) torque.z += sensitivity; // Pitch Up
        if (keys.ArrowLeft) torque.y += sensitivity; // Yaw Left
        if (keys.ArrowRight) torque.y -= sensitivity; // Yaw Right

        chassisBody.applyTorque(torque);

        // 5. Autostabilization (Slowly return to level if no input)
        if (torque.length() === 0) {
            const up = new CANNON.Vec3(0, 1, 0);
            const currentUp = new CANNON.Vec3(0, 1, 0);
            chassisBody.quaternion.vmult(currentUp, currentUp);

            const stabilizationTorque = currentUp.cross(up).scale(CONSTANTS.AERO.STABILIZATION_FORCE);
            chassisBody.applyTorque(stabilizationTorque);
        }
    }
}
