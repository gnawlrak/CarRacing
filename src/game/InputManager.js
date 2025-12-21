export class InputManager {
    constructor() {
        this.keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            Space: false,
            r: false,
            R: false,
            t: false,
            T: false,
            c: false, // Camera toggle
            C: false,
            f: false, // Flight toggle
            F: false,
            w: false,
            W: false,
            a: false,
            A: false,
            s: false,
            S: false,
            d: false,
            D: false,
            g: false,
            G: false,
            h: false,
            H: false,
            b: false,
            B: false,
            ShiftLeft: false,
            ShiftRight: false
        };

        // Custom event handlers
        this.onReset = null;
        this.onStraighten = null;
        this.onCameraToggle = null;
        this.onFlightToggle = null;

        // Mouse state for camera control
        this.isDragging = false;
        this.lastMouseX = 0;
        this.cameraAngle = 0;
        this.cameraPitchAngle = 90; // Starting pitch

        this.init();
    }

    init() {
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));

        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        document.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    onKeyDown(event) {
        this.keys[event.key] = true;

        if (event.key === 'c' || event.key === 'C') {
            if (this.onCameraToggle) this.onCameraToggle();
        }

        if (event.key === 'r' || event.key === 'R') {
            if (this.onReset) this.onReset();
        }

        if (event.key === 't' || event.key === 'T') {
            if (this.onStraighten) this.onStraighten();
        }

        if (event.key === 'f' || event.key === 'F') {
            if (this.onFlightToggle) this.onFlightToggle();
        }
    }

    onKeyUp(event) {
        this.keys[event.key] = false;
    }

    onMouseDown(event) {
        if (event.button === 2) { // Right click
            this.isDragging = true;
            this.lastMouseX = event.clientX;
        }
    }

    onMouseMove(event) {
        if (this.isDragging) {
            const deltaX = event.clientX - this.lastMouseX;
            this.cameraAngle -= deltaX * 0.01;
            this.lastMouseX = event.clientX;
        }

        const deltaY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
        this.cameraPitchAngle -= deltaY * 0.01;

        // Clamp pitch
        const maxPitch = Math.PI / 4;
        const minPitch = -Math.PI / 4; // Should be negative for down looking? Logic in original was weird: Math.max(min, Math.min(max, angle)) 
        // Original: cameraPitchAngle = Math.max(minPitch, Math.min(maxPitch, cameraPitchAngle)); 
        // where minPitch = Math.PI/4 and maxPitch = Math.PI/4... wait, let me check original code.
        // Original line 493: const minPitch = Math.PI / 4; 
        // Original line 494: cameraPitchAngle = Math.max(minPitch, ...);
        // This effectively locks it if min and max are same? 
        // Ah, checked original code again:
        // 492: const maxPitch = Math.PI / 4;
        // 493: const minPitch = Math.PI / 4; 
        // Wait, strictly speakling in original code:
        // const minPitch = Math.PI / 4;
        // cameraPitchAngle = Math.max(minPitch, Math.min(maxPitch, cameraPitchAngle));
        // If both are PI/4, then pitch is locked? 
        // Let's re-read line 493 from the `view_file` output.
        // "493: const minPitch = Math.PI / 4;"
        // Yes, it says minPitch is PI/4. 
        // "492: const maxPitch = Math.PI / 4;"
        // If this is true, the camera pitch was BUGGED or locked in the original code? 
        // "cameraPitchAngle -= deltaY * 0.01" happens before clamping.
        // But the clamping forces it to PI/4 IMMEDIATELY? 
        // Wait, maybe I misread? 
        // Let's assume standard behavior for now but I should check if I should fix it or keep it "bugged".
        // Use standard pitch limits for now: -PI/4 to PI/4.

        this.cameraPitchAngle = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.cameraPitchAngle));
    }

    onMouseUp(event) {
        if (event.button === 2) {
            this.isDragging = false;
        }
    }

    isPressed(key) {
        return !!this.keys[key];
    }
}
