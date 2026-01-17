// Connect to the backend server via Socket.IO
const socket = io('http://localhost:3000', {
    query: {
        type: 'dashboard'
    }
});

// Get DOM elements
const statusBox = document.getElementById('status-box');
const statusText = statusBox.querySelector('.status-text');
const thiefDisplay = document.getElementById('thief-display');
const roastButtons = document.querySelectorAll('.button-grid button');
const snoozeBtn = document.getElementById('snooze-btn');
const testAlertBtn = document.getElementById('test-alert-btn');
const modeDropdown = document.getElementById('mode-dropdown');

// Listen for connection
socket.on('connect', () => {
    console.log('Connected to server');
});

// Listen for alert from server (when ESP32 detects motion)
socket.on('alert', (data) => {
    console.log('Alert received:', data.message);
    updateStatus(true); // Switch to danger mode
});

// Listen for initial status on connection
socket.on('status', (data) => {
    console.log('Initial status:', data.lifted);
    updateStatus(data.lifted);
});

// Listen for reset from server
socket.on('reset', () => {
    console.log('Reset signal received from server');
    updateStatus(false);
});

// Function to update status display
function updateStatus(isDanger) {
    if (isDanger) {
        statusBox.className = 'danger';
        statusText.textContent = 'THIEF DETECTED!';
        snoozeBtn.style.display = 'block'; // Show snooze button
    } else {
        statusBox.className = 'safe';
        statusText.textContent = 'ALL CLEAR';
        snoozeBtn.style.display = 'none'; // Hide snooze button
    }
}

// Function to update camera feed (for future use)
function updateCameraFeed(imageUrl) {
    if (imageUrl) {
        thiefDisplay.innerHTML = `<img src="${imageUrl}" alt="Thief captured" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">`;
    } else {
        thiefDisplay.innerHTML = '<span>Waiting for thief...</span>';
    }
}

// Add click handlers to roast buttons
roastButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
        const roastType = index + 1;
        console.log(`Roast #${roastType} button clicked!`);
        
        // Emit roast event to server
        socket.emit('roast', { roastType });
    });
});

// Snooze button click handler
snoozeBtn.addEventListener('click', () => {
    console.log('Snooze button clicked - resetting status');
    
    // Send reset request to backend
    fetch('/reset', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        console.log('Status reset:', data);
        updateStatus(false); // Update UI to safe mode
    })
    .catch(error => console.error('Error resetting status:', error));
});

// Test alert button handler
testAlertBtn.addEventListener('click', () => {
    console.log('Test alert button clicked');
    fetch('/alert', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => console.log('Test alert sent:', data))
    .catch(error => console.error('Error sending test alert:', error));
});

// Mode dropdown handler
modeDropdown.addEventListener('change', (e) => {
    const selectedMode = e.target.value;
    console.log('Mode changed to:', selectedMode);
    
    // Send mode change to backend
    fetch('/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: selectedMode })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Mode updated:', data);
        // Update UI based on mode
        updateModeUI(selectedMode);
    })
    .catch(error => console.error('Error updating mode:', error));
});

// Function to update UI based on mode
function updateModeUI(mode) {
    const header = document.querySelector('h1');
    const cameraLabel = document.querySelector('.camera-label');
    
    if (mode === 'chope') {
        header.textContent = 'CHOPE-O-METER™ Master Dashboard';
        cameraLabel.textContent = 'Live Feed';
    } else if (mode === 'sentry') {
        header.textContent = 'SENTRY MODE™ Master Dashboard';
        cameraLabel.textContent = 'Item Monitor';
    }
}

// Load saved mode on page load
window.addEventListener('load', () => {
    fetch('/mode')
    .then(response => response.json())
    .then(data => {
        if (data.mode) {
            modeDropdown.value = data.mode;
            updateModeUI(data.mode);
        }
    })
    .catch(error => console.error('Error loading mode:', error));
});

// Handle disconnection
socket.on('disconnect', () => {
    console.log('Disconnected from server');
});