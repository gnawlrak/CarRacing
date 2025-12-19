import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONSTANTS } from '../utils/Constants.js';

export class Environment {
    constructor(game) {
        this.game = game;
        this.loadedChunks = [];
        this.sky = null;
        this.sun = null;
        this.moon = null;
        this.dayNightCycle = true;
    }

    init() {
        this.createFollowingSky();
        this.createClouds();

        // Initial terrain generation
        const spawnChunkX = Math.floor(CONSTANTS.SPAWN_POSITION.x / CONSTANTS.CHUNK_SIZE) * CONSTANTS.CHUNK_SIZE;
        const spawnChunkZ = Math.floor(CONSTANTS.SPAWN_POSITION.z / CONSTANTS.CHUNK_SIZE) * CONSTANTS.CHUNK_SIZE;

        for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
                const chunkX = spawnChunkX + x * CONSTANTS.CHUNK_SIZE;
                const chunkZ = spawnChunkZ + z * CONSTANTS.CHUNK_SIZE;
                this.createTerrainChunk(chunkX, chunkZ);
            }
        }

        const ambientLight = new THREE.AmbientLight(0xffffff, 1);
        this.game.scene.add(ambientLight);

        // Directional light (from original init)
        const light = new THREE.DirectionalLight(0xffffff);
        light.position.set(1, 1, 1).normalize();
        this.game.scene.add(light);
    }

    update() {
        this.updateTerrain();
        this.updateSky();
        // updateClouds is called inside updateSky in original code, but we can separate or keep it.
        // Original: updateSky calls updateClouds.
    }

    createTerrainChunk(x, z) {
        const scene = this.game.scene;
        const world = this.game.physicsWorld.world;
        const chunkSize = CONSTANTS.CHUNK_SIZE;

        const groundGeometry = new THREE.PlaneGeometry(chunkSize, chunkSize);
        const isOutsideCity = (x < CONSTANTS.WORLD_BOUNDS.min || x > CONSTANTS.WORLD_BOUNDS.max ||
            z < CONSTANTS.WORLD_BOUNDS.min || z > CONSTANTS.WORLD_BOUNDS.max);

        if (isOutsideCity) {
            const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x007700, side: THREE.DoubleSide });
            const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
            groundMesh.rotation.x = -Math.PI / 2;
            groundMesh.position.set(x, 0, z);

            const vertices = groundMesh.geometry.attributes.position.array;
            for (let i = 0; i < vertices.length; i += 3) {
                if (i % 3 === 1) {
                    vertices[i] = Math.random() * 2;
                }
            }
            groundMesh.geometry.attributes.position.needsUpdate = true;
            scene.add(groundMesh);

            const naturalElements = [];
            for (let i = x - chunkSize / 2; i < x + chunkSize / 2; i += 10) {
                for (let j = z - chunkSize / 2; j < z + chunkSize / 2; j += 10) {
                    if (Math.random() < 0.3) {
                        const elementType = Math.random() < 0.5 ? 'tree' : 'rock';
                        const element = this.createNaturalElement(elementType, i, j);
                        if (element.mesh) {
                            naturalElements.push(element);
                        }
                    }
                }
            }

            this.loadedChunks.push({
                x,
                z,
                mesh: groundMesh,
                buildings: naturalElements,
                isNatural: true
            });

        } else {
            const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
            const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
            groundMesh.rotation.x = -Math.PI / 2;
            groundMesh.position.set(x, 0, z);
            scene.add(groundMesh);

            const buildings = [];
            for (let i = x - chunkSize / 2; i < x + chunkSize / 2; i += 20) {
                for (let j = z - chunkSize / 2; j < z + chunkSize / 2; j += 15) {
                    const height = Math.random() * 20 + 10;

                    const buildingGeometry = new THREE.BoxGeometry(5, height, 5);
                    const buildingMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
                    const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
                    buildingMesh.position.set(i, height / 2, j);
                    scene.add(buildingMesh);

                    const borderMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
                    const borderGeometry = new THREE.BoxGeometry(5.01, height + 0, 5.01);
                    const borderMesh = new THREE.LineSegments(
                        new THREE.EdgesGeometry(borderGeometry),
                        borderMaterial
                    );
                    borderMesh.position.set(i, height / 2, j);
                    scene.add(borderMesh);

                    const buildingShape = new CANNON.Box(new CANNON.Vec3(2.5, height / 2, 2.5));
                    const buildingBody = new CANNON.Body({
                        mass: 0,
                        collisionFilterGroup: 2
                    });
                    buildingBody.addShape(buildingShape);
                    buildingBody.position.set(i, height / 2, j);
                    world.addBody(buildingBody);

                    buildings.push({
                        mesh: buildingMesh,
                        body: buildingBody,
                        border: borderMesh
                    });
                }
            }

            this.loadedChunks.push({
                x,
                z,
                mesh: groundMesh,
                buildings: buildings
            });
        }
    }

    createNaturalElement(type, x, z) {
        const scene = this.game.scene;
        const world = this.game.physicsWorld.world;
        let mesh, body;

        if (type === 'tree') {
            const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 2, 8);
            const trunkMaterial = new THREE.MeshBasicMaterial({ color: 0x4b3621 });
            const trunkMesh = new THREE.Mesh(trunkGeometry, trunkMaterial);

            const leavesGeometry = new THREE.ConeGeometry(2, 4, 8);
            const leavesMaterial = new THREE.MeshBasicMaterial({ color: 0x228B22 });
            const leavesMesh = new THREE.Mesh(leavesGeometry, leavesMaterial);
            leavesMesh.position.y = 3;

            mesh = new THREE.Group();
            mesh.add(trunkMesh);
            mesh.add(leavesMesh);
            mesh.position.set(x, 1, z);
            scene.add(mesh);

            const treeShape = new CANNON.Cylinder(0.5, 0.5, 2, 8);
            body = new CANNON.Body({ mass: 0 });
            body.addShape(treeShape);
            body.position.set(x, 1, z);
            world.addBody(body);

        } else if (type === 'rock') {
            const rockGeometry = new THREE.DodecahedronGeometry(Math.random() * 1 + 0.5);
            const rockMaterial = new THREE.MeshBasicMaterial({ color: 0x808080 });
            mesh = new THREE.Mesh(rockGeometry, rockMaterial);
            mesh.position.set(x, 0.5, z);
            scene.add(mesh);

            const rockShape = new CANNON.Sphere(0.75);
            body = new CANNON.Body({ mass: 0 });
            body.addShape(rockShape);
            body.position.set(x, 0.5, z);
            world.addBody(body);
        }

        return { mesh, body };
    }

    updateTerrain() {
        const vehiclePosition = this.game.vehicle.chassisBody.position;
        const chunkSize = CONSTANTS.CHUNK_SIZE;
        const currentChunkX = Math.floor(vehiclePosition.x / chunkSize) * chunkSize;
        const currentChunkZ = Math.floor(vehiclePosition.z / chunkSize) * chunkSize;

        const adjacentChunks = [
            [0, 0], [chunkSize, 0], [-chunkSize, 0],
            [0, chunkSize], [0, -chunkSize],
            [chunkSize, chunkSize], [chunkSize, -chunkSize],
            [-chunkSize, chunkSize], [-chunkSize, -chunkSize]
        ];

        adjacentChunks.forEach(offset => {
            const [offsetX, offsetZ] = offset;
            const chunkX = currentChunkX + offsetX;
            const chunkZ = currentChunkZ + offsetZ;

            if (!this.loadedChunks.some(chunk => chunk.x === chunkX && chunk.z === chunkZ)) {
                this.createTerrainChunk(chunkX, chunkZ);
            }
        });

        const world = this.game.physicsWorld.world;
        const scene = this.game.scene;

        this.loadedChunks = this.loadedChunks.filter(chunk => {
            const distance = Math.sqrt(
                Math.pow(chunk.x - vehiclePosition.x, 2) +
                Math.pow(chunk.z - vehiclePosition.z, 2)
            );
            if (distance > chunkSize * 2) {
                scene.remove(chunk.mesh);
                chunk.buildings.forEach(building => {
                    if (building.mesh) scene.remove(building.mesh); // building.mesh for natural elements too (wrapper)
                    // Wait, createNaturalElement returns {mesh, body}.
                    // In buildings loop, it pushes {mesh, body, border}.
                    // So `building.mesh` is consistent.

                    if (building.border) {
                        scene.remove(building.border);
                    }
                    if (building.body) {
                        world.removeBody(building.body);
                    }
                });
                return false;
            }
            return true;
        });
    }

    createFollowingSky() {
        const skyGeometry = new THREE.SphereGeometry(1000, 32, 32);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0x87ceeb) },
                offset: { value: 400 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide,
            fog: false
        });

        this.sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.game.scene.add(this.sky);

        const sunGeometry = new THREE.SphereGeometry(50, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, fog: false });
        this.sun = new THREE.Mesh(sunGeometry, sunMaterial);

        const sunGlowGeometry = new THREE.SphereGeometry(60, 32, 32);
        const sunGlowMaterial = new THREE.ShaderMaterial({
            uniforms: { viewVector: { value: this.game.camera.position } },
            vertexShader: `
                uniform vec3 viewVector;
                varying float intensity;
                void main() {
                    vec3 vNormal = normalize(normalMatrix * normal);
                    vec3 vNormel = normalize(normalMatrix * viewVector);
                    intensity = pow(0.6 - dot(vNormal, vNormel), 2.0);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying float intensity;
                void main() {
                    vec3 glow = vec3(1.0, 0.8, 0.0) * intensity;
                    gl_FragColor = vec4(glow, 1.0);
                }
            `,
            side: THREE.FrontSide,
            blending: THREE.AdditiveBlending,
            transparent: true
        });
        const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
        this.sun.add(sunGlow);
        this.sky.add(this.sun);

        const moonGeometry = new THREE.SphereGeometry(40, 32, 32);
        const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, fog: false });
        this.moon = new THREE.Mesh(moonGeometry, moonMaterial);

        const moonGlowGeometry = new THREE.SphereGeometry(45, 32, 32);
        const moonGlowMaterial = new THREE.ShaderMaterial({
            uniforms: { viewVector: { value: this.game.camera.position } },
            vertexShader: sunGlowMaterial.vertexShader, // Reuse vertex shader
            fragmentShader: `
                varying float intensity;
                void main() {
                    vec3 glow = vec3(0.8, 0.8, 0.8) * intensity;
                    gl_FragColor = vec4(glow, 1.0);
                }
            `,
            side: THREE.FrontSide,
            blending: THREE.AdditiveBlending,
            transparent: true
        });
        const moonGlow = new THREE.Mesh(moonGlowGeometry, moonGlowMaterial);
        this.moon.add(moonGlow);
        this.sky.add(this.moon);
    }

    createClouds() {
        const cloudCount = 40;
        for (let i = 0; i < cloudCount; i++) {
            const cloudGroup = new THREE.Group();
            const parts = Math.floor(Math.random() * 4) + 3;
            for (let j = 0; j < parts; j++) {
                const geometry = new THREE.SphereGeometry(Math.random() * 5 + 3, 8, 8);
                const material = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.8,
                    fog: false
                });
                const cloudPart = new THREE.Mesh(geometry, material);
                cloudPart.position.set(
                    Math.random() * 10 - 5,
                    Math.random() * 2,
                    Math.random() * 10 - 5
                );
                cloudGroup.add(cloudPart);
            }

            cloudGroup.position.set(
                Math.random() * 1600 - 800,
                Math.random() * 100 + 200,
                Math.random() * 1600 - 800
            );

            cloudGroup.userData = {
                speed: Math.random() * 0.1 + 0.05,
                direction: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
            };

            this.sky.add(cloudGroup);
        }
    }

    updateSky() {
        if (this.sky && this.game.vehicle) {
            const vehiclePos = this.game.vehicle.chassisBody.position;
            this.sky.position.set(vehiclePos.x, 0, vehiclePos.z);

            if (this.dayNightCycle) {
                const time = Date.now() * 0.000001;
                const dayMix = (Math.sin(time) + 1) * 0.5;

                const uniforms = this.sky.material.uniforms;
                const dayTopColor = new THREE.Color(0x0077ff);
                const dayBottomColor = new THREE.Color(0x87ceeb);
                const nightTopColor = new THREE.Color(0x000033);
                const nightBottomColor = new THREE.Color(0x000066);

                uniforms.topColor.value.lerpColors(nightTopColor, dayTopColor, dayMix);
                uniforms.bottomColor.value.lerpColors(nightBottomColor, dayBottomColor, dayMix);

                const radius = 800;
                const height = Math.sin(time) * radius;
                const depth = Math.cos(time) * radius;

                this.sun.position.set(0, height, -depth);
                this.sun.material.color.setRGB(1, dayMix * 0.5 + 0.5, dayMix * 0.3 + 0.7);
                this.sun.children[0].material.opacity = dayMix;

                this.moon.position.set(0, -height, depth);
                this.moon.material.color.setRGB(
                    0.7 + (1 - dayMix) * 0.3,
                    0.7 + (1 - dayMix) * 0.3,
                    0.7 + (1 - dayMix) * 0.3
                );
                this.moon.children[0].material.opacity = 1 - dayMix;

                const ambientLight = this.game.scene.children.find(child => child instanceof THREE.AmbientLight);
                // Note: The original code used scene.children.find everywhere? No, it just did local var. 
                // But in updateSky it searched.
                if (ambientLight) {
                    ambientLight.intensity = 0.2 + dayMix * 0.8;
                }
            }
            this.updateClouds();
        }
    }

    updateClouds() {
        // Since clouds are children of sky, they move with sky?
        // Original code: "sky.add(cloudGroup)" and "updateClouds" iterates scene.children?
        // Wait, original: `scene.children.forEach(child => ...)` in `updateClouds`?
        // Let's check original `updateClouds` (line 1173)
        // It iterates `scene.children`.
        // BUT `createClouds` (line 283) says `sky.add(cloudGroup)`.
        // If they are added to `sky`, they are NOT in `scene.children` (directly).
        // So `updateClouds` in original code (line 1175) `scene.children.forEach` would NOT find them if they are in `sky`.
        // ERROR IN ORIGINAL CODE?
        // Line 283: `sky.add(cloudGroup);`
        // Line 1175: `scene.children.forEach(...)`.
        // `sky` is in `scene`. `cloudGroup` is in `sky`.
        // So `scene.children` contains `sky`. `sky.children` contains `cloudGroup`.
        // Unless `updateClouds` was meant to iterate `sky.children`?
        // Or maybe `sky` wasn't added to scene properly?
        // Line 1314: `scene.add(sky);`
        // So clouds are grandchildren of scene.
        // `scene.children.forEach` only iterates direct children.
        // So original `updateClouds` did NOTHING? 
        // Wait, let's verify.
        // If original code was broken, I should probably "Optimize" (fix) it.
        // Or maybe I misread where clouds are added.
        // Line 283: `sky.add(cloudGroup);`
        // Line 1175: `scene.children.forEach`
        // Yes, it seems broken in original if that's the case.
        // However, I will fix it by iterating `this.sky.children` if `this.sky` exists.

        if (this.sky) {
            this.sky.children.forEach(child => {
                if (child instanceof THREE.Group && child.children.length > 0 && child.userData.direction) {
                    child.position.add(
                        child.userData.direction.clone().multiplyScalar(child.userData.speed)
                    );

                    const limit = 500;
                    if (child.position.x > limit) child.position.x = -limit;
                    if (child.position.x < -limit) child.position.x = limit;
                    if (child.position.z > limit) child.position.z = -limit;
                    if (child.position.z < -limit) child.position.z = limit;

                    child.position.y += Math.sin(Date.now() * 0.001) * 0.05;
                }
            });
        }
    }
}
