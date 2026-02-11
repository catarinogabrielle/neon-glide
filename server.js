const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

let rooms = {};

function checkRoundOver(roomId) {
    if (!rooms[roomId]) return;

    let anyoneAlive = false;
    for (let id in rooms[roomId].players) {
        if (!rooms[roomId].players[id].dead) {
            anyoneAlive = true;
            break;
        }
    }

    if (!anyoneAlive) {
        io.to(roomId).emit('roundOver');
    }
}

function broadcastLeader(roomId) {
    if (!rooms[roomId]) return;

    let ranking = [];
    for (let id in rooms[roomId].players) {
        let p = rooms[roomId].players[id];
        ranking.push({
            name: p.name,
            score: p.score,
            dist: p.dist,
            dead: p.dead,
            color: p.color
        });
    }
    ranking.sort((a, b) => b.dist - a.dist);

    let leader = ranking[0] || { name: '---', score: 0 };

    io.to(roomId).emit('updateLeader', { top: leader, list: ranking });
}

function updateLobby(roomId) {
    if (rooms[roomId]) {
        io.to(roomId).emit('lobbyUpdate', rooms[roomId].players);
    }
}

io.on('connection', (socket) => {
    console.log('Piloto conectado:', socket.id);

    socket.on('joinOrCreateRoom', (data) => {
        const roomId = String(data.roomId).trim().toUpperCase();
        let isHost = false;

        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                hostId: socket.id,
                state: 'waiting',
                difficulty: data.difficulty || 'medio',
                blueprint: Array.from({ length: 2000 }, () => Math.random()),
                players: {}
            };
            isHost = true;
            console.log(`Sala [${roomId}] CRIADA.`);
        } else {
            if (rooms[roomId].state === 'playing') {
                socket.emit('roomError', 'O jogo já começou!');
                return;
            }
        }

        socket.join(roomId);
        socket.roomId = roomId;

        rooms[roomId].players[socket.id] = {
            id: socket.id,
            isHost: isHost,
            y: 300, dist: 0,
            color: data.color || '#00ffff',
            name: data.name || 'Player',
            score: 0, dead: false
        };

        socket.emit('roomJoined', {
            roomId: roomId,
            blueprint: rooms[roomId].blueprint,
            difficulty: rooms[roomId].difficulty,
            isHost: isHost
        });

        socket.emit('currentPlayers', rooms[roomId].players);

        socket.broadcast.to(roomId).emit('newPlayer', rooms[roomId].players[socket.id]);

        updateLobby(roomId);
    });

    socket.on('startGame', () => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId] && rooms[roomId].hostId === socket.id) {
            rooms[roomId].state = 'playing';
            io.to(roomId).emit('gameStarted');
        }
    });

    socket.on('returnToLobby', () => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId] && rooms[roomId].hostId === socket.id) {
            rooms[roomId].state = 'waiting';
            rooms[roomId].blueprint = Array.from({ length: 2000 }, () => Math.random());

            for (let id in rooms[roomId].players) {
                rooms[roomId].players[id].score = 0;
                rooms[roomId].players[id].dist = 0;
                rooms[roomId].players[id].dead = false;
                rooms[roomId].players[id].y = 300;
            }

            io.to(roomId).emit('returnedToLobby', { blueprint: rooms[roomId].blueprint });
            updateLobby(roomId);
            broadcastLeader(roomId);
        }
    });

    socket.on('move', (data) => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId] && rooms[roomId].players[socket.id]) {
            rooms[roomId].players[socket.id].y = data.y;
            rooms[roomId].players[socket.id].dist = data.dist;
            socket.broadcast.to(roomId).emit('updatePlayer', { id: socket.id, y: data.y, dist: data.dist });
        }
    });

    socket.on('scoreUpdate', (newScore) => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId] && rooms[roomId].players[socket.id]) {
            rooms[roomId].players[socket.id].score = newScore;
            broadcastLeader(roomId);
        }
    });

    socket.on('died', () => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId] && rooms[roomId].players[socket.id]) {
            rooms[roomId].players[socket.id].dead = true;
            io.to(roomId).emit('playerDied', socket.id);
            checkRoundOver(roomId);
        }
    });

    socket.on('disconnect', () => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            delete rooms[roomId].players[socket.id];
            io.to(roomId).emit('removePlayer', socket.id);
            updateLobby(roomId);
            broadcastLeader(roomId);
            checkRoundOver(roomId);

            if (Object.keys(rooms[roomId].players).length === 0) {
                delete rooms[roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor Final rodando na porta ${PORT}`);
});