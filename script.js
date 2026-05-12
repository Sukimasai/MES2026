const database = firebase.database();

const clusterColors = [
    { fill: 'rgba(59, 130, 246, 0.14)', stroke: 'rgba(59, 130, 246, 0.55)', label: 'Cluster 0' },
    { fill: 'rgba(168, 85, 247, 0.14)', stroke: 'rgba(168, 85, 247, 0.55)', label: 'Cluster 1' },
    { fill: 'rgba(34, 197, 94, 0.14)', stroke: 'rgba(34, 197, 94, 0.55)', label: 'Cluster 2' }
];

const clusterRangePlugin = {
    id: 'clusterRangePlugin',
    beforeDatasetsDraw(chart) {
        const clusterEntries = Object.values(clusterData)
            .filter(cluster => cluster && typeof cluster.lower_bound === 'number' && typeof cluster.upper_bound === 'number')
            .sort((left, right) => left.lower_bound - right.lower_bound);

        if (clusterEntries.length === 0) {
            return;
        }

        const { ctx, chartArea, scales } = chart;
        const yScale = scales.y;

        ctx.save();

        clusterEntries.forEach((cluster, index) => {
            const palette = clusterColors[index % clusterColors.length];
            const topPixel = yScale.getPixelForValue(cluster.upper_bound);
            const bottomPixel = yScale.getPixelForValue(cluster.lower_bound);
            const bandTop = Math.min(topPixel, bottomPixel);
            const bandHeight = Math.max(2, Math.abs(bottomPixel - topPixel));

            ctx.fillStyle = palette.fill;
            ctx.fillRect(chartArea.left, bandTop, chartArea.right - chartArea.left, bandHeight);

            ctx.strokeStyle = palette.stroke;
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(chartArea.left, bandTop, chartArea.right - chartArea.left, bandHeight);
            ctx.setLineDash([]);

            ctx.fillStyle = palette.stroke;
            ctx.font = '12px sans-serif';
            ctx.textBaseline = 'top';
            ctx.fillText(
                `${palette.label}: ${cluster.lower_bound.toFixed(2)} - ${cluster.upper_bound.toFixed(2)} mm/s`,
                chartArea.left + 10,
                Math.min(bandTop + 8, chartArea.bottom - 18)
            );
        });

        ctx.restore();
    }
};

const ctx = document.getElementById('vibrationChart').getContext('2d');
let vibrationChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Avg Vibration (mm/s)',
            data: [],
            backgroundColor: 'rgba(87, 209, 198, 0.16)',
            borderColor: 'rgba(87, 209, 198, 1)',
            borderWidth: 2,
            tension: 0.35,
            fill: true,
            pointBackgroundColor: 'rgba(87, 209, 198, 1)',
            pointBorderColor: '#08111d',
            pointHoverRadius: 7
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false
        },
        plugins: {
            legend: {
                labels: {
                    color: 'rgba(241, 245, 249, 0.75)',
                    font: {
                        family: 'IBM Plex Mono'
                    }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(8, 17, 29, 0.95)',
                titleColor: '#f5f7fb',
                bodyColor: '#d8e1ef',
                borderColor: 'rgba(87, 209, 198, 0.35)',
                borderWidth: 1,
                padding: 12,
                displayColors: false
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Vibration (mm/s)', color: 'rgba(241, 245, 249, 0.7)' },
                ticks: {
                    color: 'rgba(241, 245, 249, 0.66)'
                },
                grid: {
                    color: 'rgba(148, 163, 184, 0.12)'
                }
            },
            x: {
                ticks: {
                    color: 'rgba(241, 245, 249, 0.66)'
                },
                grid: {
                    color: 'rgba(148, 163, 184, 0.08)'
                }
            }
        }
    },
    plugins: [clusterRangePlugin]
});

// Cluster storage
let clusterData = {};
let recentReadings = [];
const OFFLINE_TIMEOUT_MS = 3 * 60 * 1000;
let lastLiveDataTimestamp = null;
let offlineAlertSent = false;
let notificationPermissionRequested = false;

const vibrationRef = database.ref('/AverageVibration');
vibrationRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data !== null) {
        lastLiveDataTimestamp = Date.now();
        const vibValue = parseFloat(data);
        document.getElementById('currentVibration').innerText = vibValue.toFixed(2);
        document.getElementById('lastReading').innerText = vibValue.toFixed(2);
        
        const now = new Date();
        document.getElementById('statusTime').innerText = now.toLocaleTimeString();
        document.getElementById('currentVibration').classList.remove('vibration-value-offline', 'text-2xl');
        document.getElementById('currentVibration').classList.add('vibration-value-online', 'text-3xl');
        
        updateDeviceStatus(true);
    }
});

// Listen for cluster data
const clusterRef = database.ref('/ClusterData');
clusterRef.on('value', (snapshot) => {
    clusterData = {};
    snapshot.forEach((childSnapshot) => {
        const clusterId = childSnapshot.key;
        clusterData[clusterId] = childSnapshot.val();
    });
    displayClusters();
    if (fullHistoryData.length > 0) {
        renderChart(currentMinuteLimit);
    }
});

function displayClusters() {
    const container = document.getElementById('clusterContainer');
    
    if (Object.keys(clusterData).length === 0) {
        container.innerHTML = '<div class="flex items-center justify-center h-40 col-span-full text-gray-400"><p class="text-center"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br><span>Loading cluster data...</span></p></div>';
        return;
    }
    
    let html = '';
    const clusterColors = [
        { gradient: 'from-blue-50 to-blue-100', border: 'border-blue-400', text: 'text-blue-700', badge: 'bg-blue-500' },
        { gradient: 'from-purple-50 to-purple-100', border: 'border-purple-400', text: 'text-purple-700', badge: 'bg-purple-500' },
        { gradient: 'from-cyan-50 to-cyan-100', border: 'border-cyan-400', text: 'text-cyan-700', badge: 'bg-cyan-500' }
    ];
    
    Object.keys(clusterData).sort().forEach((key, index) => {
        const cluster = clusterData[key];
        const color = clusterColors[index % clusterColors.length];
        const clusterNum = key.replace('cluster_', '');
        
        html += `
            <div class="cluster-card bg-gradient-to-br ${color.gradient} rounded-xl p-6 border-2 ${color.border} hover:shadow-lg transition">
                <div class="flex justify-between items-start mb-4">
                    <span class="inline-block ${color.badge} text-white text-xs font-bold px-3 py-1 rounded-full">Cluster ${clusterNum}</span>
                    <i class="fas fa-cube ${color.text} opacity-40"></i>
                </div>
                <div class="space-y-3">
                    <div>
                        <p class="text-xs text-gray-600 uppercase font-semibold tracking-wide">Centroid</p>
                        <p class="text-3xl font-bold ${color.text}">${cluster.centroid.toFixed(3)}</p>
                    </div>
                    <div class="pt-3 border-t border-gray-300">
                        <p class="text-xs text-gray-600 mb-2">Radius: <span class="font-semibold">${cluster.radius.toFixed(3)}</span></p>
                        <p class="text-xs text-gray-600">Range: <span class="font-semibold">${cluster.lower_bound.toFixed(3)} - ${cluster.upper_bound.toFixed(3)}</span></p>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

let fullHistoryData = [];
let currentMinuteLimit = 30;
let boundsCalculated = { min: null, max: null };

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
    recentReadings = [];
    
    snapshot.forEach((childSnapshot) => {
        const val = childSnapshot.val();
        const timestamp = getTimestampFromPushId(childSnapshot.key);
        const value = typeof val === 'object' ? val.value : val;
        const cluster = typeof val === 'object' ? val.cluster : null;
        
        fullHistoryData.push({ timestamp, value, cluster });
        recentReadings.push({ timestamp, value, cluster, key: childSnapshot.key });
    });
    
    calculateBounds();
    updateReadingsTable();
    checkDataStatus(); 
});

function updateReadingsTable() {
    const tbody = document.getElementById('readingsTableBody');
    
    // Show last 10 readings in reverse order (newest first)
    const latestReadings = recentReadings.slice().reverse().slice(0, 10);
    
    if (latestReadings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-400"><i class="fas fa-inbox mr-2"></i>No data available</td></tr>';
        return;
    }
    
    let html = '';
    latestReadings.forEach((reading, idx) => {
        const date = new Date(reading.timestamp);
        const timeStr = date.toLocaleTimeString();
        const clusterNum = reading.cluster !== null ? reading.cluster : '--';
        
        const clusterBounds = clusterData[`cluster_${reading.cluster}`];
        let status = 'Unknown';
        let statusBg = 'bg-gray-100 text-gray-700';
        let statusIcon = 'fa-question';
        
        if (clusterBounds) {
            if (reading.value >= clusterBounds.lower_bound && reading.value <= clusterBounds.upper_bound) {
                status = 'Normal';
                statusBg = 'bg-green-100 text-green-700';
                statusIcon = 'fa-check-circle';
            } else {
                status = 'Anomaly';
                statusBg = 'bg-red-100 text-red-700';
                statusIcon = 'fa-exclamation-circle';
            }
        }
        
        const clusterBadgeColor = reading.cluster === 0 ? 'bg-blue-100 text-blue-700' : reading.cluster === 1 ? 'bg-purple-100 text-purple-700' : 'bg-cyan-100 text-cyan-700';
        
        html += `
            <tr class="border-b border-gray-200 hover:bg-gray-50 transition">
                <td class="px-6 py-4 text-sm font-medium text-gray-700">${timeStr}</td>
                <td class="px-6 py-4 text-sm font-bold text-blue-600">${reading.value.toFixed(3)}</td>
                <td class="px-6 py-4"><span class="px-3 py-1 rounded-full text-xs font-semibold ${clusterBadgeColor}">Cluster ${clusterNum}</span></td>
                <td class="px-6 py-4"><span class="px-3 py-1 rounded-full text-xs font-semibold ${statusBg}"><i class="fas ${statusIcon} mr-1"></i>${status}</span></td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

function calculateBounds() {
    if (fullHistoryData.length === 0) return;

    const values = fullHistoryData.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    boundsCalculated.min = min;
    boundsCalculated.max = max;
    
    // Display bounds with 20% margin
    const margin = (max - min) * 0.2;
    const adjustedMin = Math.max(0, min - margin);
    const adjustedMax = max + margin;
    
    document.getElementById('lowerBound').innerText = adjustedMin.toFixed(2);
    document.getElementById('upperBound').innerText = adjustedMax.toFixed(2);
}

function getClusterUpperRange() {
    const upperBounds = Object.values(clusterData)
        .map(cluster => cluster && Number(cluster.upper_bound))
        .filter(value => Number.isFinite(value));

    if (upperBounds.length === 0) {
        return null;
    }

    return Math.max(...upperBounds);
}

function getClusterBoundsForReading(reading) {
    if (reading === null || reading === undefined) {
        return null;
    }

    const clusterId = reading.cluster;
    if (clusterId === null || clusterId === undefined) {
        return null;
    }

    const bounds = clusterData[`cluster_${clusterId}`];
    if (!bounds) {
        return null;
    }

    const lower = Number(bounds.lower_bound);
    const upper = Number(bounds.upper_bound);
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
        return null;
    }

    return { lower, upper };
}

function isReadingAnomaly(reading) {
    const value = Number(reading && reading.value);
    if (!Number.isFinite(value)) {
        return false;
    }

    const bounds = getClusterBoundsForReading(reading);
    if (bounds) {
        return value < bounds.lower || value > bounds.upper;
    }

    const highestClusterUpper = getClusterUpperRange();
    return highestClusterUpper !== null && value > highestClusterUpper;
}

function notifyIfOffline(timeSinceLastDataMs) {
    if (offlineAlertSent || typeof Notification === 'undefined' || !window.isSecureContext) {
        return;
    }

    const minutesSilent = Math.floor(timeSinceLastDataMs / 60000);
    const sendNotification = () => {
        if (Notification.permission === 'granted' && !offlineAlertSent) {
            new Notification('Device offline', {
                body: `No data received for ${minutesSilent} minute(s).`,
                icon: 'https://cdn-icons-png.flaticon.com/512/565/565547.png'
            });
            offlineAlertSent = true;
        }
    };

    if (Notification.permission === 'granted') {
        sendNotification();
        return;
    }

    if (Notification.permission === 'default' && !notificationPermissionRequested) {
        notificationPermissionRequested = true;
        Notification.requestPermission().then(() => {
            sendNotification();
        });
    }
}

function updateLastAnomaly() {
    const anomalies = fullHistoryData.filter(isReadingAnomaly);
    if (anomalies.length === 0) {
        document.getElementById('lastAnomalyValue').innerText = '--';
        document.getElementById('lastAnomalyTime').innerText = '--:--:--';
        return;
    }

    const last = anomalies[anomalies.length - 1];
    document.getElementById('lastAnomalyValue').innerText = Number(last.value).toFixed(3);
    document.getElementById('lastAnomalyTime').innerText = new Date(last.timestamp).toLocaleTimeString();
}

function updateDeviceStatus(isOnline) {
    const badge = document.getElementById('statusBadge');
    if (isOnline) {
        badge.className = 'status-pill status-pill-online';
        badge.innerHTML = '<span class="status-dot"></span><span>Online</span>';
    } else {
        badge.className = 'status-pill status-pill-offline';
        badge.innerHTML = '<span class="status-dot"></span><span>Offline</span>';
    }
}

function checkDataStatus() {
    const now = Date.now();
    const latestHistoryTimestamp = fullHistoryData.length > 0 ? fullHistoryData[fullHistoryData.length - 1].timestamp : null;
    const latestTimestamp = Math.max(
        lastLiveDataTimestamp !== null && lastLiveDataTimestamp !== undefined ? lastLiveDataTimestamp : 0,
        latestHistoryTimestamp !== null && latestHistoryTimestamp !== undefined ? latestHistoryTimestamp : 0
    );

    if (!latestTimestamp) {
        return;
    }

    const timeSinceLastData = now - latestTimestamp;

    if (timeSinceLastData > OFFLINE_TIMEOUT_MS) {
        updateDeviceStatus(false);
        document.getElementById('currentVibration').innerText = "Offline";
        document.getElementById('currentVibration').classList.remove('vibration-value-online', 'text-3xl');
        document.getElementById('currentVibration').classList.add('vibration-value-offline', 'text-2xl');
        notifyIfOffline(timeSinceLastData);
    } else {
        updateDeviceStatus(true);
        offlineAlertSent = false;
    }

    renderChart(currentMinuteLimit);
}

setInterval(checkDataStatus, 5000);

function calculatePeriodStatistics(minuteLimit) {
    const now = Date.now();
    const cutoffTime = now - (minuteLimit * 60 * 1000);

    const dataInPeriod = fullHistoryData.filter(point => point.timestamp >= cutoffTime);
    
    if (dataInPeriod.length === 0) {
        document.getElementById('periodAverage').innerText = '--';
        document.getElementById('minVibration').innerText = '--';
        document.getElementById('maxVibration').innerText = '--';
        return;
    }

    const values = dataInPeriod.map(d => d.value);
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    document.getElementById('periodAverage').innerText = average.toFixed(2);
    document.getElementById('minVibration').innerText = min.toFixed(2);
    document.getElementById('maxVibration').innerText = max.toFixed(2);
}

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

    // Color points red when they fall outside their assigned cluster bounds.
    const highestClusterUpper = getClusterUpperRange();
    const defaultPointColor = 'rgba(59,130,246,1)';
    const anomalyPointColor = 'rgba(220,38,38,1)';

    const pointColors = dataToPlot.map(point => {
        return isReadingAnomaly(point) ? anomalyPointColor : defaultPointColor;
    });

    const pointRadii = dataToPlot.map(point => isReadingAnomaly(point) ? 6 : 3);

    vibrationChart.data.datasets[0].pointBackgroundColor = pointColors;
    vibrationChart.data.datasets[0].pointRadius = pointRadii;

    const highestPoint = values.length > 0 ? Math.max(...values) : 0;
    const suggestedMaximum = Math.max(
        highestPoint,
        highestClusterUpper !== null && highestClusterUpper !== undefined ? highestClusterUpper : 0
    );

    vibrationChart.options.scales.y.suggestedMax = suggestedMaximum > 0 ? suggestedMaximum * 1.15 : 1;
    vibrationChart.update();
    
    calculatePeriodStatistics(minuteLimit);
    updateLastAnomaly();
}

window.updateChart = function(minutes, event) {
    renderChart(minutes);

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active', 'text-blue-600'));
    event.currentTarget.classList.add('active', 'text-blue-600');
};