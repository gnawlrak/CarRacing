import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { CONSTANTS } from '../utils/Constants.js';

export class SceneManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.composer = null;
        this.afterimagePass = null;

        // FPS and Delta tracking
        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.currentFPS = 60;
    }

    init() {
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.copy(CONSTANTS.CAMERA.INITIAL_OFFSET); // Temp until vehicle set

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);

        // Post-processing
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        this.afterimagePass = new AfterimagePass();
        // Initial damp. We'll update this dynamically.
        this.afterimagePass.uniforms['damp'].value = 0.96;
        this.composer.addPass(this.afterimagePass);

        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    render() {
        // Calculate FPS
        const now = performance.now();
        const delta = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;

        if (delta > 0) {
            const instantFPS = 1 / delta;
            // Smooth FPS a bit
            this.currentFPS = this.currentFPS * 0.9 + instantFPS * 0.1;
        }

        // Adjust motion blur (Afterimage damp)
        const desiredBlurDuration = 1 / (this.currentFPS * 2);
        const d = Math.pow(0.1, 1 / (this.currentFPS * desiredBlurDuration));
        this.afterimagePass.uniforms['damp'].value = Math.max(0.7, Math.min(0.98, d));

        // Multi-pass rendering for selective motion blur
        this.renderer.autoClear = false;
        this.renderer.clear();

        // 1. Render World (Layer 0) with Motion Blur
        this.camera.layers.set(0);
        this.composer.render();

        // 2. Render UI/Labels (Layer 1) without Motion Blur
        // Clear depth so labels always appear on top of correctly depth-tested world
        this.renderer.clearDepth();
        this.camera.layers.set(1);
        this.renderer.render(this.scene, this.camera);

        // Reset camera and renderer
        this.camera.layers.set(0); // Default back to 0
        this.renderer.autoClear = true;
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (this.composer) {
            this.composer.setSize(window.innerWidth, window.innerHeight);
        }
    }
}
