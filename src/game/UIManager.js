import { CONSTANTS } from '../utils/Constants.js';
import * as THREE from 'three';

export class UIManager {
    constructor() {
        this.speedometer = null;
        this.gearDisplay = null;
        this.speedValue = null;
        this.speedIndicator = null;
    }

    createSpeedometer() {
        const speedometer = document.createElement('div');
        speedometer.id = 'speedometer';
        speedometer.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 150px;
            height: 150px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 50%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            font-family: Arial, sans-serif;
            z-index: 1000;
        `;

        this.gearDisplay = document.createElement('div');
        this.gearDisplay.id = 'gear-display';
        this.gearDisplay.style.cssText = `
            position: absolute;
            top: 20px;
            font-size: 24px;
            font-weight: bold;
            color: #44ff44;
        `;

        this.speedValue = document.createElement('div');
        this.speedValue.id = 'speed-value';
        this.speedValue.style.cssText = `
            font-size: 36px;
            font-weight: bold;
            margin-bottom: 5px;
        `;

        const speedUnit = document.createElement('div');
        speedUnit.textContent = 'km/h';
        speedUnit.style.cssText = `
            font-size: 14px;
            opacity: 0.8;
        `;

        this.speedIndicator = document.createElement('div');
        this.speedIndicator.id = 'speed-indicator';
        this.speedIndicator.style.cssText = `
            position: absolute;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            border-radius: 50%;
            clip-path: polygon(50% 50%, 50% 0, 100% 0, 100% 100%, 0 100%, 0 0, 50% 0);
            background: linear-gradient(90deg, #44ff44 0%, #ffff44 50%, #ff4444 100%);
            opacity: 0.3;
            transform-origin: center;
        `;

        // Speed marks
        const speedMarks = document.createElement('div');
        speedMarks.style.cssText = `
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
        `;

        speedometer.appendChild(this.speedIndicator);
        speedometer.appendChild(this.gearDisplay);
        speedometer.appendChild(this.speedValue);
        speedometer.appendChild(speedUnit);
        speedometer.appendChild(speedMarks);
        document.body.appendChild(speedometer);
        this.speedometer = speedometer;

        // Disable context menu globally as in original
        document.addEventListener('contextmenu', event => event.preventDefault());
    }

    updateSpeedometer(speedKmh, driveState, isBoosting) {
        if (!this.speedValue) return;

        this.speedValue.textContent = speedKmh;

        // Update background based on boost
        if (this.speedometer) {
            this.speedometer.style.background = isBoosting ? 'rgba(255, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.7)';
        }

        // Update Gear
        if (this.gearDisplay) {
            this.gearDisplay.textContent = driveState;
            switch (driveState) {
                case 'D':
                    this.gearDisplay.style.color = '#44ff44';
                    break;
                case 'R':
                    this.gearDisplay.style.color = '#ff4444';
                    break;
                case 'N':
                    this.gearDisplay.style.color = '#ffff44';
                    break;
            }
        }
    }

    createPlayerLabel(id) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        context.fillStyle = '#ffffff';
        context.font = '32px Arial';
        context.textAlign = 'center';
        context.fillText(id, 128, 40);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2, 0.5, 1);
        sprite.position.y = 2;
        sprite.layers.set(1); // Set to layer 1 to exclude from motion blur post-processing

        return sprite;
    }

    setJoinErrorMessage(message) {
        const el = document.getElementById('error-message');
        if (el) el.textContent = message;
    }
}
