import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONSTANTS } from '../utils/Constants.js';

export class Vehicle {
    constructor(game) {
        this.game = game;
        this.vehicle = null;
        this.chassisBody = null;
        this.chassisMesh = null;
        this.wheelMeshes = [];
        this.currentCollisionProtection = null;
        this.maxHealth = CONSTANTS.HEALTH.VEHICLE_MAX_HEALTH;
        this.health = this.maxHealth;
    }

    init() {
        const world = this.game.physicsWorld.world;
        const scene = this.game.scene;

        // Chassis Body
        const chassisShape = new CANNON.Box(new CANNON.Vec3(2, 0.5, 1));
        this.chassisBody = new CANNON.Body({
            mass: 1000,
            material: new CANNON.Material('vehicle'),
            collisionFilterGroup: 1,
            collisionFilterMask: 1 | 2
        });
        this.chassisBody.addShape(chassisShape);
        this.chassisBody.position.set(0, 1, 0);

        // Chassis Mesh (Upgrade to a more realistic car shape)
        this.chassisMesh = new THREE.Group();

        // 1. Lower Body
        const bodyGeometry = new THREE.BoxGeometry(4, 0.6, 2);
        const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 }); // Use Phong for highlights
        const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        bodyMesh.position.y = 0;
        this.chassisMesh.add(bodyMesh);

        // 2. Cockpit (Upper Body)
        const cockpitGeometry = new THREE.BoxGeometry(2, 0.5, 1.6);
        const cockpitMaterial = new THREE.MeshPhongMaterial({ color: 0x333333, transparent: true, opacity: 0.8 });
        const cockpitMesh = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
        cockpitMesh.position.set(-0.2, 0.55, 0); // Slightly back from center
        this.chassisMesh.add(cockpitMesh);

        // 3. Headlights
        const lightGeometry = new THREE.SphereGeometry(0.15, 16, 16);
        const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffcc });

        const leftHeadlight = new THREE.Mesh(lightGeometry, headlightMaterial);
        leftHeadlight.position.set(2, 0, 0.7);
        this.chassisMesh.add(leftHeadlight);

        const rightHeadlight = new THREE.Mesh(lightGeometry, headlightMaterial);
        rightHeadlight.position.set(2, 0, -0.7);
        this.chassisMesh.add(rightHeadlight);

        // 4. Taillights
        const taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        const leftTaillight = new THREE.Mesh(lightGeometry, taillightMaterial);
        leftTaillight.position.set(-2, 0, 0.7);
        this.chassisMesh.add(leftTaillight);

        const rightTaillight = new THREE.Mesh(lightGeometry, taillightMaterial);
        rightTaillight.position.set(-2, 0, -0.7);
        this.chassisMesh.add(rightTaillight);

        scene.add(this.chassisMesh);

        // RaycastVehicle
        this.vehicle = new CANNON.RaycastVehicle({
            chassisBody: this.chassisBody,
        });

        const wheelOptions = {
            radius: 0.5,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: 40,
            suspensionRestLength: 0.4,
            frictionSlip: 2,
            dampingRelaxation: 3,
            dampingCompression: 3,
            maxSuspensionForce: 100000,
            rollInfluence: 0.1,
            axleLocal: new CANNON.Vec3(0, 0, 1),
            chassisConnectionPointLocal: new CANNON.Vec3(1, 0, 0),
            maxSuspensionTravel: 0.3,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true
        };

        // Front wheels
        wheelOptions.chassisConnectionPointLocal.set(-1.5, 0, 1);
        this.vehicle.addWheel(wheelOptions);
        wheelOptions.chassisConnectionPointLocal.set(-1.5, 0, -1);
        this.vehicle.addWheel(wheelOptions);

        // Rear wheels
        wheelOptions.chassisConnectionPointLocal.set(1.5, 0, 1);
        this.vehicle.addWheel(wheelOptions);
        wheelOptions.chassisConnectionPointLocal.set(1.5, 0, -1);
        this.vehicle.addWheel(wheelOptions);

        this.vehicle.addToWorld(world);

        // Wheel Meshes
        this.vehicle.wheelInfos.forEach((wheel) => {
            const wheelGroup = new THREE.Group();

            // Cylinder geometry for tires
            // Parameters: radiusTop, radiusBottom, height, radialSegments
            // Axle is along Z, so height (tire width) should be along Z.
            const tireGeometry = new THREE.CylinderGeometry(wheel.radius, wheel.radius, 0.3, 32);
            const tireMaterial = new THREE.MeshPhongMaterial({ color: 0x111111 });
            const tireMesh = new THREE.Mesh(tireGeometry, tireMaterial);

            // Rotate the cylinder so its height aligns with the Z axle (initially it's along Y)
            tireMesh.rotation.x = Math.PI / 2;
            wheelGroup.add(tireMesh);

            // Simple Rim detail (Cylinder)
            const rimGeometry = new THREE.CylinderGeometry(wheel.radius * 0.6, wheel.radius * 0.6, 0.32, 16);
            const rimMaterial = new THREE.MeshPhongMaterial({ color: 0x999999 });
            const rimMesh = new THREE.Mesh(rimGeometry, rimMaterial);
            rimMesh.rotation.x = Math.PI / 2;
            wheelGroup.add(rimMesh);

            this.wheelMeshes.push(wheelGroup);
            scene.add(wheelGroup);
        });

        // Damage Listener
        this.chassisBody.addEventListener('collide', (event) => {
            const impulse = event.contact.getImpactVelocityAlongNormal();
            // CANNON impulse is mass * velocity change
            const impactForce = Math.abs(impulse) * this.chassisBody.mass;
            if (impactForce > CONSTANTS.HEALTH.COLLISION_DAMAGE_THRESHOLD) {
                const damage = (impactForce - CONSTANTS.HEALTH.COLLISION_DAMAGE_THRESHOLD) * CONSTANTS.HEALTH.IMPACT_DAMAGE_RATIO;
                this.takeDamage(damage);
            }
        });
    }

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        if (this.health <= 0) {
            this.game.uiManager.showFlightNotification("VEHICLE DESTROYED", 2000);
            setTimeout(() => this.reset(), 1000);
        }
    }

    update() {
        // Sync chassis mesh
        this.chassisMesh.position.copy(this.chassisBody.position);
        this.chassisMesh.quaternion.copy(this.chassisBody.quaternion);

        // Sync wheels
        this.vehicle.wheelInfos.forEach((wheel, index) => {
            this.vehicle.updateWheelTransform(index);
            const t = wheel.worldTransform;
            this.wheelMeshes[index].position.copy(t.position);
            this.wheelMeshes[index].quaternion.copy(t.quaternion);
        });

        // Drift part (only if we implement it, original had it but maybe distinct func)
        // createDriftParticles logic can be here called from game loop
    }

    applyEngineForce(force, wheelIndex) {
        this.vehicle.applyEngineForce(force, wheelIndex);
    }

    setBrake(force, wheelIndex) {
        this.vehicle.setBrake(force, wheelIndex);
    }

    setSteeringValue(value, wheelIndex) {
        this.vehicle.setSteeringValue(value, wheelIndex);
    }

    reset() {
        this.chassisBody.position.set(CONSTANTS.SPAWN_POSITION.x, CONSTANTS.SPAWN_POSITION.y, CONSTANTS.SPAWN_POSITION.z);
        this.chassisBody.velocity.setZero();
        this.chassisBody.angularVelocity.setZero();
        this.chassisBody.quaternion.set(0, 0, 0, 1);

        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            this.vehicle.wheelInfos[i].suspensionLength = 0;
            this.vehicle.wheelInfos[i].suspensionForce = 0;
            this.vehicle.wheelInfos[i].suspensionRelativeVelocity = 0;
            this.vehicle.wheelInfos[i].deltaRotation = 0;
        }

        this.chassisBody.wakeUp();
        this.health = this.maxHealth;
        this.provideTempCollisionProtection(null, 3000);
    }

    straighten() {
        const currentPosition = this.chassisBody.position.clone();

        // Preserve Yaw
        const euler = new CANNON.Vec3();
        this.chassisBody.quaternion.toEuler(euler);
        const newQuaternion = new CANNON.Quaternion();
        newQuaternion.setFromEuler(0, euler.y, 0);
        this.chassisBody.quaternion.copy(newQuaternion);

        this.chassisBody.position.y = Math.max(currentPosition.y, CONSTANTS.SPAWN_POSITION.y);
        this.chassisBody.velocity.setZero();
        this.chassisBody.angularVelocity.setZero();

        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            this.vehicle.wheelInfos[i].suspensionLength = 0;
            this.vehicle.wheelInfos[i].suspensionForce = 0;
            this.vehicle.wheelInfos[i].suspensionRelativeVelocity = 0;
            this.vehicle.wheelInfos[i].deltaRotation = 0;
        }

        this.chassisBody.wakeUp();
        this.health = this.maxHealth;
        this.provideTempCollisionProtection(null, 3000);
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

        if (CONSTANTS.DEBUG) console.log(`碰撞保护已启用，持续${duration / 1000}秒`);

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

                if (CONSTANTS.DEBUG) console.log("碰撞保护已结束");
                if (callback) callback();
            }
        };

        return this.currentCollisionProtection;
    }
}
