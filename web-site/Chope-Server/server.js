const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------------------- STATE --------------------
let dashboardSocket = null;
let espSocket = null;
let lifted = false;
let currentMode = 'chope';

// -------------------- REST API --------------------
app.post('/alert', (req, res) => {
    lifted = true;
    console.log('Alert triggered');

    if (dashboardSocket) {
        dashboardSocket.emit('alert', { message: 'TRESPASSER DETECTED!' });
    }

    res.json({ ok: true });
});

app.post('/reset', (req, res) => {
    lifted = false;
    console.log('Alert reset');

    if (dashboardSocket) {
        dashboardSocket.emit('reset');
    }

    if (espSocket) {
        espSocket.emit('reset');
    }

    res.json({ ok: true });
});

app.post('/roast', (req, res) => {
    const { roastType } = req.body;
    console.log('Selected roast:', roastType);

    if (espSocket) {
        espSocket.emit('roast', { roastType });
    }

    res.json({ ok: true });
});

app.post('/mode', (req, res) => {
    currentMode = req.body.mode || 'chope';
    console.log('Mode set to:', currentMode);
    res.json({ mode: currentMode });
});

app.get('/mode', (req, res) => {
    res.json({ mode: currentMode });
});

// -------------------- SOCKET.IO --------------------
io.on('connection', (socket) => {
    const clientType = socket.handshake.query.type;
    console.log('Client connected:', clientType);

    if (clientType === 'dashboard') {
        if (dashboardSocket) {
            socket.disconnect();
            return;
        }
        dashboardSocket = socket;
        socket.emit('status', { lifted });
    }

    if (clientType === 'esp') {
        if (espSocket) {
            socket.disconnect();
            return;
        }
        espSocket = socket;
    }

    socket.on('roast', (data) => {
        if (espSocket) {
            espSocket.emit('roast', data);
        }
    });

    socket.on('disconnect', () => {
        if (clientType === 'dashboard') dashboardSocket = null;
        if (clientType === 'esp') espSocket = null;
        console.log('Client disconnected:', clientType);
    });
});

server.listen(3000, () => {
    console.log('Backend running on http://localhost:3000');
});
