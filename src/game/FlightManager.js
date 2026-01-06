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
            let yawSensitivity = onGround ? CONSTANTS.AERO.GROUND_YAW_SENSITIVITY : CONSTANTS.AERO.YAW_SENSITIVITY;

            // Ground restriction: Scale yaw force by speed to prevent zero-speed rotation
            if (onGround) {
                const minSteeringSpeed = 1.0; // m/s
                const steeringScale = Math.min(1.0, speed / 5.0);
                yawSensitivity *= steeringScale;
            }

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

        // 4. Rotation (Quaternion "Shortest Path" Control)
        // Target Orientation
        const yaw = this.game.inputManager.cameraYawAngle || 0;
        const pitch = this.game.inputManager.cameraPitchAngle || 0;

        // Construct Target Quaternion (order: Yaw around Y, then Pitch around Local X)
        // NOTE: In our system, Pitch is around Z or X depending on model. 
        // Based on InputManager, Pitch is clamped. 
        // Let's assume standard aircraft: Pitch = Tilt nose up/down (Local Z in our code usually? No, let's check).
        // FixedWing.js: chassisShape is Box(4, 0.5, 1.2). X is Forward (implied by velocity set to 1,0,0).
        // If X is Forward, Y is Up, Z is Right (or Left).
        // Pitching up means rotating around Z axis.
        // Yawing means rotating around Y axis.

        const targetQuat = new CANNON.Quaternion();
        targetQuat.setFromEuler(0, yaw, 0, 'YXZ'); // Yaw first

        // Add Pitch
        const pitchQuat = new CANNON.Quaternion();
        pitchQuat.setFromEuler(0, 0, pitch); // Pitch around Z
        targetQuat.mult(pitchQuat, targetQuat);

        // Current Orientation
        const currentQuat = chassisBody.quaternion;

        // Error Quaternion (Rotation needed to go from Current to Target)
        // error = current^-1 * target
        const errorQuat = currentQuat.inverse().mult(targetQuat);

        // Establish "Shortest Path"
        // If w < 0, we are taking the long way around. Invert to take short way.
        if (errorQuat.w < 0) {
            errorQuat.x *= -1;
            errorQuat.y *= -1;
            errorQuat.z *= -1;
            errorQuat.w *= -1;
        }

        // Convert Error Quaternion to Torque (Proportional Control)
        // Small angle approximation: sin(theta/2) ~= theta/2. x,y,z components are proprotional to axis * angle.
        const kp = CONSTANTS.HOVER.STABILIZATION_P || 2000; // Stiffness
        const kd = CONSTANTS.HOVER.STABILIZATION_D || 200;  // Damping

        // Torque in Local Body Space (because errorQuat is in local space relative to current)
        // Wait: current^-1 * target gives rotation in local frame?
        // Let R_c be current, R_t be target. R_c * R_error = R_t.
        // Yes, R_error is applied locally to R_c to get R_t.

        const torqueLocal = new CANNON.Vec3(
            errorQuat.x * kp,
            errorQuat.y * kp,
            errorQuat.z * kp
        );

        // Add Damping (Local Angular Velocity)
        const localAngVel = new CANNON.Vec3();
        currentQuat.inverse().vmult(chassisBody.angularVelocity, localAngVel);

        torqueLocal.x -= localAngVel.x * kd;
        torqueLocal.y -= localAngVel.y * kd;
        torqueLocal.z -= localAngVel.z * kd;

        // Manual Yaw Override (Q/E) - Add to target or Add torque?
        // If we want manual override to shift the "Target Yaw", we should update InputManager yaw.
        // But InputManager handles keys.
        // Let's just let the InputManager handle Q/E to update cameraYawAngle.
        // Check InputManager keys: It updates cameraYawAngle?
        // No, current InputManager only updates cameraYawAngle via ONMOUSEMOVE.
        // We should probably add Q/E support to InputManager or handle it here by modifying the "Yaw" variable before constructing quat.

        const yawSpeed = 0.02;
        if (keys.q || keys.Q) this.game.inputManager.cameraYawAngle += yawSpeed;
        if (keys.e || keys.E) this.game.inputManager.cameraYawAngle -= yawSpeed;

        // Apply Torque
        // torqueLocal is in Local space. Convert to World for applyTorque?
        // chassisBody.applyTorque takes World Torque.

        // Ground Restriction for Hover Mode:
        // We also want to prevent rotating in place on the ground in hover mode unless there's some lift/movement
        let wheelsOnGround = 0;
        const vhc = this.game.vehicle;
        if (vhc.vehicle) {
            vhc.vehicle.wheelInfos.forEach((wheel) => {
                if (wheel.raycastResult.body) wheelsOnGround++;
            });
        }
        const onGnd = wheelsOnGround > 0;
        const curSpeed = chassisBody.velocity.length();

        if (onGnd) {
            const steeringScale = Math.min(1.0, curSpeed / 2.0); // Allow more authority in hover at low speed than normal
            torqueLocal.x *= steeringScale;
            torqueLocal.y *= steeringScale;
            torqueLocal.z *= steeringScale;
        }

        const torqueWorld = new CANNON.Vec3();
        currentQuat.vmult(torqueLocal, torqueWorld);

        chassisBody.applyTorque(torqueWorld);

        // Apply Forces (WASD + Lift) logic remains same but remove old torque parts
        if (keys.w || keys.W) force.addScaledVector(config.FORCE, localForward, force);
        if (keys.s || keys.S) force.addScaledVector(-config.FORCE, localForward, force);
        if (keys.a || keys.A) force.addScaledVector(config.FORCE, localRight, force);
        if (keys.d || keys.D) force.addScaledVector(-config.FORCE, localRight, force);

        // Vertical
        if (keys.Num8 || keys.ArrowUp) force.y += config.FORCE * 1.5;
        if (keys.Num2 || keys.ArrowDown) force.y -= config.FORCE * 1.5;

        chassisBody.applyForce(force, new CANNON.Vec3(0, 0, 0));

        // Heavy linear damping for hover stability
        chassisBody.velocity.scale(config.DAMPING, chassisBody.velocity);
    }
}
