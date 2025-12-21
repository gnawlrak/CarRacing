import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONSTANTS } from '../utils/Constants.js';

export class FixedWing {
    constructor(game) {
        this.game = game;
        this.chassisBody = null;
        this.chassisMesh = null;
        this.type = 'FixedWing';
        this.cameraOffset = new THREE.Vector3(2.5, 0.8, 0);
        this.throttle = 0;
        this.afterburner = false;
        this.gearDown = true;
        this.airbrakeActive = false;
        this.braking = false;
        this.gearMeshes = [];
        this.airbrakeMeshes = [];
    }

    init() {
        const world = this.game.physicsWorld.world;
        const scene = this.game.scene;

        const scale = CONSTANTS.AERO.SCALE || 0.4;

        // 1. Physics Body (Fuselage-like box scaled)
        const chassisShape = new CANNON.Box(new CANNON.Vec3(4 * scale, 0.5 * scale, 1.2 * scale));
        this.chassisBody = new CANNON.Body({
            mass: 500,
            material: new CANNON.Material('aircraft'),
            collisionFilterGroup: 1,
            collisionFilterMask: 1 | 2
        });
        this.chassisBody.addShape(chassisShape);
        this.chassisBody.position.set(0, 100, 0);
        this.chassisBody.angularDamping = 0.5; // Reduce rotational twitchiness

        // Set Initial Velocity: 200 knots forward
        const forward = new CANNON.Vec3(1, 0, 0);
        this.chassisBody.quaternion.vmult(forward, forward);
        const speedMs = CONSTANTS.INITIAL_AIRCRAFT_SPEED_KNOTS * CONSTANTS.KNOTS_TO_MS;
        this.chassisBody.velocity.copy(forward.scale(speedMs));

        // 2. Visual Mesh (Group scaled)
        this.chassisMesh = new THREE.Group();

        // Fuselage
        const fuselageGeom = new THREE.BoxGeometry(8 * scale, 0.8 * scale, 1.0 * scale);
        const fuselageMat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
        const fuselage = new THREE.Mesh(fuselageGeom, fuselageMat);
        this.chassisMesh.add(fuselage);

        // Cockpit
        const cockpitGeom = new THREE.BoxGeometry(1.5 * scale, 0.6 * scale, 0.8 * scale);
        const cockpitMat = new THREE.MeshPhongMaterial({ color: 0x333333, transparent: true, opacity: 0.8 });
        const cockpit = new THREE.Mesh(cockpitGeom, cockpitMat);
        cockpit.position.set(1.5 * scale, 0.6 * scale, 0);
        this.chassisMesh.add(cockpit);

        // Main Wings
        const wingGeom = new THREE.BoxGeometry(2 * scale, 0.1 * scale, 10 * scale);
        const wingMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
        const wings = new THREE.Mesh(wingGeom, wingMat);
        wings.position.set(0, 0, 0);
        this.chassisMesh.add(wings);

        // Horizontal Stabilizer
        const hStabGeom = new THREE.BoxGeometry(1.2 * scale, 0.1 * scale, 3 * scale);
        const hStab = new THREE.Mesh(hStabGeom, wingMat);
        hStab.position.set(-3.5 * scale, 0, 0);
        this.chassisMesh.add(hStab);

        // Vertical Stabilizer
        const vStabGeom = new THREE.BoxGeometry(1.2 * scale, 1.5 * scale, 0.1 * scale);
        const vStab = new THREE.Mesh(vStabGeom, wingMat);
        vStab.position.set(-3.5 * scale, 0.8 * scale, 0);
        this.chassisMesh.add(vStab);

        // --- Afterburner Visual ---
        const flameGeom = new THREE.ConeGeometry(0.3 * scale, 2.0 * scale, 16);
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8 });
        this.flameMesh = new THREE.Mesh(flameGeom, flameMat);
        this.flameMesh.rotation.z = Math.PI / 2; // Pointing backwards
        this.flameMesh.position.set(-4.2 * scale, 0, 0);
        this.flameMesh.visible = false;
        this.chassisMesh.add(this.flameMesh);

        // --- Landing Gear Visuals ---
        const gearMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const wheelGeom = new THREE.CylinderGeometry(0.3 * scale, 0.3 * scale, 0.2 * scale, 16);
        const strutGeom = new THREE.BoxGeometry(0.1 * scale, 0.8 * scale, 0.1 * scale);

        const createGear = (x, y, z) => {
            const gearGroup = new THREE.Group();

            const strut = new THREE.Mesh(strutGeom, gearMat);
            strut.position.set(0, -0.4 * scale, 0); // Strut extends down from pivot
            gearGroup.add(strut);

            const wheel = new THREE.Mesh(wheelGeom, gearMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(0, -0.8 * scale, 0);
            gearGroup.add(wheel);

            gearGroup.position.set(x, y, z);
            return gearGroup;
        };

        // Nose Gear
        const noseGear = createGear(3 * scale, 0, 0);
        this.chassisMesh.add(noseGear);
        this.gearMeshes.push(noseGear);

        // Main Gear (Left & Right)
        const leftGear = createGear(-1 * scale, 0, 1.5 * scale);
        const rightGear = createGear(-1 * scale, 0, -1.5 * scale);
        this.chassisMesh.add(leftGear);
        this.chassisMesh.add(rightGear);
        this.gearMeshes.push(leftGear, rightGear);

        // --- Airbrake Visuals ---
        const abGeom = new THREE.BoxGeometry(0.5 * scale, 1.5 * scale, 0.1 * scale);
        const abMat = new THREE.MeshPhongMaterial({ color: 0x666666 });

        const leftAB = new THREE.Mesh(abGeom, abMat);
        leftAB.position.set(-2.0 * scale, 0.5 * scale, 0.6 * scale);
        leftAB.rotation.y = -Math.PI / 6;
        leftAB.visible = false;

        const rightAB = new THREE.Mesh(abGeom, abMat);
        rightAB.position.set(-2.0 * scale, 0.5 * scale, -0.6 * scale);
        rightAB.rotation.y = Math.PI / 6;
        rightAB.visible = false;

        this.chassisMesh.add(leftAB);
        this.chassisMesh.add(rightAB);
        this.airbrakeMeshes.push(leftAB, rightAB);

        scene.add(this.chassisMesh);
        world.addBody(this.chassisBody);
    }

    updateSystemsVisuals() {
        // Gear Animation (Instant for now, or could rotate)
        this.gearMeshes.forEach(mesh => {
            mesh.visible = this.gearDown;
        });

        // Airbrake Animation
        this.airbrakeMeshes.forEach(mesh => {
            mesh.visible = this.airbrakeActive;
        });

        // Afterburner
        if (this.flameMesh) {
            this.flameMesh.visible = this.afterburner;
        }
    }

    update() {
        if (!this.chassisBody || !this.chassisMesh) return;
        this.chassisMesh.position.copy(this.chassisBody.position);
        this.chassisMesh.quaternion.copy(this.chassisBody.quaternion);
    }

    reset() {
        this.chassisBody.position.set(0, 100, 0);
        this.chassisBody.angularVelocity.setZero();
        this.chassisBody.quaternion.set(0, 0, 0, 1);

        const forward = new CANNON.Vec3(1, 0, 0);
        this.chassisBody.quaternion.vmult(forward, forward);
        const speedMs = CONSTANTS.INITIAL_AIRCRAFT_SPEED_KNOTS * CONSTANTS.KNOTS_TO_MS;
        this.chassisBody.velocity.copy(forward.scale(speedMs));

        this.chassisBody.wakeUp();
    }

    // Compatibility methods for Game.js if it calls them
    applyEngineForce() { }
    setBrake() { }
    setSteeringValue() { }
    provideTempCollisionProtection(callback, duration) {
        // Clean up existing protection if any
        if (this.currentCollisionProtection) {
            this.currentCollisionProtection.cleanup();
        }

        const originalGroup = this.chassisBody.collisionFilterGroup;
        const originalMask = this.chassisBody.collisionFilterMask;

        this.chassisBody.collisionFilterGroup = 4;
        this.chassisBody.collisionFilterMask = 2;

        // Save original colors of all meshes in the group
        const originalColors = new Map();
        this.chassisMesh.traverse((child) => {
            if (child.isMesh && child.material && child.material.color) {
                originalColors.set(child, child.material.color.clone());
                child.material.color.set(0x00FFFF);
            }
        });

        const protectionTimer = setTimeout(() => {
            if (this.currentCollisionProtection) {
                this.currentCollisionProtection.cleanup();
                this.currentCollisionProtection = null;
            }
        }, duration);

        this.currentCollisionProtection = {
            cleanup: () => {
                clearTimeout(protectionTimer);
                this.chassisBody.collisionFilterGroup = originalGroup;
                this.chassisBody.collisionFilterMask = originalMask;

                // Restore original colors
                originalColors.forEach((color, mesh) => {
                    mesh.material.color.copy(color);
                });

                if (callback) callback();
            }
        };

        return this.currentCollisionProtection;
    }
}
