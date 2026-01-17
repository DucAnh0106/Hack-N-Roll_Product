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
});
