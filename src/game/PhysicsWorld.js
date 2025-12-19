import * as CANNON from 'cannon-es';
import { CONSTANTS } from '../utils/Constants.js';

export class PhysicsWorld {
    constructor() {
        this.world = null;
    }

    init() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, CONSTANTS.GRAVITY, 0);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.defaultContactMaterial.friction = 0.2;
        this.world.defaultContactMaterial.restitution = 0.1;
        this.world.solver.iterations = 10;

        // Ground (Physics only, mesh is in Environment)
        // Original code created groundBody in init()
        // Wait, original `init()` created `groundBody` at line 110. 
        // AND `createTerrainChunk` creates ground meshes.
        // Wait, line 110: `groundShape = new CANNON.Plane(); ... world.addBody(groundBody);`
        // But `createTerrainChunk` also creates ground meshes?
        // Line 109: `const groundShape = new CANNON.Plane();`
        // Line 110: `const groundBody = new CANNON.Body({ mass: 0 });`
        // Line 113: `world.addBody(groundBody);`
        // This seems to be an infinite plane for physics? 
        // But `createTerrainChunk` creates visually distinct chunks.
        // Does `createTerrainChunk` create physics for ground?
        // In `createTerrainChunk` (line 287):
        // It creates `groundMesh` (THREE.Mesh).
        // It creates `buildingBody` (CANNON.Body).
        // It does NOT create ground physics bodies in `createTerrainChunk`!
        // So the infinite plane (line 110) handles All ground collisions?
        // Yes, `new CANNON.Plane()` is infinite.
        // So we just need one ground body in PhysicsWorld.

        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(groundBody);
    }

    step() {
        // Original used 1/120 timeStep
        const timeStep = 1 / 120;
        this.world.step(timeStep);
    }
}
