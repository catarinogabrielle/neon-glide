const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

let players = {};

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
            y: 300,
            dist: 0, // NOVO: Servidor agora rastreia a distância!
            color: data.color || '#00ffff',
            name: data.name || 'Player',
            score: 0,
            dead: false
        };

        socket.emit('currentPlayers', players);
        socket.broadcast.emit('newPlayer', players[socket.id]);
        broadcastLeader();
    });

    // Repassa o movimento e a distância
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].y = data.y;
            players[socket.id].dist = data.dist; // Atualiza a distância
            // Envia para os outros a posição Y e a Distância
            socket.broadcast.emit('updatePlayer', { id: socket.id, y: data.y, dist: data.dist });
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