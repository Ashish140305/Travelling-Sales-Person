// --- Map Initialization ---
const map = L.map('map').setView([19.0760, 72.8777], 11);

// --- Tile Layers ---
const streetLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
});

const satelliteLabelsLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google'
});

streetLayer.addTo(map);

const baseMaps = {
    "Street": streetLayer,
    "Satellite": satelliteLabelsLayer,
};

L.control.layers(baseMaps).addTo(map);

// --- DOM Elements ---
const spinner = document.getElementById('spinner');
const searchInput = document.getElementById('search-input');
const routeInfo = document.getElementById('route-info');
const stopsList = document.getElementById('stops-list');
const themeToggle = document.getElementById('theme-toggle');
const locateMeButton = document.getElementById('locate-me-button');
const exportGpxButton = document.getElementById('export-gpx-button');
const hud = document.getElementById('hud');

// --- State Management ---
let stops = [];
let markers = [];
let routeLine;
let routeDecorator;
let temporaryMarker;

// --- Helper Functions ---
function showSpinner() { spinner.classList.remove('hidden'); }
function hideSpinner() { spinner.classList.add('hidden'); }

function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 3000);
}

async function updateSidebar() {
    stopsList.innerHTML = '';
    if (stops.length === 0) {
        const li = document.createElement('li');
        li.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--text-secondary);">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="feather feather-map-pin"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <p>No stops added yet. Click on the map to add your first stop!</p>
            </div>
        `;
        stopsList.appendChild(li);
    } else {
        for (const [index, stop] of stops.entries()) {
            const li = document.createElement('li');
            const stopInfo = document.createElement('div');
            stopInfo.className = 'stop-info';
            const stopName = document.createElement('span');
            stopName.className = 'stop-name';
            stopName.textContent = stop.name ? `Stop ${index + 1}: ${stop.name}` : `Stop ${index + 1}`;
            const stopCoords = document.createElement('span');
            stopCoords.className = 'stop-coords';
            stopCoords.textContent = `(${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)})`;
            stopInfo.appendChild(stopName);
            stopInfo.appendChild(stopCoords);
            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-x"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            removeBtn.className = 'remove-stop-btn';
            removeBtn.title = 'Remove this stop';
            removeBtn.onclick = () => removeStop(index);
            li.appendChild(stopInfo);
            li.appendChild(removeBtn);
            stopsList.appendChild(li);
        }
    }
}

async function getStopName(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`);
        const data = await response.json();
        const { road, neighbourhood, suburb, city, town, state } = data.address;
        return road || neighbourhood || suburb || city || town || state || 'Unknown Location';
    } catch (error) {
        return 'Unknown Location';
    }
}

function createNumberedMarker(latlng, number) {
    const marker = L.marker(latlng, {
        draggable: true,
        icon: L.divIcon({
            className: 'leaflet-div-icon',
            html: `<span>${number}</span>`,
            iconSize: [24, 24]
        })
    });

    marker.on('dragend', function (event) {
        const newLatLng = event.target.getLatLng();
        const markerIndex = markers.indexOf(event.target);
        stops[markerIndex].lat = newLatLng.lat;
        stops[markerIndex].lng = newLatLng.lng;

        getStopName(newLatLng.lat, newLatLng.lng).then(name => {
            stops[markerIndex].name = name;
            updateSidebar();
        });

        if (stops.length > 1) {
            drawRoute(stops);
        }
    });

    return marker;
}

function updateMarkers() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    stops.forEach((stop, index) => {
        const newMarker = createNumberedMarker(stop, index + 1);
        newMarker.addTo(map);
        markers.push(newMarker);
    });
}

async function addStop(latlng) {
    const name = await getStopName(latlng.lat, latlng.lng);
    stops.push({ ...latlng, name });
    updateMarkers();
    updateSidebar();
}

function removeStop(index) {
    stops.splice(index, 1);
    updateMarkers();
    updateSidebar();
    if (stops.length > 1) {
        optimizeRoute();
    } else {
        if (routeLine) map.removeLayer(routeLine);
        if (routeDecorator) map.removeLayer(routeDecorator);
        routeInfo.classList.add('hidden');
        exportGpxButton.classList.add('hidden');
        hud.classList.add('hidden');
    }
}

function drawRoute(route) {
    if (routeLine) map.removeLayer(routeLine);
    if (routeDecorator) map.removeLayer(routeDecorator);
    const latlngs = route.map(s => [s.lat, s.lng]);
    latlngs.push(latlngs[0]);
    routeLine = L.polyline(latlngs, { color: '#4a90e2', weight: 5, opacity: 0.8 }).addTo(map);
    routeDecorator = L.polylineDecorator(routeLine, {
        patterns: [
            { offset: '10%', repeat: '20%', symbol: L.Symbol.arrowHead({ pixelSize: 15, pathOptions: { fillOpacity: 1, weight: 0, color: '#4a90e2' } }) }
        ]
    }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

    if (route.length > 1) {
        hud.textContent = `Next stop: ${route[1].name}`;
        hud.classList.remove('hidden');
    }
}

function clearRoute() {
    stops = [];
    updateMarkers();
    if (routeLine) map.removeLayer(routeLine);
    if (routeDecorator) map.removeLayer(routeDecorator);
    routeInfo.classList.add('hidden');
    exportGpxButton.classList.add('hidden');
    hud.classList.add('hidden');
    updateSidebar();
    map.setView([19.0760, 72.8777], 11);
}

async function searchLocation() {
    const query = searchInput.value;
    if (!query) return;
    showSpinner();
    if (temporaryMarker) map.removeLayer(temporaryMarker);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.length > 0) {
            const { lat, lon, display_name } = data[0];
            const latlng = { lat: parseFloat(lat), lng: parseFloat(lon) };
            map.setView(latlng, 14);
            temporaryMarker = L.marker(latlng).addTo(map)
                .bindPopup(`<b>${display_name}</b><br>Click on the map to add a stop.`)
                .openPopup();
            searchInput.value = '';
        } else {
            showNotification('Location not found.');
        }
    } catch (error) {
        showNotification('Error searching for location.');
    } finally {
        hideSpinner();
    }
}

async function optimizeRoute() {
    if (stops.length < 2) {
        showNotification("Add at least 2 stops to optimize.");
        return;
    }
    showSpinner();
    try {
        const response = await fetch('/api/optimize-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stops: stops.map(({ name, ...rest }) => rest) })
        });
        const data = await response.json();
        stops = data.optimized_route.map(optStop => stops.find(s => s.lat === optStop.lat && s.lng === optStop.lng));
        updateMarkers();
        updateSidebar();
        drawRoute(stops);
        const distanceInKm = data.total_distance * 111.32;
        const averageSpeedKmph = 40;
        const timeInHours = distanceInKm / averageSpeedKmph;
        const hours = Math.floor(timeInHours);
        const minutes = Math.round((timeInHours - hours) * 60);

        routeInfo.innerHTML = `
            <div>Optimized Route</div>
            <div class="route-meta">
                <span><strong>Distance:</strong> ${distanceInKm.toFixed(2)} km</span>
                <span><strong>Time:</strong> ${hours}h ${minutes}m</span>
            </div>
        `;
        routeInfo.classList.remove('hidden');
        exportGpxButton.classList.remove('hidden');
    } catch (error) {
        showNotification('Error optimizing route.');
    } finally {
        hideSpinner();
    }
}

function exportGPX() {
    let gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteSmart" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>Optimized Route</name></metadata>
<trk><name>Optimized Route</name><trkseg>`;

    stops.forEach(stop => {
        gpxContent += `<trkpt lat="${stop.lat}" lon="${stop.lng}"><name>${stop.name}</name></trkpt>`;
    });

    gpxContent += `</trkseg></trk></gpx>`;

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'route.gpx';
    a.click();
    URL.revokeObjectURL(url);
}

// --- Theme Management ---
function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

themeToggle.addEventListener('change', () => {
    const isDark = themeToggle.checked;
    localStorage.setItem('darkMode', isDark);
    applyTheme(isDark);
});

locateMeButton.addEventListener('click', () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const latlng = { lat: position.coords.latitude, lng: position.coords.longitude };
            map.setView(latlng, 14);
            L.marker(latlng).addTo(map).bindPopup("<b>You are here!</b>").openPopup();
        }, () => {
            showNotification('Could not retrieve your location.');
        });
    } else {
        showNotification('Geolocation is not supported by your browser.');
    }
});

// Load theme on startup
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('darkMode') === 'true';
    themeToggle.checked = savedTheme;
    applyTheme(savedTheme);
});

// --- Event Listeners ---
map.on('click', (e) => {
    if (temporaryMarker) {
        map.removeLayer(temporaryMarker);
        temporaryMarker = null;
    }
    addStop(e.latlng);
});
document.getElementById('optimize-button').addEventListener('click', optimizeRoute);
document.getElementById('clear-button').addEventListener('click', clearRoute);
document.getElementById('search-button').addEventListener('click', searchLocation);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchLocation();
});
exportGpxButton.addEventListener('click', exportGPX);


// --- Initial UI Update ---
updateSidebar();