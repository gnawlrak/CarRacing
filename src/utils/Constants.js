import * as THREE from 'three';

export const CONSTANTS = {
    // World Generation
    CHUNK_SIZE: 50,
    WORLD_BOUNDS: {
        min: -500,
        max: 500
    },
    SPAWN_POSITION: { x: 0, y: 1, z: 0 },

    // Physics & Vehicle
    GRAVITY: -9.82,
    MAX_SPEED: 350, // km/h
    BOOST_MAX_SPEED: 450, // km/h
    DRIFT: {
        MAX_FACTOR: 50,
        INCREASE_RATE: 2,
        DECREASE_RATE: 0.05,
        FACTOR: 50
    },

    // Camera
    CAMERA: {
        INITIAL_OFFSET: new THREE.Vector3(-5, 2, 0),
        FIRST_PERSON_OFFSET: new THREE.Vector3(0, 0.8, 0),
        PITCH_LIMIT: Math.PI / 4
    },

    // Aerodynamics
    AERO: {
        LIFT_COEFFICIENT: 0.5,
        DRAG_COEFFICIENT: 0.05,
        THRUST_FORCE: 15000,
        STABILIZATION_FORCE: 500
    },

    // Debug
    DEBUG: true
};
