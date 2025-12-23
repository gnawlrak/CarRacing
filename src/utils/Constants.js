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
        YAW_SENSITIVITY: 1200, // Reduced for air
        GROUND_YAW_SENSITIVITY: 6000, // Increased for ground taxi
        MAX_THRUST: 8000,
        REVERSE_THRUST_MAGNITUDE: 3000,
        THROTTLE_STEP: 0.02,
        STALL_SPEED_MS: 18.9, // 68 km/h
        CRUISE_SPEED_MS: 100.3, // 361 km/h
        MAX_SPEED_MS: 111.1, // 400 km/h
        MAX_ALTITUDE: 2530,
        CLIMB_RATE_TARGET: 42,
        TWR: 1.6,
        SCALE: 0.4,
        GEAR_DRAG: 0.05,
        AIRBRAKE_DRAG: 0.15,
        ROLLING_FRICTION: 0.01,
        BRAKE_FORCE: 2500, // Force applied to wheels

        // Physical Gear (RaycastVehicle)
        GEAR: {
            SUSPENSION_STIFFNESS: 50,
            SUSPENSION_REST_LENGTH: 0.5,
            DAMPING_RELAXATION: 2.5,
            DAMPING_COMPRESSION: 2.5,
            FRICTION_SLIP: 1.5,
            ROLL_INFLUENCE: 0.01,
            MAX_SUSPENSION_FORCE: 100000,
            MAX_SUSPENSION_TRAVEL: 0.4,
            WHEEL_RADIUS: 0.3
        }
    },

    // Health System
    HEALTH: {
        VEHICLE_MAX_HEALTH: 200,
        AIRCRAFT_MAX_HEALTH: 100,
        COLLISION_DAMAGE_THRESHOLD: 8000, // Significant impact needed (>28 km/h for car)
        IMPACT_DAMAGE_RATIO: 0.002, // Much lower damage per impulse
        OVERSPEED_THRESHOLD_KMH: 385.6,
        OVERSPEED_DAMAGE_RATE: 5.0 // HP per second
    },

    // Weapons (M61 Vulcan 20mm)
    WEAPON: {
        M61: {
            VELOCITY: 1030, // m/s
            DAMAGE: 1.5, // 20mm round damage
            RPM_LOW: 4000,
            RPM_HIGH: 6000,
            MAX_RANGE: 2000, // meters
            SHAKE_INTENSITY: 0.1,
            FLASH_SCALE: 1.5,
            IMPACT_COLOR_SPARK: 0xffff44,
            IMPACT_COLOR_DUST: 0x8b4513 // SaddleBrown for dust
        }
    },

    // Hover Mode (VTOL)
    HOVER: {
        MAX_SPEED: 50, // km/h
        FORCE: 15000,
        ALTITUDE_SPEED: 10,
        DAMPING: 0.95, // Linear/Angular damping in hover
        TILT_LIMIT: Math.PI / 12, // 15 degrees tilt when moving
        YAW_SENSITIVITY: 8000 // Higher for precise hover rotation
    },

    // Chunk System Optimization
    CHUNKS: {
        VIEW_DISTANCE: 3, // radius in chunks
        UNLOAD_DISTANCE: 5,
        CACHE_RADIUS: 1 // chunks always kept active
    },

    // Debug
    DEBUG: true
};
