// -------------------- SOCKET CONNECTION --------------------
const socket = io('http://localhost:3000', {
    query: { type: 'dashboard' }
});

// -------------------- DOM ELEMENTS --------------------
const statusBox = document.getElementById('status-box');
const statusText = statusBox.querySelector('.status-text');
const thiefDisplay = document.getElementById('thief-display');
const roastButtons = document.querySelectorAll('.button-grid button');
const snoozeBtn = document.getElementById('snooze-btn');
const testAlertBtn = document.getElementById('test-alert-btn');
const modeDropdown = document.getElementById('mode-dropdown');

// -------------------- SOCKET EVENTS --------------------
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('alert', () => {
    updateStatus(true);
});

socket.on('status', (data) => {
    updateStatus(data.lifted);
});

socket.on('reset', () => {
    updateStatus(false);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

// -------------------- STATUS UI --------------------
function updateStatus(isDanger) {
    if (isDanger) {
        statusBox.className = 'danger';
        statusText.textContent = 'THIEF DETECTED!';
        snoozeBtn.style.display = 'block';
    } else {
        statusBox.className = 'safe';
        statusText.textContent = 'ALL CLEAR';
        snoozeBtn.style.display = 'none';
    }
}

// -------------------- CAMERA (FUTURE) --------------------
function updateCameraFeed(imageUrl) {
    thiefDisplay.innerHTML = imageUrl
        ? `<img src="${imageUrl}" style="width:100%;height:100%;object-fit:cover">`
        : '<span>Waiting for thief...</span>';
}

// -------------------- ROAST BUTTONS --------------------
roastButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
        socket.emit('roast', { roastType: index + 1 });
    });
});

// -------------------- SNOOZE --------------------
snoozeBtn.addEventListener('click', () => {
    fetch('/reset', { method: 'POST' })
        .then(() => updateStatus(false))
        .catch(console.error);
});

// -------------------- TEST ALERT --------------------
testAlertBtn.addEventListener('click', () => {
    fetch('/alert', { method: 'POST' }).catch(console.error);
});

// -------------------- MODE HANDLING --------------------
const MODE_CONFIG = {
    chope: {
        title: 'CHOPE-O-METER™ Master Dashboard',
        cameraLabel: 'Live Feed'
    },
    sentry: {
        title: 'Sentry Dashboard',
        cameraLabel: 'Item Monitor'
    }
};

function updateModeUI(mode) {
    const header = document.querySelector('h1');
    const cameraLabel = document.querySelector('.camera-label');

    if (!MODE_CONFIG[mode]) return;

    header.textContent = MODE_CONFIG[mode].title;
    cameraLabel.textContent = MODE_CONFIG[mode].cameraLabel;
}

modeDropdown.addEventListener('change', (e) => {
    const mode = e.target.value;

    // Update UI immediately
    updateModeUI(mode);

    // Persist to backend
    fetch('/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
    }).catch(() => {});
});

// Load saved mode on startup
window.addEventListener('load', () => {
    fetch('/mode')
        .then(res => res.json())
        .then(data => {
            if (data.mode) {
                modeDropdown.value = data.mode;
                updateModeUI(data.mode);
            }
        })
        .catch(() => {});
    
    // Initialize face detection
    initFaceDetection();
});

// -------------------- FACE DETECTION --------------------
let faceDetectionEnabled = true;
let lastAlertTime = 0;
const ALERT_COOLDOWN = 5000; // 5 seconds between alerts
const ESP_IP = '10.81.174.74'; // Update this to match your ESP32 IP
const CAPTURE_PORT = 81; // Same port as stream now

async function initFaceDetection() {
    try {
        // Load the TinyFaceDetector model (fast and lightweight)
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        console.log('Face detection model loaded');
        
        // Start detection loop
        detectFaces();
    } catch (error) {
        console.error('Failed to load face detection model:', error);
    }
}

async function detectFaces() {
    if (!faceDetectionEnabled) {
        setTimeout(detectFaces, 500);
        return;
    }
    
    const videoElement = document.getElementById('camera-stream');
    const canvas = document.getElementById('face-canvas');
    
    if (!canvas) {
        setTimeout(detectFaces, 500);
        return;
    }
    
    try {
        // Fetch a single snapshot via Node.js proxy (avoids CORS issues)
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = `/proxy/capture?t=${Date.now()}`; // Through Node.js proxy
        });
        
        // Detect faces on the snapshot
        const detections = await faceapi.detectAllFaces(
            img,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })
        );
        
        // Resize canvas to match video display size
        const displaySize = { width: videoElement.clientWidth, height: videoElement.clientHeight };
        faceapi.matchDimensions(canvas, displaySize);
        
        // Calculate scale factors
        const scaleX = displaySize.width / img.width;
        const scaleY = displaySize.height / img.height;
        
        // Draw face boxes
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        detections.forEach(detection => {
            const box = detection.box;
            const scaledBox = {
                x: box.x * scaleX,
                y: box.y * scaleY,
                width: box.width * scaleX,
                height: box.height * scaleY
            };
            
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            ctx.strokeRect(scaledBox.x, scaledBox.y, scaledBox.width, scaledBox.height);
            
            // Add label
            ctx.fillStyle = '#00ff00';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`Face (${Math.round(detection.score * 100)}%)`, scaledBox.x, scaledBox.y - 8);
        });
        
        // Trigger alert if face detected
        const now = Date.now();
        if (detections.length > 0 && now - lastAlertTime > ALERT_COOLDOWN) {
            lastAlertTime = now;
            console.log(`Face detected! Count: ${detections.length}`);
            
            // Trigger alert via server
            fetch('/alert', { method: 'POST' }).catch(console.error);
        }
        
    } catch (error) {
        console.log('Face detection error:', error.message);
    }
    
    // Continue detection loop
    setTimeout(detectFaces, 300); // ~3 FPS for face detection
}

// Toggle face detection
function toggleFaceDetection(enabled) {
    faceDetectionEnabled = enabled;
    console.log('Face detection:', enabled ? 'enabled' : 'disabled');
}


// MOVEMENT VARIABLES
let lastRoll = 0;
let lastPitch = 0;
let initialized = false;
const MOVEMENT_THRESHOLD = 8.0; // Degrees change needed to trigger alarm

// LISTEN FOR DATA
socket.on('sensorData', (data) => {
    // 1. Get current angles
    const currentRoll = data.roll;
    const currentPitch = data.pitch;

    // 2. Initialize on first run
    if (!initialized) {
        lastRoll = currentRoll;
        lastPitch = currentPitch;
        initialized = true;
        return;
    }

    // 3. Logic: Check difference
    let rollDiff = Math.abs(currentRoll - lastRoll);
    let pitchDiff = Math.abs(currentPitch - lastPitch);

    // 4. Trigger Alarm if Moved
    if (rollDiff > MOVEMENT_THRESHOLD || pitchDiff > MOVEMENT_THRESHOLD) {
        console.log("Movement Detected! Roll:", rollDiff, "Pitch:", pitchDiff);
        
        // Only trigger if not already in danger
        if (statusText.textContent !== 'THIEF DETECTED!') {
             // Tell server to go into ALERT mode (this updates everyone)
             fetch('/alert', { method: 'POST' });
        }
    }

    // 5. Update history
    lastRoll = currentRoll;
    lastPitch = currentPitch;
});
