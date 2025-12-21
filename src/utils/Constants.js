import * as THREE from 'three';

export const CONSTANTS = {
    // World Generation
    CHUNK_SIZE: 50,
    WORLD_BOUNDS: {
        min: -500,
        max: 500
    },
    SPAWN_POSITION: { x: 0, y: 1, z: 0 },
    KNOTS_TO_MS: 0.514444,
    INITIAL_AIRCRAFT_SPEED_KNOTS: 200,

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
        AIR_DENSITY: 1.225,
        WING_AREA: 15.0,
        SIDE_AREA: 5.0,
        CL_SLOPE: 4.5, // Lift coefficient slope (per radian)
        CD0: 0.02,     // Parasitic drag coefficient
        K: 0.08,       // Induced drag coefficient (K * CL^2)
        CC_SLOPE: 1.5, // Side force slope
        LIFT_COEFFICIENT: 0.5, // Legacy
        DRAG_COEFFICIENT: 0.05, // Legacy
        THRUST_FORCE: 15000,
        STABILIZATION_FORCE: 500,
        ROLL_STABILIZATION_FORCE: 2500,
        PITCH_STABILIZATION_FORCE: 3000,
        AERO_DAMPING: 2.0, // High damping for "crispy" feel
        PITCH_SENSITIVITY: 6000,
        ROLL_SENSITIVITY: 7000,
        YAW_SENSITIVITY: 2500,
        MAX_THRUST: 5376, // 1.095 * 500kg * 9.82
        THROTTLE_STEP: 0.01,
        STALL_SPEED_MS: 18.9, // 68 km/h
        CRUISE_SPEED_MS: 100.3, // 361 km/h
        MAX_SPEED_MS: 111.1, // 400 km/h
        MAX_ALTITUDE: 2530,
        CLIMB_RATE_TARGET: 42,
        TWR: 1.095,
        SCALE: 0.4,
        GEAR_DRAG: 0.05,
        AIRBRAKE_DRAG: 0.15,
        ROLLING_FRICTION: 0.01,
        BRAKE_FORCE: 2000
    },

    // Debug
    DEBUG: true
};
