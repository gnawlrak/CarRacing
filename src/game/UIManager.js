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

    createSettingsMenu(onVehicleChange) {
        const settingsContainer = document.createElement('div');
        settingsContainer.id = 'settings-container';
        settingsContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
        `;

        const settingsBtn = document.createElement('button');
        settingsBtn.textContent = '⚙️ Settings';
        settingsBtn.style.cssText = `
            padding: 8px 16px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border: 1px solid #44ff44;
            border-radius: 4px;
            cursor: pointer;
            font-family: Arial, sans-serif;
            margin-bottom: 5px;
        `;

        const menu = document.createElement('div');
        menu.style.cssText = `
            display: none;
            background: rgba(0, 0, 0, 0.9);
            border: 1px solid #44ff44;
            border-radius: 4px;
            overflow: hidden;
            flex-direction: column;
        `;

        const createOption = (text, type) => {
            const opt = document.createElement('button');
            opt.textContent = text;
            opt.style.cssText = `
                padding: 10px 20px;
                background: transparent;
                color: white;
                border: none;
                border-bottom: 1px solid #333;
                cursor: pointer;
                text-align: left;
                width: 150px;
                font-family: Arial, sans-serif;
            `;
            opt.onmouseover = () => opt.style.background = '#44ff4422';
            opt.onmouseout = () => opt.style.background = 'transparent';
            opt.onclick = () => {
                onVehicleChange(type);
                menu.style.display = 'none';
            };
            return opt;
        };

        menu.appendChild(createOption('🚗 Ground Vehicle', 'car'));
        menu.appendChild(createOption('✈️ Air Vehicle', 'fixedwing'));

        settingsBtn.onclick = () => {
            menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
        };

        settingsContainer.appendChild(settingsBtn);
        settingsContainer.appendChild(menu);
        document.body.appendChild(settingsContainer);
    }

    updateSpeedometer(speedKmh, driveState, isBoosting) {
        if (!this.speedValue) return;

        // Hide speedometer/gear if in FixedWing
        const isAir = this.game && this.game.vehicle && this.game.vehicle.type === 'FixedWing';
        if (this.speedometer) this.speedometer.style.display = isAir ? 'none' : 'flex';

        if (!isAir) {
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
        } else {
            this.updateHUD();
        }
    }

    createFlightHUD(game) {
        this.game = game;
        const hud = document.createElement('div');
        hud.id = 'flight-hud';
        hud.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            display: none;
            color: #00ff00;
            font-family: 'Courier New', Courier, monospace;
            text-shadow: 0 0 5px #00ff00;
            z-index: 999;
        `;

        // 1. Center Crosshair (Flight Path Marker / Gun Cross)
        const crosshair = document.createElement('div');
        crosshair.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 40px;
            height: 40px;
            border: 2px solid #00ff00;
            border-radius: 50%;
        `;
        const crossDot = document.createElement('div');
        crossDot.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: 4px;
            height: 4px;
            background: #00ff00;
            border-radius: 50%;
            transform: translate(-50%, -50%);
        `;
        crosshair.appendChild(crossDot);
        hud.appendChild(crosshair);

        // 2. Speed Tape (Left)
        const speedContainer = document.createElement('div');
        speedContainer.style.cssText = `
            position: absolute;
            left: 15%;
            top: 50%;
            transform: translateY(-50%);
            border: 2px solid #00ff00;
            padding: 5px 15px;
            background: rgba(0, 255, 0, 0.1);
            text-align: right;
            width: 80px;
        `;
        this.hudSpeedValue = document.createElement('div');
        this.hudSpeedValue.style.fontSize = '24px';
        this.hudSpeedValue.style.fontWeight = 'bold';
        this.hudSpeedValue.textContent = '000';

        const speedLabel = document.createElement('div');
        speedLabel.textContent = 'KCAS';
        speedLabel.style.fontSize = '12px';
        speedLabel.style.position = 'absolute';
        speedLabel.style.bottom = '-20px';
        speedLabel.style.left = '0';

        speedContainer.appendChild(this.hudSpeedValue);
        speedContainer.appendChild(speedLabel);
        hud.appendChild(speedContainer);

        // 3. Altitude Tape (Right)
        const altContainer = document.createElement('div');
        altContainer.style.cssText = `
            position: absolute;
            right: 15%;
            top: 50%;
            transform: translateY(-50%);
            border: 2px solid #00ff00;
            padding: 5px 15px;
            background: rgba(0, 255, 0, 0.1);
            text-align: left;
            width: 80px;
        `;
        this.hudAltValue = document.createElement('div');
        this.hudAltValue.style.fontSize = '24px';
        this.hudAltValue.style.fontWeight = 'bold';
        this.hudAltValue.textContent = '00000';

        const altLabel = document.createElement('div');
        altLabel.textContent = 'ALT';
        altLabel.style.fontSize = '12px';
        altLabel.style.position = 'absolute';
        altLabel.style.bottom = '-20px';
        altLabel.style.right = '0';

        altContainer.appendChild(this.hudAltValue);
        altContainer.appendChild(altLabel);
        hud.appendChild(altContainer);

        // 4. Heading (Top)
        this.hudHeading = document.createElement('div');
        this.hudHeading.style.cssText = `
            position: absolute;
            top: 10%;
            left: 50%;
            transform: translateX(-50%);
            font-size: 20px;
            border-bottom: 2px solid #00ff00;
            padding-bottom: 5px;
        `;
        hud.appendChild(this.hudHeading);

        this.pitchLadder = document.createElement('div');
        this.pitchLadder.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 400px;
            height: 400px;
            overflow: hidden;
        `;
        this.ladderContainer = document.createElement('div');
        this.ladderContainer.style.position = 'absolute';
        this.ladderContainer.style.width = '100%';
        this.ladderContainer.style.height = '1000px';
        this.ladderContainer.style.top = '50%';
        this.ladderContainer.style.left = '0';
        this.ladderContainer.style.transform = 'translateY(-50%)';

        // Create lines for every 5 degrees from -90 to +90
        for (let a = -90; a <= 90; a += 5) {
            if (a === 0) continue; // Skip horizon, crosshair is there
            const line = document.createElement('div');
            const isPositive = a > 0;
            line.style.cssText = `
                position: absolute;
                left: 50%;
                top: ${500 - a * 10}px; 
                width: 100px;
                height: 2px;
                border-top: 2px ${isPositive ? 'solid' : 'dashed'} #00ff00;
                transform: translateX(-50%);
            `;
            const label = document.createElement('div');
            label.textContent = Math.abs(a);
            label.style.cssText = `
                position: absolute;
                left: -25px;
                top: -10px;
                font-size: 14px;
            `;
            line.appendChild(label);
            const labelRight = label.cloneNode(true);
            labelRight.style.left = '105px';
            line.appendChild(labelRight);

            this.ladderContainer.appendChild(line);
        }

        this.pitchLadder.appendChild(this.ladderContainer);
        hud.appendChild(this.pitchLadder);

        // 6. Throttle/RPM (Bottom Left)
        this.hudThrottle = document.createElement('div');
        this.hudThrottle.style.cssText = `
            position: absolute;
            bottom: 15%;
            left: 15%;
            font-size: 18px;
        `;
        hud.appendChild(this.hudThrottle);

        // 7. System Status Indicators (Bottom Right)
        this.hudSystems = document.createElement('div');
        this.hudSystems.style.cssText = `
            position: absolute;
            bottom: 15%;
            right: 15%;
            font-size: 18px;
            text-align: right;
            line-height: 1.4;
        `;
        hud.appendChild(this.hudSystems);

        // 8. Flight Notifications (Top Middle)
        this.hudNotify = document.createElement('div');
        this.hudNotify.style.cssText = `
            position: absolute;
            top: 20%;
            left: 50%;
            transform: translateX(-50%);
            font-size: 32px;
            font-weight: bold;
            color: #ffff00;
            text-shadow: 0 0 10px #ffff00;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        hud.appendChild(this.hudNotify);

        document.body.appendChild(hud);
        this.hud = hud;
    }

    updateHUD() {
        if (!this.hud || !this.game.vehicle) return;

        const vehicle = this.game.vehicle;
        const isAir = vehicle.type === 'FixedWing';
        this.hud.style.display = isAir ? 'block' : 'none';

        if (!isAir) return;

        // Speed in Knots
        const speedKnots = Math.round(vehicle.chassisBody.velocity.length() / CONSTANTS.KNOTS_TO_MS);
        this.hudSpeedValue.textContent = speedKnots.toString().padStart(3, '0');

        // Altitude in Feet (approximate)
        const altFeet = Math.round(vehicle.chassisBody.position.y * 3.28);
        this.hudAltValue.textContent = altFeet.toString().padStart(5, '0');

        // Flight attitude
        // Order: Y(Yaw), Z(Pitch), X(Roll) for a system where X is forward and Y is up
        const euler = new THREE.Euler().setFromQuaternion(vehicle.chassisMesh.quaternion, 'YZX');
        let heading = Math.round((-euler.y * 180 / Math.PI + 360) % 360);
        this.hudHeading.textContent = heading.toString().padStart(3, '0');

        // Pitch and Roll based on physics axes (Z=Pitch, X=Roll)
        const pitchDeg = euler.z * 180 / Math.PI;
        const rollRad = euler.x;

        // Throttle
        const rpm = Math.round(vehicle.throttle * 100);
        this.hudThrottle.textContent = vehicle.afterburner ? 'THR: AB' : `THR: ${rpm}%`;

        // Update Pitch Ladder
        // Each degree is 10px. 
        this.ladderContainer.style.top = `calc(50% + ${pitchDeg * 10}px)`;
        this.pitchLadder.style.transform = `translate(-50%, -50%) rotate(${-rollRad}rad)`;

        // Update System Indicators
        let sysText = "";
        if (!vehicle.gearDown) sysText += "GEAR UP\n";
        if (vehicle.airbrakeActive) sysText += "AIRBRAKE\n";
        if (vehicle.braking) sysText += '<span style="color: #ff4444">BRAKES</span>\n';
        this.hudSystems.innerHTML = sysText;
    }

    showFlightNotification(message, duration = 2000) {
        if (!this.hudNotify) return;
        this.hudNotify.textContent = message;
        this.hudNotify.style.opacity = '1';

        if (this.notifyTimer) clearTimeout(this.notifyTimer);
        this.notifyTimer = setTimeout(() => {
            this.hudNotify.style.opacity = '0';
        }, duration);
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
