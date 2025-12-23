import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONSTANTS } from '../utils/Constants.js';

export class FixedWing {
    constructor(game) {
        this.game = game;
        this.chassisBody = null;
        this.chassisMesh = null;
        this.type = 'FixedWing';
        this.cameraOffset = new THREE.Vector3(0.8, 0.25, 0); // Moved forward and lower for better pilot perspective
        this.throttle = 0;
        this.afterburner = false;
        this.gearDown = true;
        this.airbrakeActive = false;
        this.braking = false;
        this.vehicle = null; // RaycastVehicle
        this.wheelMeshes = [];
        this.airbrakeMeshes = [];
        this.maxHealth = CONSTANTS.HEALTH.AIRCRAFT_MAX_HEALTH;
        this.health = this.maxHealth;

        // Weapon Systems
        this.cannonRPM = CONSTANTS.WEAPON.M61.RPM_HIGH; // Default to 6000
        this.lastFireTime = 0;
        this.projectiles = [];
        this.isFiring = false;
        this.overspeedWarning = false;
        this.muzzleFlashTimer = 0;
        this.hoverMode = false;
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

        // --- Muzzle Flash Visual ---
        const muzzleFlashGeom = new THREE.ConeGeometry(0.2 * scale, 1.0 * scale, 8);
        const muzzleFlashMat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.9 });
        this.muzzleFlash = new THREE.Mesh(muzzleFlashGeom, muzzleFlashMat);
        this.muzzleFlash.rotation.z = -Math.PI / 2; // Pointing forward
        this.muzzleFlash.position.set(4.5 * scale, 0, 0); // At the nose
        this.muzzleFlash.visible = false;
        this.chassisMesh.add(this.muzzleFlash);

        // --- Physical Landing Gear (RaycastVehicle) ---
        this.vehicle = new CANNON.RaycastVehicle({
            chassisBody: this.chassisBody,
        });

        const wheelOptions = {
            radius: CONSTANTS.AERO.GEAR.WHEEL_RADIUS * scale, // Scaled radius
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: CONSTANTS.AERO.GEAR.SUSPENSION_STIFFNESS,
            suspensionRestLength: CONSTANTS.AERO.GEAR.SUSPENSION_REST_LENGTH * scale,
            frictionSlip: CONSTANTS.AERO.GEAR.FRICTION_SLIP,
            dampingRelaxation: CONSTANTS.AERO.GEAR.DAMPING_RELAXATION,
            dampingCompression: CONSTANTS.AERO.GEAR.DAMPING_COMPRESSION,
            maxSuspensionForce: CONSTANTS.AERO.GEAR.MAX_SUSPENSION_FORCE,
            rollInfluence: CONSTANTS.AERO.GEAR.ROLL_INFLUENCE,
            axleLocal: new CANNON.Vec3(0, 0, 1),
            chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
            maxSuspensionTravel: CONSTANTS.AERO.GEAR.MAX_SUSPENSION_TRAVEL * scale,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true
        };

        // 1. Nose Gear
        wheelOptions.chassisConnectionPointLocal.set(3 * scale, -0.4 * scale, 0);
        this.vehicle.addWheel(wheelOptions);

        // 2. Main Gear Left
        wheelOptions.chassisConnectionPointLocal.set(-1 * scale, -0.4 * scale, 1.5 * scale);
        this.vehicle.addWheel(wheelOptions);

        // 3. Main Gear Right
        wheelOptions.chassisConnectionPointLocal.set(-1 * scale, -0.4 * scale, -1.5 * scale);
        this.vehicle.addWheel(wheelOptions);

        this.vehicle.addToWorld(world);

        // --- Visual Wheel Meshes ---
        const gearMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const wheelGeom = new THREE.CylinderGeometry(
            CONSTANTS.AERO.GEAR.WHEEL_RADIUS * scale,
            CONSTANTS.AERO.GEAR.WHEEL_RADIUS * scale,
            0.2 * scale, 16
        );

        this.vehicle.wheelInfos.forEach(() => {
            const wheelGroup = new THREE.Group();
            const wheelMesh = new THREE.Mesh(wheelGeom, gearMat);
            wheelMesh.rotation.x = Math.PI / 2; // Cylinder to Z axle
            wheelGroup.add(wheelMesh);
            this.wheelMeshes.push(wheelGroup);
            scene.add(wheelGroup);
        });

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

        // Damage Listener
        this.chassisBody.addEventListener('collide', (event) => {
            const impulse = event.contact.getImpactVelocityAlongNormal();
            const impactForce = Math.abs(impulse) * this.chassisBody.mass;

            // Planes are fragile! Lower threshold and higher damage ratio
            const threshold = CONSTANTS.HEALTH.COLLISION_DAMAGE_THRESHOLD * 0.5;
            if (impactForce > threshold) {
                const damage = (impactForce - threshold) * CONSTANTS.HEALTH.IMPACT_DAMAGE_RATIO * 3.0; // 3x damage vs cars
                this.takeDamage(damage);
            }
        });
    }

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        if (this.health <= 0) {
            this.game.uiManager.showFlightNotification("AIRCRAFT DESTROYED", 2000);
            setTimeout(() => this.reset(), 1000);
        }
    }

    updateSystemsVisuals() {
        // Gear Extension/Retraction
        const scale = CONSTANTS.AERO.SCALE || 0.4;
        const targetLength = this.gearDown ? (CONSTANTS.AERO.GEAR.SUSPENSION_REST_LENGTH * scale) : 0;

        this.vehicle.wheelInfos.forEach((wheel, index) => {
            wheel.suspensionRestLength = targetLength;
            this.wheelMeshes[index].visible = this.gearDown;
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

        // Sync wheels
        this.vehicle.wheelInfos.forEach((wheel, index) => {
            this.vehicle.updateWheelTransform(index);
            const t = wheel.worldTransform;
            this.wheelMeshes[index].position.copy(t.position);
            this.wheelMeshes[index].quaternion.copy(t.quaternion);
        });

        // Afterburner Visual
        if (this.flameMesh) {
            this.flameMesh.visible = this.afterburner;
        }

        // Overspeed Check
        const speedKmh = this.chassisBody.velocity.length() * 3.6;
        const maxSafeSpeed = CONSTANTS.HEALTH.OVERSPEED_THRESHOLD_KMH;
        if (speedKmh > maxSafeSpeed) {
            this.overspeedWarning = true;
            // Apply damage over time (scaled by 1/60s per frame)
            const damage = CONSTANTS.HEALTH.OVERSPEED_DAMAGE_RATE * (1 / 60);
            this.takeDamage(damage);
        } else {
            this.overspeedWarning = false;
        }

        // Muzzle Flash Timer
        if (this.muzzleFlashTimer > 0) {
            this.muzzleFlashTimer -= 1 / 60;
            if (this.muzzleFlashTimer <= 0) {
                this.muzzleFlash.visible = false;
            }
        }

        // Update Projectiles
        this.updateProjectiles();
    }

    updateProjectiles() {
        const dt = 1 / 60;
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.game.scene.remove(p.mesh);
                this.projectiles.splice(i, 1);
                continue;
            }
            // Move bullet
            p.mesh.position.addScaledVector(p.velocity, dt);

            // Basic ground collision for bullets
            if (p.mesh.position.y < 0) {
                this.createImpactEffect(p.mesh.position);
                this.game.scene.remove(p.mesh);
                this.projectiles.splice(i, 1);
                continue;
            }
        }
    }

    createImpactEffect(position) {
        // Spark
        const sparkGeom = new THREE.SphereGeometry(0.5, 4, 4);
        const sparkMat = new THREE.MeshBasicMaterial({ color: CONSTANTS.WEAPON.M61.IMPACT_COLOR_SPARK });
        const spark = new THREE.Mesh(sparkGeom, sparkMat);
        spark.position.copy(position);
        this.game.scene.add(spark);

        // Dust
        const dustGeom = new THREE.SphereGeometry(1.5, 6, 6);
        const dustMat = new THREE.MeshBasicMaterial({
            color: CONSTANTS.WEAPON.M61.IMPACT_COLOR_DUST,
            transparent: true,
            opacity: 0.6
        });
        const dust = new THREE.Mesh(dustGeom, dustMat);
        dust.position.copy(position);
        dust.position.y += 0.5;
        this.game.scene.add(dust);

        setTimeout(() => {
            this.game.scene.remove(spark);
            this.game.scene.remove(dust);
        }, 150);
    }

    fire() {
        const now = Date.now();
        const interval = 60000 / this.cannonRPM; // ms per shot
        if (now - this.lastFireTime < interval) return;

        this.lastFireTime = now;

        // Create bullet visual
        const bulletGeom = new THREE.SphereGeometry(0.15, 8, 8);
        const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const bulletMesh = new THREE.Mesh(bulletGeom, bulletMat);

        // Spawn at nose
        const forward = new THREE.Vector3(1, 0, 0);
        forward.applyQuaternion(this.chassisMesh.quaternion);

        const noseOffset = forward.clone().multiplyScalar(4.5 * (CONSTANTS.AERO.SCALE || 0.4));
        bulletMesh.position.copy(this.chassisMesh.position).add(noseOffset);

        this.game.scene.add(bulletMesh);

        // Muzzle Flash
        this.muzzleFlash.visible = true;
        this.muzzleFlashTimer = 0.05;

        // Recoil / Screen Shake
        if (this.game.applyRecoil) {
            this.game.applyRecoil(CONSTANTS.WEAPON.M61.SHAKE_INTENSITY);
        }

        // Physics velocity
        const bulletVel = forward.clone().multiplyScalar(CONSTANTS.WEAPON.M61.VELOCITY);
        // Inherit aircraft velocity
        const planeVel = new THREE.Vector3().copy(this.chassisBody.velocity);
        bulletVel.add(planeVel);

        this.projectiles.push({
            mesh: bulletMesh,
            velocity: bulletVel,
            life: 2.0 // 2 seconds life
        });
    }

    setFireRate(rpm) {
        this.cannonRPM = rpm;
    }

    toggleHover() {
        this.hoverMode = !this.hoverMode;
        if (this.hoverMode) {
            // Enable heavy damping and counter gravity
            this.chassisBody.linearDamping = 0.8;
            this.chassisBody.angularDamping = 0.8;
        } else {
            this.chassisBody.linearDamping = 0.01;
            this.chassisBody.angularDamping = 0.01;
        }
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
        this.health = this.maxHealth;

        // Clear projectiles on reset
        this.projectiles.forEach(p => this.game.scene.remove(p.mesh));
        this.projectiles = [];
    }

    straighten() {
        if (!this.chassisBody) return;
        const currentPosition = this.chassisBody.position.clone();

        // Preserve Yaw (Euler Y)
        const euler = new CANNON.Vec3();
        this.chassisBody.quaternion.toEuler(euler);
        const newQuaternion = new CANNON.Quaternion();
        newQuaternion.setFromEuler(0, euler.y, 0);
        this.chassisBody.quaternion.copy(newQuaternion);

        // Maintain altitude but reset velocities
        this.chassisBody.velocity.setZero();
        this.chassisBody.angularVelocity.setZero();
        this.chassisBody.position.y = Math.max(currentPosition.y, 1.0); // Minimum height

        // Reset physical wheels if vehicle exists
        if (this.vehicle) {
            for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
                this.vehicle.wheelInfos[i].suspensionLength = 0;
                this.vehicle.wheelInfos[i].suspensionForce = 0;
                this.vehicle.wheelInfos[i].suspensionRelativeVelocity = 0;
                this.vehicle.wheelInfos[i].deltaRotation = 0;
                this.vehicle.wheelInfos[i].steering = 0;
            }
        }

        this.chassisBody.wakeUp();
        this.health = this.maxHealth;
        this.provideTempCollisionProtection(null, 3000);
    }

    // Compatibility methods for Game.js
    applyEngineForce(force, wheelIndex) {
        if (this.vehicle && wheelIndex < this.vehicle.wheelInfos.length) {
            this.vehicle.applyEngineForce(force, wheelIndex);
        }
    }
    setBrake(force, wheelIndex) {
        if (this.vehicle && wheelIndex < this.vehicle.wheelInfos.length) {
            this.vehicle.setBrake(force, wheelIndex);
        }
    }
    setSteeringValue(value, wheelIndex) {
        if (this.vehicle && wheelIndex < this.vehicle.wheelInfos.length) {
            this.vehicle.setSteeringValue(value, wheelIndex);
        }
    }
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
