const socket = io('http://localhost:3000', {
    query: {
        type: 'dashboard'
    }
});

const statusBox = document.getElementById('status-box');
const statusText = statusBox.querySelector('.status-text');
const thiefDisplay = document.getElementById('thief-display');
const roastButtons = document.querySelectorAll('.button-grid button');

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('alert', (data) => {
    console.log('Alert received:', data.message);
    updateStatus(true); 
});

socket.on('status', (data) => {
    console.log('Initial status:', data.lifted);
    updateStatus(data.lifted);
});

function updateStatus(isDanger) {
    if (isDanger) {
        statusBox.className = 'danger';
        statusText.textContent = 'THIEF DETECTED!';
    } else {
        statusBox.className = 'safe';
        statusText.textContent = 'ALL CLEAR';
    }
}

function updateCameraFeed(imageUrl) {
    if (imageUrl) {
        thiefDisplay.innerHTML = `<img src="${imageUrl}" alt="Thief captured" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">`;
    } else {
        thiefDisplay.innerHTML = '<span>Waiting for thief...</span>';
    }
}

roastButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
        const roastType = index + 1;
        console.log(`Roast #${roastType} button clicked!`);
        
        socket.emit('roast', { roastType });
    });
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});