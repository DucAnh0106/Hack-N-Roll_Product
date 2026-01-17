const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Plain WebSocket server for ESP32 on port 3001
const wss = new WebSocket.Server({ port: 3001 });

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
    console.log('Alert reset (snooze)');

    if (dashboardSocket) {
        dashboardSocket.emit('reset');
    }

    // Send reset to ESP32 plain WebSocket to stop audio
    if (espWsClient && espWsClient.readyState === WebSocket.OPEN) {
        espWsClient.send(JSON.stringify({ type: 'reset' }));
        console.log('[WS] Sent reset to ESP32 (stop audio)');
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

    if (espWsClient && espWsClient.readyState === WebSocket.OPEN) {
        espWsClient.send(JSON.stringify({ type: 'roast', roastType }));
        console.log('[WS] Sent roast to ESP32:', roastType);
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

// -------------------- ESP32 WEBSOCKET (Plain WS for sensor board) --------------------
let espWsClient = null;
let alertResetTimer = null;

wss.on('connection', (ws) => {
    console.log('[WS] ESP32 sensor board connected!');
    espWsClient = ws;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // Only log alerts, not every sensor reading
            if (data.type === 'alert') {
                console.log('[WS] From ESP32:', data.type);
            }

            if (data.type === 'alert') {
                lifted = true;
                console.log('>>> ALERT: Movement detected! <<<');
                
                // Clear any existing reset timer
                if (alertResetTimer) {
                    clearTimeout(alertResetTimer);
                }
                
                // Set timer to auto-reset after 5 seconds of no alerts
                alertResetTimer = setTimeout(() => {
                    if (lifted) {
                        lifted = false;
                        console.log('>>> Auto-reset: No motion for 5 seconds <<<');
                        if (dashboardSocket) {
                            dashboardSocket.emit('reset');
                        }
                        // Send reset to ESP32 to stop audio
                        if (espWsClient && espWsClient.readyState === WebSocket.OPEN) {
                            espWsClient.send(JSON.stringify({ type: 'reset' }));
                            console.log('[WS] Sent auto-reset to ESP32 (stop audio)');
                        }
                    }
                }, 5000);
                
                if (dashboardSocket) {
                    dashboardSocket.emit('alert', {
                        message: 'TRESPASSER DETECTED!',
                        ...data
                    });
                }
            } else if (data.type === 'sensorData') {
                // Forward sensor data to dashboard
                if (dashboardSocket) {
                    dashboardSocket.emit('sensorData', data);
                }
            }
        } catch (e) {
            console.log('[WS] Raw message:', message.toString());
        }
    });

    ws.on('close', () => {
        console.log('[WS] ESP32 sensor board disconnected');
        espWsClient = null;
    });
});

// -------------------- CAMERA PROXY (for face detection) --------------------
const ESP_CAMERA_IP = '172.20.10.6';

app.get('/proxy/capture', async (req, res) => {
    try {
        const response = await fetch(`http://${ESP_CAMERA_IP}:81/capture`);
        if (!response.ok) {
            return res.status(500).send('Failed to fetch from ESP32');
        }
        const buffer = await response.arrayBuffer();
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'no-cache');
        res.send(Buffer.from(buffer));
    } catch (error) {
        console.error('Capture proxy error:', error.message);
        res.status(500).send('ESP32 not reachable');
    }
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

        if (espWsClient && espWsClient.readyState === WebSocket.OPEN) {
            espWsClient.send(JSON.stringify({ type: 'roast', roastType: data?.roastType }));
            console.log('[WS] Sent roast to ESP32:', data?.roastType);
        }
    });

    socket.on('alert', (data) => {
        console.log('>>> ALERT from ESP:', data);
        
        if (data.status === 'triggered') {
            lifted = true;
            // Forward alert to dashboard
            if (dashboardSocket) {
                dashboardSocket.emit('alert', { 
                    message: 'TRESPASSER DETECTED!',
                    ...data 
                });
            }
        } else if (data.status === 'reset') {
            lifted = false;
            // Forward reset to dashboard
            if (dashboardSocket) {
                dashboardSocket.emit('reset', data);
            }
        }
    });

    socket.on('sensorData', (data) => {
        // Log occasionally to debug (optional)
        // console.log('Sensor:', data);

        // Forward ONLY to the dashboard
        if (dashboardSocket) {
            dashboardSocket.emit('sensorData', data);
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
