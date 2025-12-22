import * as CANNON from 'cannon-es';
import { CONSTANTS } from '../utils/Constants.js';

export class FlightManager {
    constructor(game) {
        this.game = game;
        this.gPressed = false;
        this.hPressed = false;
    }

    applyAeroForces(chassisBody) {
        if (!chassisBody) return;

        const velocity = chassisBody.velocity;
        const speed = velocity.length();

        const isFixedWing = this.game.vehicle.type === 'FixedWing';
        const keys = this.game.inputManager.keys;
        const vehicle = this.game.vehicle;

        let onGround = false;
        if (isFixedWing && vehicle.vehicle) {
            let wheelsOnGround = 0;
            vehicle.vehicle.wheelInfos.forEach((wheel) => {
                if (wheel.raycastResult.body) wheelsOnGround++;
            });
            onGround = wheelsOnGround > 0;
        }

        if (isFixedWing) {
            // --- Realistic Aerodynamics ---
            const invQuaternion = chassisBody.quaternion.inverse();
            const localVelocity = new CANNON.Vec3();
            invQuaternion.vmult(velocity, localVelocity);

            const vx = localVelocity.x;
            const vy = localVelocity.y;
            const vz = localVelocity.z;

            const alpha = Math.atan2(-vy, Math.abs(vx) + 0.001);
            const beta = Math.atan2(vz, Math.abs(vx) + 0.001);

            const CL = CONSTANTS.AERO.CL_SLOPE * alpha;
            const CD = CONSTANTS.AERO.CD0 + CONSTANTS.AERO.K * CL * CL;
            const CC = -CONSTANTS.AERO.CC_SLOPE * beta;

            const dynamicPressure = 0.5 * CONSTANTS.AERO.AIR_DENSITY * speed * speed;
            const liftMag = dynamicPressure * CL * CONSTANTS.AERO.WING_AREA;
            const dragMag = dynamicPressure * CD * CONSTANTS.AERO.WING_AREA;
            const sideMag = dynamicPressure * CC * CONSTANTS.AERO.SIDE_AREA;

            // Lift acts along local Y
            const liftForce = new CANNON.Vec3(0, liftMag, 0);
            chassisBody.applyLocalForce(liftForce, new CANNON.Vec3(0, 0, 0));

            // Drag opposes world velocity
            const worldDragDir = speed > 0.1 ? velocity.unit().scale(-1) : new CANNON.Vec3(0, 0, 0);
            const worldDragForce = worldDragDir.scale(dragMag);
            chassisBody.applyForce(worldDragForce, new CANNON.Vec3(0, 0, 0));

            // Side force acts along local Z
            const sideForce = new CANNON.Vec3(0, 0, sideMag);
            chassisBody.applyLocalForce(sideForce, new CANNON.Vec3(0, 0, 0));

            // --- System Toggles (G: Gear, H: Airbrake, B: Brake) ---
            const vehicle = this.game.vehicle;

            // Gear toggle
            if ((keys.g || keys.G) && !this.gPressed) {
                vehicle.gearDown = !vehicle.gearDown;
                this.game.uiManager.showFlightNotification(vehicle.gearDown ? "GEAR DOWN" : "GEAR UP");
                vehicle.updateSystemsVisuals();
                this.gPressed = true;
            } else if (!(keys.g || keys.G)) {
                this.gPressed = false;
            }

            // Airbrake toggle
            if ((keys.h || keys.H) && !this.hPressed) {
                vehicle.airbrakeActive = !vehicle.airbrakeActive;
                this.game.uiManager.showFlightNotification(vehicle.airbrakeActive ? "AIRBRAKE ON" : "AIRBRAKE OFF");
                vehicle.updateSystemsVisuals();
                this.hPressed = true;
            } else if (!(keys.h || keys.H)) {
                this.hPressed = false;
            }

            // Brakes (Car style: Space/B/S on ground)
            vehicle.braking = (keys.b || keys.B || keys.Space || (onGround && (keys.s || keys.S)));
            if (vehicle.braking) {
                this.game.uiManager.showFlightNotification("BRAKING", 100);
            }

            // --- Extra Drag ---
            let extraDragCoeff = 0;
            if (vehicle.gearDown) extraDragCoeff += CONSTANTS.AERO.GEAR_DRAG;
            if (vehicle.airbrakeActive) extraDragCoeff += CONSTANTS.AERO.AIRBRAKE_DRAG;

            if (extraDragCoeff > 0 && speed > 0.1) {
                const extraDragMag = dynamicPressure * extraDragCoeff * CONSTANTS.AERO.WING_AREA;
                const extraDragForce = worldDragDir.scale(extraDragMag); // worldDragDir is -unit(vel)
                chassisBody.applyForce(extraDragForce, new CANNON.Vec3(0, 0, 0));
            }

            // --- Turbojet & Performance Limits ---
            const altitude = chassisBody.position.y;
            if (keys.ArrowUp) {
                if (this.game.vehicle.throttle >= 1.0) {
                    this.game.vehicle.afterburner = true;
                } else {
                    this.game.vehicle.throttle = Math.min(1.0, this.game.vehicle.throttle + CONSTANTS.AERO.THROTTLE_STEP);
                    this.game.vehicle.afterburner = false;
                }
            } else if (keys.ArrowDown) {
                this.game.vehicle.throttle = Math.max(0, this.game.vehicle.throttle - CONSTANTS.AERO.THROTTLE_STEP);
                this.game.vehicle.afterburner = false;
            } else {
                this.game.vehicle.afterburner = false;
            }

            if (this.game.vehicle.flameMesh) {
                this.game.vehicle.flameMesh.visible = this.game.vehicle.afterburner;
            }

            let thrustMultiplier = 1.0;
            if (altitude > CONSTANTS.AERO.MAX_ALTITUDE) {
                thrustMultiplier = Math.max(0, 1.0 - (altitude - CONSTANTS.AERO.MAX_ALTITUDE) / 500);
            }

            const milPowerRatio = 0.85; // Increased for better non-AB takeoff
            const abMultiplier = 2.0;
            const currentPower = this.game.vehicle.afterburner ? abMultiplier : (this.game.vehicle.throttle * milPowerRatio);
            const thrustMagnitude = currentPower * CONSTANTS.AERO.MAX_THRUST * thrustMultiplier;
            const thrustForce = new CANNON.Vec3(thrustMagnitude, 0, 0);

            if (speed > CONSTANTS.AERO.MAX_SPEED_MS && vx > 0) {
                thrustForce.scale(0.1);
            }
            chassisBody.applyLocalForce(thrustForce, new CANNON.Vec3(0, 0, 0));

        } else {
            // --- Legacy Car Flight ---
            const dragMagnitude = speed * speed * CONSTANTS.AERO.DRAG_COEFFICIENT;
            const dragForce = velocity.clone().negate().unit().scale(dragMagnitude);
            chassisBody.applyForce(dragForce, new CANNON.Vec3(0, 0, 0));

            const forward = new CANNON.Vec3(1, 0, 0);
            chassisBody.quaternion.vmult(forward, forward);
            const airSpeed = velocity.dot(forward);

            if (airSpeed > 5) {
                const liftMagnitude = airSpeed * airSpeed * CONSTANTS.AERO.LIFT_COEFFICIENT;
                const liftDir = new CANNON.Vec3(0, 1, 0);
                chassisBody.quaternion.vmult(liftDir, liftDir);
                const liftForce = liftDir.scale(liftMagnitude);
                chassisBody.applyLocalForce(liftForce, new CANNON.Vec3(0, 0, 0));
            }

            if (keys['ShiftLeft'] || keys['ShiftRight']) {
                const thrustForce = forward.scale(CONSTANTS.AERO.THRUST_FORCE);
                chassisBody.applyForce(thrustForce, new CANNON.Vec3(0, 0, 0));
            }
        }

        // --- Torque Controls & Stabilization ---
        const torque = new CANNON.Vec3(0, 0, 0);

        if (isFixedWing) {
            // Inputs
            if (keys.w || keys.W) torque.z += CONSTANTS.AERO.PITCH_SENSITIVITY;
            if (keys.s || keys.S) torque.z -= CONSTANTS.AERO.PITCH_SENSITIVITY * 0.6; // Reduced -G sensitivity
            if (keys.a || keys.A) torque.x -= CONSTANTS.AERO.ROLL_SENSITIVITY;
            if (keys.d || keys.D) torque.x += CONSTANTS.AERO.ROLL_SENSITIVITY;
            if (keys.q || keys.Q) torque.y += CONSTANTS.AERO.YAW_SENSITIVITY;
            if (keys.e || keys.E) torque.y -= CONSTANTS.AERO.YAW_SENSITIVITY;

            // --- Ground Control Restriction ---
            // If on ground, disable roll and pitch torques to prevent tipping/flipping
            if (onGround) {
                torque.x = 0;
                torque.z = 0;
            }

            const worldUp = new CANNON.Vec3(0, 1, 0);
            const localForward = new CANNON.Vec3(1, 0, 0);
            const localRight = new CANNON.Vec3(0, 0, 1);
            const localUp = new CANNON.Vec3(0, 1, 0);
            chassisBody.quaternion.vmult(localForward, localForward);
            chassisBody.quaternion.vmult(localRight, localRight);
            chassisBody.quaternion.vmult(localUp, localUp);

            // Roll Centering
            if (!keys.a && !keys.A && !keys.d && !keys.D) {
                const rollError = localRight.dot(worldUp);
                const isDown = localUp.dot(worldUp) < 0;
                let rollStabilization = rollError * CONSTANTS.AERO.ROLL_STABILIZATION_FORCE;
                if (isDown) rollStabilization += Math.sign(rollError || 1) * CONSTANTS.AERO.ROLL_STABILIZATION_FORCE;
                torque.x += rollStabilization;
            }

            // Pitch Centering
            if (!keys.w && !keys.W && !keys.s && !keys.S) {
                const pitchError = localForward.dot(worldUp);
                torque.z += -pitchError * CONSTANTS.AERO.PITCH_STABILIZATION_FORCE;
            }

            // Damping
            const localAngularVelocity = new CANNON.Vec3();
            chassisBody.quaternion.inverse().vmult(chassisBody.angularVelocity, localAngularVelocity);
            torque.x -= localAngularVelocity.x * CONSTANTS.AERO.AERO_DAMPING * 1000;
            torque.y -= localAngularVelocity.y * CONSTANTS.AERO.AERO_DAMPING * 1000;
            torque.z -= localAngularVelocity.z * CONSTANTS.AERO.AERO_DAMPING * 1000;

        } else {
            // Car stabilization
            if (keys.ArrowUp) torque.z -= 2000;
            if (keys.ArrowDown) torque.z += 2000;
            if (keys.ArrowLeft) torque.y += 2000;
            if (keys.ArrowRight) torque.y -= 2000;

            if (torque.length() === 0) {
                const up = new CANNON.Vec3(0, 1, 0);
                const currUp = new CANNON.Vec3(0, 1, 0);
                chassisBody.quaternion.vmult(currUp, currUp);
                const stabTorque = currUp.cross(up).scale(CONSTANTS.AERO.STABILIZATION_FORCE);
                chassisBody.applyTorque(stabTorque);
            }
        }

        const finalWorldTorque = new CANNON.Vec3();
        chassisBody.quaternion.vmult(torque, finalWorldTorque);
        chassisBody.applyTorque(finalWorldTorque);
    }
}
