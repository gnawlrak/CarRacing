import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { SceneManager } from './SceneManager.js';
import { PhysicsWorld } from './PhysicsWorld.js';
import { InputManager } from './InputManager.js';
import { UIManager } from './UIManager.js';
import { NetworkManager } from './NetworkManager.js';
import { Environment } from './Environment.js';
import { Vehicle } from './Vehicle.js';
import { FixedWing } from './FixedWing.js';
import { FlightManager } from './FlightManager.js';
import { CONSTANTS } from '../utils/Constants.js';

export class Game {
    constructor() {
        this.sceneManager = new SceneManager();
        this.physicsWorld = new PhysicsWorld();
        this.inputManager = new InputManager();
        this.uiManager = new UIManager();
        this.networkManager = new NetworkManager(this);
        this.environment = new Environment(this);
        this.vehicle = new Vehicle(this);
        this.flightManager = new FlightManager(this);

        // State
        this.isFirstPersonView = false;
        this.flightMode = false;
        this.currentCameraPosition = new THREE.Vector3();
        this.currentCameraLookAt = new THREE.Vector3();

        // Boosting state
        this.isBoosting = false;
        this.currentMaxSpeed = CONSTANTS.MAX_SPEED;
        this.boostTimer = null;

        // Remote players
        this.otherPlayers = new Map();

        // Bind loop
        this.animate = this.animate.bind(this);

        // Juice
        this.cameraShake = 0;
    }

    get scene() { return this.sceneManager.scene; }
    get camera() { return this.sceneManager.camera; }
    get physicsWorldInstance() { return this.physicsWorld; } // prevent name collision

    init() {
        this.sceneManager.init();
        this.physicsWorld.init();

        // Initialize Vehicle first so camera can track it?
        // Original: init() creates vehicle, then sets up camera relative to it.
        this.vehicle.init();

        // Setup initial camera
        this.currentCameraPosition.copy(this.vehicle.chassisMesh.position).add(CONSTANTS.CAMERA.INITIAL_OFFSET);
        this.currentCameraLookAt.copy(this.vehicle.chassisMesh.position);
        this.camera.position.copy(this.currentCameraPosition);
        this.camera.lookAt(this.currentCameraLookAt);

        this.environment.init();
        this.uiManager.createSpeedometer();
        this.uiManager.createFlightHUD(this);
        this.uiManager.createSettingsMenu((type) => this.switchVehicle(type));
        this.networkManager.init();
        this.uiManager.createReticle();

        // Bind Input Actions
        this.inputManager.onReset = () => this.vehicle.reset();
        this.inputManager.onStraighten = () => this.vehicle.straighten();
        this.inputManager.onCameraToggle = () => {
            this.isFirstPersonView = !this.isFirstPersonView;
        };
        this.inputManager.onFlightToggle = () => {
            this.flightMode = !this.flightMode;
            if (this.flightMode && CONSTANTS.DEBUG) console.log("Flight Mode: ON");
            else if (CONSTANTS.DEBUG) console.log("Flight Mode: OFF");
        };
        this.inputManager.onHoverToggle = () => {
            if (this.vehicle.type === 'FixedWing') {
                this.vehicle.toggleHover();
                this.uiManager.showFlightNotification(this.vehicle.hoverMode ? "HOVER MODE ON" : "HOVER MODE OFF");
            }
        };

        // Start Loop
        this.animate();
    }

    animate() {
        requestAnimationFrame(this.animate);

        this.updatePhysics();
        this.environment.update(); // Update terrain, sky
        this.updateCamera();

        this.uiManager.updateSpeedometer(
            Math.round(this.vehicle.chassisBody.velocity.length() * 3.6),
            this.getLastDriveState(),
            this.isBoosting
        );

        // Handle Weapons
        if ((this.inputManager.isPressed(' ') || this.inputManager.isPressed('Space')) && this.vehicle.fire) {
            this.vehicle.fire();
        }

        // Handle Fire Rate Toggle (V key - debounced)
        if (this.inputManager.isPressed('v') || this.inputManager.isPressed('V')) {
            if (!this._vKeyPressed) {
                if (this.vehicle.setFireRate) {
                    const currentRPM = this.vehicle.cannonRPM;
                    const nextRPM = currentRPM === CONSTANTS.WEAPON.M61.RPM_HIGH ?
                        CONSTANTS.WEAPON.M61.RPM_LOW : CONSTANTS.WEAPON.M61.RPM_HIGH;
                    this.vehicle.setFireRate(nextRPM);
                    this.uiManager.showFlightNotification(`CAN RPM: ${nextRPM}`, 1000);
                }
                this._vKeyPressed = true;
            }
        } else {
            this._vKeyPressed = false;
        }

        this.uiManager.updateHealthBar(this.vehicle.health, this.vehicle.maxHealth);

        // Decay Juice
        if (this.cameraShake > 0) {
            this.cameraShake *= 0.9; // Decay over time
            if (this.cameraShake < 0.001) this.cameraShake = 0;
        }

        this.sceneManager.render();

        // Sync position to server
        this.networkManager.updatePosition(
            this.vehicle.chassisMesh.position,
            this.vehicle.chassisMesh.quaternion
        );
    }

    getLastDriveState() {
        // Simple logic derived from InputManager state
        // Original had "lastDriveState" global that lingered.
        // We can replicate logic here.
        const velocity = this.vehicle.chassisBody.velocity.length();
        if (velocity < 0.5) return 'N';
        if (this.inputManager.isPressed('ArrowUp')) return 'D';
        if (this.inputManager.isPressed('ArrowDown')) return 'R';
        // If nothing pressed, keep previous? We can store it.
        // For now, return 'D' or 'N' logic 
        // Actually, let's store it on class
        if (!this._lastDriveState) this._lastDriveState = 'N';

        if (this.inputManager.isPressed('ArrowUp')) this._lastDriveState = 'D';
        else if (this.inputManager.isPressed('ArrowDown')) this._lastDriveState = 'R';
        else if (velocity < 0.5) this._lastDriveState = 'N';

        return this._lastDriveState;
    }

    applyRecoil(intensity) {
        this.cameraShake = Math.min(0.5, this.cameraShake + intensity);
    }

    updatePhysics() {
        const maxSteerVal = 0.4;
        const maxForce = 4444;
        const brakeForce = 10000000;
        const assistBrakeForce = 5;

        // Cleanup orphaned bodies (Logic from original lines 544-613)
        // Leaving out for brevity unless critical? It's fairly critical for long running servers/games.
        // I will implement it basically.

        // Boost Logic
        const keys = this.inputManager.keys;
        if (keys.Space) {
            if (!this.isBoosting) {
                this.isBoosting = true;
                this.currentMaxSpeed = CONSTANTS.BOOST_MAX_SPEED;

                this.boostTimer = setTimeout(() => {
                    this.isBoosting = false;
                    this.currentMaxSpeed = CONSTANTS.MAX_SPEED;
                }, 20000);
            }
        } else {
            if (this.isBoosting) {
                this.isBoosting = false;
                this.currentMaxSpeed = CONSTANTS.MAX_SPEED;
                if (this.boostTimer) clearTimeout(this.boostTimer);
            }
        }
        this.currentMaxSpeed = this.isBoosting ? CONSTANTS.BOOST_MAX_SPEED : CONSTANTS.MAX_SPEED;

        // Aerodynamics (Flight Mode)
        if (this.flightMode) {
            // Nullify engine forces from wheels if in air/flight mode?
            // Actually, we could just skip the applyEngineForce/Steer block.
            this.vehicle.applyEngineForce(0, 0);
            this.vehicle.applyEngineForce(0, 1);
            this.vehicle.applyEngineForce(0, 2);
            this.vehicle.applyEngineForce(0, 3);
            this.vehicle.setSteeringValue(0, 0);
            this.vehicle.setSteeringValue(0, 1);
            this.vehicle.setSteeringValue(0, 2);
            this.vehicle.setSteeringValue(0, 3);

            this.flightManager.applyAeroForces(this.vehicle.chassisBody);

            this.vehicle.update();
            this.physicsWorld.step();
            return;
        }

        // Apply Forces (Standard Car Mode)
        const speedKmh = this.vehicle.chassisBody.velocity.length() * 3.6;

        // Speed Limit
        if (speedKmh >= this.currentMaxSpeed) {
            this.vehicle.applyEngineForce(0, 0);
            this.vehicle.applyEngineForce(0, 1);
            this.vehicle.applyEngineForce(0, 2);
            this.vehicle.applyEngineForce(0, 3);
        } else {
            if (keys.ArrowUp) {
                this.vehicle.applyEngineForce(maxForce, 0);
                this.vehicle.applyEngineForce(maxForce, 1);
                this.vehicle.applyEngineForce(maxForce, 2);
                this.vehicle.applyEngineForce(maxForce, 3);
            } else if (keys.ArrowDown) {
                this.vehicle.applyEngineForce(-maxForce, 0);
                this.vehicle.applyEngineForce(-maxForce, 1);
                this.vehicle.applyEngineForce(-maxForce, 2);
                this.vehicle.applyEngineForce(-maxForce, 3);
            } else {
                this.vehicle.applyEngineForce(0, 0);
                this.vehicle.applyEngineForce(0, 1);
                this.vehicle.applyEngineForce(0, 2);
                this.vehicle.applyEngineForce(0, 3);
            }
        }

        // Brakes
        if (keys.Space && !keys.ArrowUp) {
            this.vehicle.setBrake(brakeForce, 0); // Rear Left
            this.vehicle.setBrake(brakeForce, 1); // Rear Right
            this.vehicle.setBrake(brakeForce, 2); // Front Left
            this.vehicle.setBrake(brakeForce, 3); // Front Right
        } else {
            this.vehicle.setBrake(0, 0);
            this.vehicle.setBrake(0, 1);
            this.vehicle.setBrake(0, 2);
            this.vehicle.setBrake(0, 3);
        }

        // Steering
        if (keys.ArrowLeft) {
            this.vehicle.setSteeringValue(maxSteerVal, 2); // Front Left
            this.vehicle.setSteeringValue(maxSteerVal, 3); // Front Right
        } else if (keys.ArrowRight) {
            this.vehicle.setSteeringValue(-maxSteerVal, 2);
            this.vehicle.setSteeringValue(-maxSteerVal, 3);
        } else {
            this.vehicle.setSteeringValue(0, 2);
            this.vehicle.setSteeringValue(0, 3);
        }

        this.vehicle.update();
        this.physicsWorld.step();
    }

    switchVehicle(type) {
        // Remove current vehicle
        if (this.vehicle) {
            this.scene.remove(this.vehicle.chassisMesh);
            if (this.vehicle.wheelMeshes) {
                this.vehicle.wheelMeshes.forEach(w => this.scene.remove(w));
            }
            if (this.vehicle.chassisBody) {
                this.physicsWorld.world.removeBody(this.vehicle.chassisBody);
            }
            // If it's a RaycastVehicle, remove it too
            if (this.vehicle.vehicle && this.vehicle.vehicle.removeFromWorld) {
                this.vehicle.vehicle.removeFromWorld(this.physicsWorld.world);
            }
        }

        // Create new
        if (type === 'fixedwing') {
            this.vehicle = new FixedWing(this);
            this.flightMode = true; // Auto flight mode for aircraft
        } else {
            this.vehicle = new Vehicle(this);
            this.flightMode = false;
        }

        this.vehicle.init();

        // Sync InputManager yaw with vehicle initial yaw to prevent snapping
        if (this.vehicle.chassisBody) {
            const forward = new CANNON.Vec3(1, 0, 0);
            this.vehicle.chassisBody.quaternion.vmult(forward, forward);
            this.inputManager.cameraYawAngle = Math.atan2(forward.z, forward.x);
        }

        // Re-attach player label if needed? (optional for now)
        // this.createPlayerLabelForSelf(this.networkManager.id);
    }

    updateCamera() {
        const chassisMesh = this.vehicle.chassisMesh;
        if (!chassisMesh) return;

        if (!this.isFirstPersonView) {
            // Third Person (Distinguish between Hover Mode and Normal Mode)
            if (this.vehicle.hoverMode) {
                // --- HOVER MODE: MOUSE AIM (WAR THUNDER STYLE) ---
                const yaw = this.inputManager.cameraYawAngle || 0;
                const pitch = this.inputManager.cameraPitchAngle || 0;

                // 1. Calculate Aim Direction (Where the mouse is pointing in world)
                const aimDir = new THREE.Vector3(1, 0, 0); // Forward X+
                aimDir.applyAxisAngle(new THREE.Vector3(0, 0, 1), pitch); // Pitch
                aimDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);   // Yaw

                // 2. Camera follows VEHICLE, not aim direction
                // Standard chase camera
                const chaseDist = 12;
                const chaseHeight = 4;

                // Get vehicle forward/velocity direction for smooth following? 
                // Or just behind the vehicle's actual orientation?
                // Let's use vehicle orientation for the camera alignment effectively
                const vehicleForward = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisMesh.quaternion);

                // We actually want the camera to be somewhat "free" or follow the vehicle loosely.
                // Simple implementation: Behind the vehicle's position, but looking at vehicle.
                // Let's bias the camera behind the AIM direction slightly so you can see where you are turning?
                // No, War Thunder style: Camera looks at Plane, Plane tries to look at Cursor.
                // Actually, in WT, Camera looks in the direction of the Cursor, and Plane tries to align.
                // So Camera Rotation is driven by Mouse (Input Angles).

                // REVISION: Camera Rotation IS the Input Angles. Camera Position trails the plane.
                // Plane is somewhere in front.

                // Camera Rotation based on Input Angles (Cursor Direction)
                // We construct a rotation matrix from Yaw/Pitch
                // Correction for Camera Face (-Z) vs World/Model Forward (+X)
                // We want Camera to look down +X when Yaw=0.
                // Camera looks -Z. RotY(-90) -> +X.
                const camQuat = new THREE.Quaternion();
                camQuat.setFromEuler(new THREE.Euler(0, yaw - Math.PI / 2, 0, 'YXZ'));
                // Wait, if we subtract PI/2 from Yaw, we rotate Right? 
                // -90 deg = Right turn? Yes.

                // Simpler: Construct direction then lookAt?
                // lookAt is safer.

                // Set Camera Position
                const camOffset = new THREE.Vector3(-10, 5, 0); // Behind and above
                const camPos = chassisMesh.position.clone();
                camPos.add(camOffset.applyQuaternion(chassisMesh.quaternion));

                this.currentCameraPosition.lerp(camPos, 0.1);
                this.camera.position.copy(this.currentCameraPosition);

                // Look toward the Aim Direction (Absolute)
                const lookTarget = this.camera.position.clone().add(aimDir.clone().multiplyScalar(100));
                this.camera.lookAt(lookTarget);

                // Reticle projection depends on this camera setup.

                // Since lookAt works in World Space, and aimDir is World Space, this is ROBUST against coordinate bugs.
                // We do NOT need to manually set quaternion with offsets if we use lookAt correctly.

                // 3. Project Reticle logic (remains valid as aimDir is derived from Input Yaw which drives Plane)

                // 3. Project Reticle
                // We have 'aimDir' from input. This is the direction we WANT to fly.
                // We need to show this direction on screen relative to the camera.

                // Ghost Target Position (Far away in Aim Direction)
                // Origin should be the Vehicle Position (since we steer the vehicle)
                const targetPos = chassisMesh.position.clone().add(aimDir.multiplyScalar(1000));

                // Project to Screen
                const screenPos = targetPos.clone().project(this.camera);

                // Convert (-1 to +1) to (pixels)
                // x: (screenPos.x * .5 + .5) * width
                // y: -(screenPos.y * .5 - .5) * height

                const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
                const y = (-(screenPos.y * 0.5) + 0.5) * window.innerHeight;

                // Logic to hide if behind camera?
                // if (screenPos.z > 1) -> Behind
                const isVisible = screenPos.z < 1;

                this.uiManager.updateReticle(x, y, isVisible);

            } else {
                // --- NORMAL FLIGHT: RIGID FOLLOW ---
                const offset = CONSTANTS.CAMERA.INITIAL_OFFSET.clone();
                const targetPos = chassisMesh.position.clone().add(offset.applyQuaternion(chassisMesh.quaternion));
                this.currentCameraPosition.copy(targetPos); // Rigid snap or lerp? Original was snap (copy)

                // Apply Shake
                if (this.cameraShake > 0) {
                    this.currentCameraPosition.x += (Math.random() - 0.5) * this.cameraShake;
                    this.currentCameraPosition.y += (Math.random() - 0.5) * this.cameraShake;
                    this.currentCameraPosition.z += (Math.random() - 0.5) * this.cameraShake;
                }

                this.camera.position.copy(this.currentCameraPosition);

                const rightOffset = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisMesh.quaternion);

                // Combined Pitch logic (Camera Angle relative to plane)
                const pitch = this.inputManager.cameraPitchAngle || 0;
                // We want to rotate the "LookAt" vector by this pitch?
                // The Original logic:
                // const lookAtOffset = rightOffset.clone(); // ?? This implies forward is X?
                // Yes, X is forward.
                const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisMesh.quaternion);
                // Rotate forward by pitch around local Z?
                // Actually the original code logic was weird: "lookAtOffset.y = Math.sin(pitch)"
                // This added vertical component to the right offset? No.
                // Let's stick to standard behavior: Look at Plane Center + forward
                this.camera.lookAt(chassisMesh.position);
            }
        } else {
            // First Person
            const chassisQuat = chassisMesh.quaternion;
            const offset = (this.vehicle.cameraOffset || CONSTANTS.CAMERA.FIRST_PERSON_OFFSET).clone();
            offset.applyQuaternion(chassisQuat);
            this.currentCameraPosition.copy(chassisMesh.position).add(offset); // No lerp for FPS, instant stick

            // Apply Shake
            if (this.cameraShake > 0) {
                this.currentCameraPosition.x += (Math.random() - 0.5) * this.cameraShake;
                this.currentCameraPosition.y += (Math.random() - 0.5) * this.cameraShake;
                this.currentCameraPosition.z += (Math.random() - 0.5) * this.cameraShake;
            }
            this.camera.position.copy(this.currentCameraPosition);

            // Orientation Logic
            // Use lookAt to ensure we face exactly the vehicle's forward (+X)
            const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisQuat);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(chassisQuat);

            // Set base orientation
            this.camera.up.copy(up);
            const lookTarget = this.camera.position.clone().add(forward);
            this.camera.lookAt(lookTarget);

            // 2. User Requested: Only allow mouse to guide when RIGHT CLICK is held
            if (this.inputManager.isDragging) {
                const yaw = this.inputManager.cameraYawAngle || 0;
                const pitch = this.inputManager.cameraPitchAngle || 0;

                // For FPS free look, rotate camera locally
                this.camera.rotateOnAxis(new THREE.Vector3(0, 1, 0), yaw);
                this.camera.rotateOnAxis(new THREE.Vector3(1, 0, 0), pitch);
            } else {
                // Auto Return
                this.inputManager.cameraYawAngle = 0;
                this.inputManager.cameraPitchAngle = 0;
            }

            // Note: Since Camera now rolls with Vehicle, the HUD Horizon Logic (rotate(-roll)) MUST match this.
            // If World is Flat. Vehicle Rolls Right (+90). Camera Rolls Right (+90).
            // Screen sees Ground on Left, Sky on Right. Horizon is Vertical |
            // HUD rotates -90 (CCW). Top becomes Left. Line becomes |.
            // MATCH. 
            // This confirms that "HUD Reverse" was likely due to Camera NOT rolling.
        }
    }

    createPlayerLabelForSelf(id) {
        const label = this.uiManager.createPlayerLabel(id);
        this.vehicle.chassisMesh.add(label);
    }

    initOtherPlayer(data) {
        // ... (Logic from original initOtherPlayer)
        // I should probably put this in NetworkManager is not ideal, or keep it there?
        // Original: initOtherPlayer was global. NetworkManager calls Game.
        // I can implement it here.
        if (Array.from(this.otherPlayers.values()).some(p => p.socketId === data.socketId)) return;

        const otherChassisGeometry = new THREE.BoxGeometry(4, 1, 2);
        const otherChassisMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const otherChassisMesh = new THREE.Mesh(otherChassisGeometry, otherChassisMaterial);

        if (data.position) otherChassisMesh.position.copy(data.position);
        if (data.quaternion) otherChassisMesh.quaternion.copy(data.quaternion);

        const label = this.uiManager.createPlayerLabel(data.id);
        otherChassisMesh.add(label);
        this.scene.add(otherChassisMesh);

        // Physics for other player
        const otherChassisShape = new CANNON.Box(new CANNON.Vec3(2, 0.5, 1));
        const otherChassisBody = new CANNON.Body({
            mass: 1000,
            material: new CANNON.Material('otherVehicle')
        });
        otherChassisBody.addShape(otherChassisShape);
        if (data.position) otherChassisBody.position.copy(data.position);
        if (data.quaternion) otherChassisBody.quaternion.copy(data.quaternion);

        this.physicsWorld.world.addBody(otherChassisBody);

        // Attach muzzle flash for remote aircraft
        const scale = CONSTANTS.AERO.SCALE || 0.4;
        const muzzleFlashGeom = new THREE.ConeGeometry(0.2 * scale, 1.0 * scale, 8);
        const muzzleFlashMat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.9 });
        const muzzleFlash = new THREE.Mesh(muzzleFlashGeom, muzzleFlashMat);
        muzzleFlash.rotation.z = -Math.PI / 2;
        muzzleFlash.position.set(4.5 * scale, 0, 0);
        muzzleFlash.visible = false;
        otherChassisMesh.add(muzzleFlash);

        this.otherPlayers.set(data.socketId, {
            mesh: otherChassisMesh,
            body: otherChassisBody,
            label: label,
            muzzleFlash: muzzleFlash, // Keep reference
            id: data.id,
            socketId: data.socketId
        });
    }

    removeRemotePlayer(socketId) {
        const player = this.otherPlayers.get(socketId);
        if (player) {
            this.scene.remove(player.mesh);
            if (player.body) this.physicsWorld.world.removeBody(player.body);
            this.otherPlayers.delete(socketId);
        }
    }

    updateRemotePlayer(data) {
        // Iterate all to find by ID? Or use socketId map?
        // Original used `otherPlayers.forEach((player, socketId) => ...)` and matched data.id
        // But data usually comes with socketId or we use the sender's socketId?
        // Original `player_moved` payload: `data` contains `id`.
        // And it iterates map to find player with that ID.
        for (const [socketId, player] of this.otherPlayers) {
            if (player.id === data.id) {
                if (data.position) {
                    player.mesh.position.set(data.position.x, data.position.y || 1, data.position.z);
                    if (player.body) {
                        player.body.position.copy(player.mesh.position);
                        player.body.wakeUp();
                    }
                }
                if (data.quaternion) {
                    // logic to handle array vs object
                    const q = data.quaternion;
                    if (Array.isArray(q)) player.mesh.quaternion.set(q[0], q[1], q[2], q[3]);
                    else player.mesh.quaternion.set(q.x, q.y, q.z, q.w);

                    if (player.body) player.body.quaternion.copy(player.mesh.quaternion);
                }
            }
        }
    }

    onLocalPlayerDamaged(data) {
        if (this.vehicle && this.vehicle.takeDamage) {
            this.vehicle.takeDamage(data.damage);
            // Visual feedback could go here
            this.uiManager.showFlightNotification(`HIT BY WEAPON!`, 500);
        }
    }

    onRemoteFire(data) {
        const player = this.otherPlayers.get(data.socketId);
        if (player && player.muzzleFlash) {
            player.muzzleFlash.visible = true;
            // Temporary hide after a short delay
            setTimeout(() => { if (player.muzzleFlash) player.muzzleFlash.visible = false; }, 50);

            // Tracer effect for remote player
            const scale = CONSTANTS.AERO.SCALE || 0.4;
            const tracerGeom = new THREE.SphereGeometry(0.15, 6, 6);
            const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffff44 });
            const tracer = new THREE.Mesh(tracerGeom, tracerMat);

            // Set starting position at muzzle
            const q = new THREE.Quaternion();
            player.mesh.getWorldQuaternion(q);
            const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
            const muzzlePos = player.mesh.position.clone().add(forward.clone().multiplyScalar(4.5 * scale));
            tracer.position.copy(muzzlePos);

            this.scene.add(tracer);

            // Basic animation for tracer (simulated)
            const speed = CONSTANTS.WEAPON.M61.VELOCITY;
            const startTime = Date.now();
            const duration = 1000; // 1s life

            const animateTracer = () => {
                const elapsed = Date.now() - startTime;
                if (elapsed > duration) {
                    this.scene.remove(tracer);
                    return;
                }
                tracer.position.add(forward.clone().multiplyScalar(speed * (16 / 1000))); // approx 60fps
                requestAnimationFrame(animateTracer);
            };
            requestAnimationFrame(animateTracer);
        }
    }
}
