const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

let players = {};

const PIPE_SPAWN_RATE = 1300;

setInterval(() => {
    const gap = 140;
    const positionY = Math.random() * (600 - 300) + 100;

    const pipe = {
        id: Date.now(),
        y: positionY,
        gap: gap
    };

    io.emit('newPipe', pipe);
}, PIPE_SPAWN_RATE);

function broadcastLeader() {
    let leader = { name: '---', score: -1 };

    for (let id in players) {
        if (players[id].score > leader.score) {
            leader = { name: players[id].name, score: players[id].score };
        }
    }

    io.emit('updateLeader', leader);
}

io.on('connection', (socket) => {
    console.log('Conectado:', socket.id);

    socket.on('start', (data) => {
        players[socket.id] = {
            id: socket.id,
            x: 100,
            y: 300,
            color: data.color || '#00ffff',
            name: data.name || 'Player',
            score: 0,
            dead: false
        };

        socket.emit('currentPlayers', players);

        socket.broadcast.emit('newPlayer', players[socket.id]);

        broadcastLeader();
    });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].y = data.y;
            players[socket.id].velocity = data.v;
            socket.broadcast.emit('updatePlayer', { id: socket.id, y: data.y, v: data.v });
        }
    });

    socket.on('scoreUpdate', (newScore) => {
        if (players[socket.id]) {
            players[socket.id].score = newScore;
            broadcastLeader();
        }
    });

    socket.on('died', () => {
        if (players[socket.id]) {
            players[socket.id].dead = true;
            io.emit('playerDied', socket.id);
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('removePlayer', socket.id);
        broadcastLeader();
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});