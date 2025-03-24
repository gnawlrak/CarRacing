const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const path = require('path');

// 添加静态文件服务
app.use(express.static(path.join(__dirname, '../dist')));

// 添加根路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// 定义出生点区域
const SPAWN_CENTER = { x: 0, y: 1, z: 0 };
const SPAWN_RADIUS = 20;

// 生成随机出生点
function generateRandomSpawnPoint() {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * SPAWN_RADIUS;
    
    return {
        x: SPAWN_CENTER.x + radius * Math.cos(angle),
        y: SPAWN_CENTER.y,
        z: SPAWN_CENTER.z + radius * Math.sin(angle)
    };
}

const players = new Map();

io.on('connection', socket => {
    console.log('New client connected:', socket.id);

    socket.on('join', playerId => {
        console.log('Player joining:', playerId);
        
        if(players.size >= 5) {
            console.log('Game full, rejecting player:', playerId);
            socket.emit('join_failed', '游戏人数已满');
            return;
        }
        
        // 生成随机出生点
        const spawnPosition = generateRandomSpawnPoint();
        
        // 存储玩家信息
        players.set(socket.id, {
            id: playerId,
            socketId: socket.id,
            position: spawnPosition,
            quaternion: { x: 0, y: 0, z: 0, w: 1 }
        });
        
        // 发送现有玩家列表给新玩家
        const playersList = Array.from(players.values());
        console.log('Sending players list:', playersList);
        socket.emit('players', playersList);
        
        // 通知其他玩家有新玩家加入
        socket.broadcast.emit('player_joined', {
            id: playerId,
            socketId: socket.id,
            position: spawnPosition,
            quaternion: { x: 0, y: 0, z: 0, w: 1 }
        });
    });

    socket.on('update_position', data => {
        const player = players.get(socket.id);
        if(player) {
            player.position = data.position;
            player.quaternion = data.quaternion;

            // 计算速度 (假设客户端发送位置更新的频率足够高，可以近似计算速度)
            const previousPosition = player.positionBeforeUpdate || player.position; // 初始位置
            const currentPosition = data.position;

            const dx = currentPosition.x - previousPosition.x;
            const dy = currentPosition.y - previousPosition.y;
            const dz = currentPosition.z - previousPosition.z;

            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            // 假设更新频率为 60 FPS (可以根据实际情况调整)
            const timeStep = 1/60;
            const speed = distance / timeStep;
            const speedKmh = speed * 3.6;

            const MAX_SPEED = 350; // 最大速度 (km/h)

            if (speedKmh > MAX_SPEED) {
                console.log(`Server Speed Limit Exceeded for player ${player.id}: ${speedKmh.toFixed(2)} km/h`);
                // 向客户端发送超速警告，并指示客户端减速
                socket.emit('speed_limit_exceeded');
            }

            // 更新玩家位置
            player.position = data.position;
            player.quaternion = data.quaternion;
            // 保存当前位置，用于下次速度计算
            player.positionBeforeUpdate = currentPosition;

            socket.broadcast.emit('player_moved', {
                id: player.id,
                position: data.position,
                quaternion: data.quaternion
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        const player = players.get(socket.id);
        if(player) {
            players.delete(socket.id);
            io.emit('player_left', socket.id);
        }
    });
});

const PORT = process.env.PORT || 3001;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
