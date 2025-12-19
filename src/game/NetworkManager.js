import io from 'socket.io-client';
import { CONSTANTS } from '../utils/Constants.js';

export class NetworkManager {
    constructor(game) {
        this.game = game; // Reference to main game
        this.socket = null;
        this.playerId = '';
    }

    init() {
        this.socket = io('/', {
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            if (CONSTANTS.DEBUG) console.log('Connected to server');
        });

        this.socket.on('players', players => {
            if (CONSTANTS.DEBUG) console.log('Received players list:', players);
            players.forEach(player => {
                if (player.id !== this.playerId) {
                    this.game.initOtherPlayer(player);
                }
            });
        });

        this.socket.on('player_joined', data => {
            if (CONSTANTS.DEBUG) console.log('Player joined:', data);
            if (data.id !== this.playerId) {
                this.game.initOtherPlayer(data);
            }
        });

        this.socket.on('player_left', socketId => {
            if (CONSTANTS.DEBUG) console.log('Player left:', socketId);
            this.game.removeRemotePlayer(socketId);
        });

        this.socket.on('player_moved', data => {
            if (CONSTANTS.DEBUG) console.log('Player moved:', data);
            if (data.id === this.playerId) return;
            this.game.updateRemotePlayer(data);
        });

        this.socket.on('join_failed', message => {
            this.game.uiManager.setJoinErrorMessage(message);
        });

        // Expose joinGame to window as in original
        window.joinGame = () => this.joinGame();
    }

    joinGame() {
        const idInput = document.getElementById('player-id');
        this.playerId = idInput.value.trim();

        if (this.playerId) {
            if (CONSTANTS.DEBUG) console.log('Joining game, ID:', this.playerId);
            // Original emits 'join' with simple string
            this.socket.emit('join', this.playerId);

            const loginScreen = document.getElementById('login-screen');
            if (loginScreen) loginScreen.style.display = 'none';

            // Create player label for self
            this.game.createPlayerLabelForSelf(this.playerId);

            // Trigger collision protection
            if (this.game.vehicle) {
                this.game.vehicle.provideTempCollisionProtection(null, 5000);
            }
        } else {
            this.game.uiManager.setJoinErrorMessage('请输入有效的ID');
        }
    }

    updatePosition(position, quaternion) {
        if (this.socket && this.game.vehicle && this.game.vehicle.chassisMesh) {
            this.socket.emit('update_position', {
                position: position,
                quaternion: quaternion
            });
        }
    }
}
