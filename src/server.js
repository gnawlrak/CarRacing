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
        
        // 存储玩家信息
        players.set(socket.id, {
            id: playerId,
            socketId: socket.id,
            position: { x: 0, y: 1, z: 0 },
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
            position: { x: 0, y: 1, z: 0 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 }
        });
    });

    socket.on('update_position', data => {
        const player = players.get(socket.id);
        if(player) {
            player.position = data.position;
            player.quaternion = data.quaternion;
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
