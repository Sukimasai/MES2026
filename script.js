const database = firebase.database();

const ctx = document.getElementById('vibrationChart').getContext('2d');
let vibrationChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Avg Vibration (mm/s)',
            data: [],
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            borderColor: 'rgba(59, 130, 246, 1)',
            borderWidth: 2,
            tension: 0.3,
            fill: true
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Vibration (mm/s)' }
            }
        }
    }
});

const vibrationRef = database.ref('/AverageVibration');
vibrationRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data !== null) {
        document.getElementById('currentVibration').innerText = parseFloat(data).toFixed(2);
        const now = new Date();
        document.getElementById('lastUpdated').innerText = `Last updated: ${now.toLocaleTimeString()}`;
        document.getElementById('currentVibration').classList.remove('text-red-500', 'text-2xl');
        document.getElementById('currentVibration').classList.add('text-blue-600', 'text-4xl');
        document.getElementById('lastUpdated').classList.remove('text-red-500');
    }
});

let fullHistoryData = [];
let currentMinuteLimit = 30;

function getTimestampFromPushId(pushId) {
    const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
    let time = 0;
    for (let i = 0; i < 8; i++) {
        time = time * 64 + PUSH_CHARS.indexOf(pushId.charAt(i));
    }
    return time;
}

const historyRef = database.ref('/VibrationHistory').limitToLast(120);
historyRef.on('value', (snapshot) => {
    fullHistoryData = [];
    snapshot.forEach((childSnapshot) => {
        const val = childSnapshot.val();
        const timestamp = getTimestampFromPushId(childSnapshot.key);
        const value = typeof val === 'object' ? val.value : val; 
        
        fullHistoryData.push({ timestamp, value });
    });
    
    checkDataStatus(); 
});

function checkDataStatus() {
    if (fullHistoryData.length === 0) return;

    const now = Date.now();
    const latestPoint = fullHistoryData[fullHistoryData.length - 1];
    const timeSinceLastData = now - latestPoint.timestamp;

    if (timeSinceLastData > 3 * 60 * 1000) {
        document.getElementById('currentVibration').innerText = "Offline";
        document.getElementById('currentVibration').classList.remove('text-blue-600', 'text-4xl');
        document.getElementById('currentVibration').classList.add('text-red-500', 'text-2xl');
        
        const lastSeenTime = new Date(latestPoint.timestamp).toLocaleTimeString();
        document.getElementById('lastUpdated').innerText = `Arduino Offline (Last seen: ${lastSeenTime})`;
        document.getElementById('lastUpdated').classList.add('text-red-500');
    }

    renderChart(currentMinuteLimit);
}

setInterval(checkDataStatus, 5000);

function renderChart(minuteLimit) {
    currentMinuteLimit = minuteLimit;
    const now = Date.now();
    const cutoffTime = now - (minuteLimit * 60 * 1000);

    // Only plot data that falls within the requested minute limit
    const dataToPlot = fullHistoryData.filter(point => point.timestamp >= cutoffTime);
    
    
    const labels = [];
    const values = [];

    dataToPlot.forEach(point => {
        const date = new Date(point.timestamp);
        const timeString = date.getHours().toString().padStart(2, '0') + ':' + 
                           date.getMinutes().toString().padStart(2, '0');
        
        labels.push(timeString);
        values.push(point.value);
    });

    vibrationChart.data.labels = labels;
    vibrationChart.data.datasets[0].data = values;
    vibrationChart.update();
}

window.updateChart = function(minutes, event) {
    renderChart(minutes);

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active', 'text-blue-600'));
    event.currentTarget.classList.add('active', 'text-blue-600');
};