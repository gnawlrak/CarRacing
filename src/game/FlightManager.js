import * as CANNON from 'cannon-es';
import { CONSTANTS } from '../utils/Constants.js';

export class FlightManager {
    constructor(game) {
        this.game = game;
        this.gPressed = false;
        this.kPressed = false;
    }

    applyAeroForces(chassisBody) {
        if (!chassisBody) return;

        const vehicle = this.game.vehicle;
        if (vehicle.type === 'FixedWing' && vehicle.hoverMode) {
            this.applyHoverForces(chassisBody);
            return;
        }

        const velocity = chassisBody.velocity;
        const speed = velocity.length();

        const isFixedWing = this.game.vehicle.type === 'FixedWing';
        const keys = this.game.inputManager.keys;

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

            // Gear toggle
            if ((keys.g || keys.G) && !this.gPressed) {
                vehicle.gearDown = !vehicle.gearDown;
                this.game.uiManager.showFlightNotification(vehicle.gearDown ? "GEAR DOWN" : "GEAR UP");
                vehicle.updateSystemsVisuals();
                this.gPressed = true;
            } else if (!(keys.g || keys.G)) {
                this.gPressed = false;
            }

            // Airbrake toggle (Changed from H to K)
            if ((keys.k || keys.K) && !this.kPressed) {
                vehicle.airbrakeActive = !vehicle.airbrakeActive;
                this.game.uiManager.showFlightNotification(vehicle.airbrakeActive ? "AIRBRAKE ON" : "AIRBRAKE OFF");
                vehicle.updateSystemsVisuals();
                this.kPressed = true;
            } else if (!(keys.k || keys.K)) {
                this.kPressed = false;
            }

            // Brakes (Hold B)
            vehicle.braking = (keys.b || keys.B);

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
            let reversing = false;

            if (keys.ArrowUp) {
                if (this.game.vehicle.throttle >= 1.0) {
                    this.game.vehicle.afterburner = true;
                } else {
                    this.game.vehicle.throttle = Math.min(1.0, this.game.vehicle.throttle + CONSTANTS.AERO.THROTTLE_STEP);
                    this.game.vehicle.afterburner = false;
                }
            } else if (keys.ArrowDown) {
                if (this.game.vehicle.throttle > 0) {
                    this.game.vehicle.throttle = Math.max(0, this.game.vehicle.throttle - CONSTANTS.AERO.THROTTLE_STEP);
                    this.game.vehicle.afterburner = false;
                } else if (onGround) {
                    reversing = true;
                }
            } else {
                this.game.vehicle.afterburner = false;
            }

            if (reversing) {
                this.game.uiManager.showFlightNotification("REVERSE THRUST", 100);
            }

            let thrustMultiplier = 1.0;
            if (altitude > CONSTANTS.AERO.MAX_ALTITUDE) {
                thrustMultiplier = Math.max(0, 1.0 - (altitude - CONSTANTS.AERO.MAX_ALTITUDE) / 500);
            }

            const milPowerRatio = 0.85; // Increased for better non-AB takeoff
            const abMultiplier = 2.0;
            const currentPower = this.game.vehicle.afterburner ? abMultiplier : (this.game.vehicle.throttle * milPowerRatio);

            let thrustMagnitude = currentPower * CONSTANTS.AERO.MAX_THRUST * thrustMultiplier;
            if (reversing) {
                thrustMagnitude = -CONSTANTS.AERO.REVERSE_THRUST_MAGNITUDE;
            }

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

            // Yaw logic (Dual-key support and Ground/Air sensitivity split)
            const yawSensitivity = onGround ? CONSTANTS.AERO.GROUND_YAW_SENSITIVITY : CONSTANTS.AERO.YAW_SENSITIVITY;
            if (keys.q || keys.Q || keys.ArrowLeft) torque.y += yawSensitivity;
            if (keys.e || keys.E || keys.ArrowRight) torque.y -= yawSensitivity;

            // --- Ground Control Restriction ---
            // If on ground, disable roll torque but allow pitch to enable takeoff rotation
            if (onGround) {
                torque.x = 0;
                // Leave torque.z (pitch) enabled for rotation
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

    applyHoverForces(chassisBody) {
        const keys = this.game.inputManager.keys;
        const config = CONSTANTS.HOVER;

        // 1. Counter Gravity
        const gravityForce = new CANNON.Vec3(0, -CONSTANTS.GRAVITY * chassisBody.mass, 0);
        chassisBody.applyForce(gravityForce, new CANNON.Vec3(0, 0, 0));

        // 2. Translational Forces (WASD)
        const force = new CANNON.Vec3(0, 0, 0);
        const torque = new CANNON.Vec3(0, 0, 0);

        const localForward = new CANNON.Vec3(1, 0, 0);
        const localRight = new CANNON.Vec3(0, 0, 1);
        const localUp = new CANNON.Vec3(0, 1, 0);
        chassisBody.quaternion.vmult(localForward, localForward);
        chassisBody.quaternion.vmult(localRight, localRight);
        chassisBody.quaternion.vmult(localUp, localUp);

        if (keys.w || keys.W) {
            force.addScaledVector(config.FORCE, localForward, force);
            torque.z += CONSTANTS.AERO.PITCH_SENSITIVITY * 0.1; // Tilt down
        }
        if (keys.s || keys.S) {
            force.addScaledVector(-config.FORCE, localForward, force);
            torque.z -= CONSTANTS.AERO.PITCH_SENSITIVITY * 0.1; // Tilt up
        }
        if (keys.a || keys.A) {
            force.addScaledVector(config.FORCE, localRight, force);
            torque.x -= CONSTANTS.AERO.ROLL_SENSITIVITY * 0.1; // Roll left
        }
        if (keys.d || keys.D) {
            force.addScaledVector(-config.FORCE, localRight, force);
            torque.x += CONSTANTS.AERO.ROLL_SENSITIVITY * 0.1; // Roll right
        }

        // 3. Vertical (Numpad 8/2 or Arrows Up/Down)
        if (keys.Num8 || keys.ArrowUp) force.y += config.FORCE * 1.5;
        if (keys.Num2 || keys.ArrowDown) force.y -= config.FORCE * 1.5;

        // 4. Rotation (QE for Yaw)
        const yawSens = CONSTANTS.HOVER.YAW_SENSITIVITY || 8000;
        let qeWorldYaw = 0;
        if (keys.q || keys.Q) qeWorldYaw += yawSens;
        if (keys.e || keys.E) qeWorldYaw -= yawSens;

        // Mouse influence (Simulated as stick input)
        const pitchLimit = Math.PI / 4;
        const currentPitch = Math.asin(localForward.y);
        // We can just apply torque based on Mouse movement if available, 
        // but here we use the cameraPitchAngle as a target or just stick to keys.
        // Let's use cameraPitchAngle for nose pointing as user requested.
        const targetPitch = this.game.inputManager.cameraPitchAngle || 0;
        const pitchError = targetPitch - currentPitch;
        torque.z += pitchError * CONSTANTS.AERO.PITCH_SENSITIVITY * 0.5;

        // 5. Auto-Stabilization (Leveling)
        if (!keys.w && !keys.s && !keys.a && !keys.d) {
            // Level Roll
            const rollError = localRight.y;
            torque.x -= rollError * CONSTANTS.AERO.ROLL_STABILIZATION_FORCE * 0.5;

            // Level Pitch if no vertical movement? No, follow mouse.
        }

        // Apply
        chassisBody.applyForce(force, new CANNON.Vec3(0, 0, 0));
        const worldTorque = new CANNON.Vec3();
        chassisBody.quaternion.vmult(torque, worldTorque);

        // Add QE rotation in world space to ensure pure yaw
        worldTorque.y += qeWorldYaw;

        chassisBody.applyTorque(worldTorque);

        // Apply heavy damping manually to dampen noise
        chassisBody.velocity.scale(config.DAMPING, chassisBody.velocity);
        chassisBody.angularVelocity.scale(config.DAMPING, chassisBody.angularVelocity);
    }
}
