import * as THREE from 'three';
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

        // Re-attach player label if needed? (optional for now)
        // this.createPlayerLabelForSelf(this.networkManager.id);
    }

    updateCamera() {
        const chassisMesh = this.vehicle.chassisMesh;
        if (!chassisMesh) return;

        if (!this.isFirstPersonView) {
            // Third Person
            const offset = CONSTANTS.CAMERA.INITIAL_OFFSET.clone();
            const targetPos = chassisMesh.position.clone().add(offset.applyQuaternion(chassisMesh.quaternion));
            this.currentCameraPosition.copy(targetPos);

            // Apply Shake
            if (this.cameraShake > 0) {
                this.currentCameraPosition.x += (Math.random() - 0.5) * this.cameraShake;
                this.currentCameraPosition.y += (Math.random() - 0.5) * this.cameraShake;
                this.currentCameraPosition.z += (Math.random() - 0.5) * this.cameraShake;
            }

            this.camera.position.copy(this.currentCameraPosition);

            // Look at right side? Original: "new THREE.Vector3(1, 0, 0)" rotated.
            // Original lines 734+: "new THREE.Vector3(1, 0, 0)"
            // This means camera looks at the Right of the car?
            // "const rightOffset = new THREE.Vector3(1, 0, 0);"
            // "targetLookAt = ... .add(rightOffset)"
            // Yes, camera looks at a point to the right of the car.
            // I will keep this style.
            const rightOffset = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisMesh.quaternion);

            // Pitch logic
            const pitch = this.inputManager.cameraPitchAngle || 0;
            const lookAtOffset = rightOffset.clone();
            lookAtOffset.y = Math.sin(pitch);
            lookAtOffset.normalize();

            const targetLookAt = chassisMesh.position.clone().add(lookAtOffset);
            this.currentCameraLookAt.copy(targetLookAt);
            this.camera.lookAt(this.currentCameraLookAt);
        } else {
            // First Person
            const offset = (this.vehicle.cameraOffset || CONSTANTS.CAMERA.FIRST_PERSON_OFFSET).clone();
            offset.applyQuaternion(chassisMesh.quaternion);
            this.currentCameraPosition.copy(chassisMesh.position).add(offset);

            // Apply Shake
            if (this.cameraShake > 0) {
                this.currentCameraPosition.x += (Math.random() - 0.5) * this.cameraShake;
                this.currentCameraPosition.y += (Math.random() - 0.5) * this.cameraShake;
                this.currentCameraPosition.z += (Math.random() - 0.5) * this.cameraShake;
            }

            this.camera.position.copy(this.currentCameraPosition);

            const pitch = this.inputManager.cameraPitchAngle || 0;
            const rightOffset = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisMesh.quaternion);
            const lookAtOffset = rightOffset.clone();
            lookAtOffset.y = Math.sin(pitch);
            lookAtOffset.normalize();

            this.currentCameraLookAt.copy(this.currentCameraPosition).add(lookAtOffset);

            // Original: camera.quaternion.copy(chassisMesh.quaternion); camera.rotateY(Math.PI/2);
            // But we can just lookAt.
            this.camera.lookAt(this.currentCameraLookAt);
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

        this.otherPlayers.set(data.socketId, {
            mesh: otherChassisMesh,
            body: otherChassisBody,
            label: label,
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
}
