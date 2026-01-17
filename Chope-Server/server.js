const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// Serve static files from '../public' folder (go up one level, then into public)
app.use(express.static(path.join('public/')));

// Explicit route for root
app.get('/', (req, res) => {
    res.sendFile('public/index.html');
});

let dashboardSocket = null;
let espSocket = null;
let lifted = false;
let currentMode = 'chope'; // default mode

app.post('/alert', (req, res) => {
    lifted = true;
    console.log('Alert triggered');
    if (dashboardSocket) {
        dashboardSocket.emit('alert', { message: "TRESPASSER DETECTED!" });
    }
    res.json({ ok: true });
});

app.post('/roast', (req, res) => {
    const { roastType } = req.body;
    console.log('Selected roast: ' + roastType);
    if (espSocket) {
        espSocket.emit('roast', { roastType });
    }
    res.json({ ok: true });
});

app.post('/reset', (req, res) => {
    lifted = false;
    console.log('Status reset to safe');
    if (dashboardSocket) {
        dashboardSocket.emit('reset');
    }
    res.json({ ok: true, lifted: false });
});

// Get current mode
app.get('/mode', (req, res) => {
    res.json({ mode: currentMode });
});

// Update mode
app.post('/mode', (req, res) => {
    const { mode } = req.body;
    if (mode === 'chope' || mode === 'sentry') {
        currentMode = mode;
        console.log('Mode changed to:', currentMode);
        
        // Notify ESP32 about mode change
        if (espSocket) {
            espSocket.emit('mode', { mode: currentMode });
        }
        
        res.json({ ok: true, mode: currentMode });
    } else {
        res.status(400).json({ ok: false, error: 'Invalid mode' });
    }
});

io.on('connection', (socket) => {
    console.log("A client connected!");

    const clientType = socket.handshake.query.type;
    console.log('Client type:', clientType);

    if (clientType === 'dashboard') {
        if (dashboardSocket) {
            socket.disconnect();
            console.log('Dashboard already connected. Rejecting new connection.');
            return;
        }
        dashboardSocket = socket;
        console.log('Dashboard connected.');
        socket.emit('status', { lifted }); 
    } else if (clientType === 'esp') {
        if (espSocket) {
            socket.disconnect();
            console.log('ESP already connected. Rejecting new connection.');
            return;
        }
        espSocket = socket;
        console.log('ESP connected.');
    }

    socket.on('roast', (data) => {
        console.log('Selected roast:', data.roastType);
        if (espSocket) {
            espSocket.emit('roast', { roastType: data.roastType });
        }
    });

    socket.on('reset', () => {
        lifted = false;
        console.log('Status reset via socket');
        if (dashboardSocket) {
            dashboardSocket.emit('reset');
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', clientType);
        if (clientType === 'dashboard') {
            dashboardSocket = null;
        } else if (clientType === 'esp') {
            espSocket = null;
        }
    });
});

server.listen(3000, () => {
    console.log("Backend running on http://localhost:3000");
});