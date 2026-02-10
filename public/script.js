const socket = io();

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const aliveEl = document.getElementById('alive-txt');
const scoreEl = document.getElementById('score-txt');
const leaderEl = document.getElementById('leader-txt');
const startScreen = document.getElementById('start-screen');
const goScreen = document.getElementById('game-over-screen');

let isRunning = false;
let score = 0;

const GRAVITY = 0.28;
const JUMP = 4.2;
const PIPE_SPEED = 3.5;

const neonColors = [
    { hex: '#00ffff' }, { hex: '#ff00ff' }, { hex: '#00ff00' },
    { hex: '#ffff00' }, { hex: '#ff3300' }
];
let selectedColor = neonColors[0].hex;

const colorContainer = document.getElementById('color-options');
if (colorContainer) {
    colorContainer.innerHTML = '';
    neonColors.forEach((c, i) => {
        let btn = document.createElement('div');
        btn.className = `c-btn ${i === 0 ? 'selected' : ''}`;
        btn.style.backgroundColor = c.hex;
        btn.style.color = c.hex;
        btn.onclick = () => {
            document.querySelectorAll('.c-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedColor = c.hex;
        };
        colorContainer.appendChild(btn);
    });
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

let localPlayer = null;
let remotePlayers = {};
let pipes = [];

class LocalBall {
    constructor(name, color) {
        this.name = name;
        this.color = color;
        this.x = 100;
        this.y = canvas.height / 2;
        this.radius = 15;
        this.velocity = 0;
        this.dead = false;
    }

    update() {
        if (this.dead) return;
        this.velocity += GRAVITY;
        this.y += this.velocity;

        if (this.y + this.radius > canvas.height || this.y - this.radius < 0) this.die();

        socket.emit('move', { y: this.y, v: this.velocity });
    }

    draw() {
        if (this.dead) return;
        drawBall(this.x, this.y, this.radius, this.color, this.name, true);
    }

    flap() {
        if (!this.dead) this.velocity = -JUMP;
    }

    die() {
        this.dead = true;
        socket.emit('died');
        updateOnlineCounter();
        endGame(false);
    }
}

function drawBall(x, y, radius, color, name, isLocal) {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowBlur = isLocal ? 20 : 10;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    if (!isLocal) ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.beginPath();
    ctx.arc(-5, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.font = isLocal ? "bold 14px Orbitron" : "10px Orbitron";
    ctx.textAlign = "center";
    ctx.fillText(name, x, y - 25);
}

socket.on('currentPlayers', (serverPlayers) => {
    for (let id in serverPlayers) {
        if (id !== socket.id) remotePlayers[id] = serverPlayers[id];
    }
    updateOnlineCounter();
});

socket.on('newPlayer', (p) => {
    remotePlayers[p.id] = p;
    updateOnlineCounter();
});

socket.on('updatePlayer', (data) => {
    if (remotePlayers[data.id]) remotePlayers[data.id].y = data.y;
});

socket.on('playerDied', (id) => {
    if (remotePlayers[id]) {
        remotePlayers[id].dead = true;
        updateOnlineCounter();
    }
});

socket.on('removePlayer', (id) => {
    delete remotePlayers[id];
    updateOnlineCounter();
});

socket.on('updateLeader', (leaderData) => {
    if (leaderData.score >= 0) {
        leaderEl.innerText = `${leaderData.name} (${leaderData.score})`;
    } else {
        leaderEl.innerText = "---";
    }
});

// Canos
socket.on('newPipe', (pipe) => {
    pipe.x = canvas.width;
    pipe.passed = false;
    pipes.push(pipe);
});

function updateOnlineCounter() {
    let count = 0;
    if (localPlayer && !localPlayer.dead) count++;
    for (let id in remotePlayers) {
        if (!remotePlayers[id].dead) count++;
    }
    aliveEl.innerText = count;
}

function updatePipesLogic() {
    for (let i = 0; i < pipes.length; i++) {
        let p = pipes[i];
        p.x -= PIPE_SPEED;

        ctx.shadowBlur = 15;
        ctx.shadowColor = "#00ffff";
        ctx.fillStyle = "rgba(0, 255, 255, 0.2)";
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 2;

        ctx.fillRect(p.x, 0, 60, p.y);
        ctx.strokeRect(p.x, 0, 60, p.y);

        let by = p.y + p.gap;
        ctx.fillRect(p.x, by, 60, canvas.height - by);
        ctx.strokeRect(p.x, by, 60, canvas.height - by);

        ctx.shadowBlur = 0;

        if (localPlayer && !localPlayer.dead) {
            if (localPlayer.x + 10 > p.x && localPlayer.x - 10 < p.x + 60) {
                if (localPlayer.y - 10 < p.y || localPlayer.y + 10 > by) localPlayer.die();
            }
        }

        if (p.x + 60 < localPlayer.x && !p.passed && !localPlayer.dead) {
            score++;
            scoreEl.innerText = score;
            p.passed = true;
            socket.emit('scoreUpdate', score);
        }

        if (p.x + 60 < -100) {
            pipes.shift();
            i--;
        }
    }
}

const World = {
    gridOffset: 0,
    draw: function () {
        let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, "#050510"); grad.addColorStop(1, "#001a33");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        this.gridOffset = (this.gridOffset + 1) % 50;
        ctx.strokeStyle = "rgba(0, 255, 255, 0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < canvas.width; i += 50) { ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); }
        for (let i = 0; i < canvas.height; i += 50) {
            let y = (i + this.gridOffset) % canvas.height;
            ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
        }
        ctx.stroke();
    }
};

function loop() {
    if (!isRunning) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    World.draw();
    updatePipesLogic();

    for (let id in remotePlayers) {
        let rp = remotePlayers[id];
        if (!rp.dead) drawBall(100, rp.y, 15, rp.color, rp.name, false);
    }

    if (localPlayer) {
        localPlayer.update();
        localPlayer.draw();
    }

    requestAnimationFrame(loop);
}

function startGame() {
    let name = document.getElementById('player-name').value || "Player";
    pipes = [];
    score = 0;
    scoreEl.innerText = "0";

    localPlayer = new LocalBall(name, selectedColor);
    socket.emit('start', { name: name, color: selectedColor });

    startScreen.classList.add('hidden');
    goScreen.classList.add('hidden');
    isRunning = true;
    loop();
}

function resetGame() {
    location.reload();
}

function endGame(win) {
    isRunning = false;
    let title = document.getElementById('go-title');
    let msg = document.getElementById('go-msg');

    title.innerText = "BATIDO!";
    title.style.color = "#ff3333";
    msg.innerText = `Score Final: ${score}`;

    goScreen.classList.remove('hidden');
}

const action = (e) => {
    if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
        if (e.type === 'touchstart') e.preventDefault();
        if (isRunning && localPlayer && !localPlayer.dead) localPlayer.flap();
    }
};

window.addEventListener('mousedown', action);
window.addEventListener('keydown', (e) => { if (e.code === 'Space') action(e); });
window.addEventListener('touchstart', action, { passive: false });