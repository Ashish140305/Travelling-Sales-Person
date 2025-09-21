// --- Map Initialization ---
const map = L.map('map').setView([19.0760, 72.8777], 11);
// CORRECTED: Using the standard OpenStreetMap theme to match the light UI
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
// --- DOM Elements ---
const spinner = document.getElementById('spinner');
const searchInput = document.getElementById('search-input');
// --- State Management ---
let stops = [];
let markers = [];
let routeLine;
let temporaryMarker; // NEW: To hold the marker from a search
// --- Helper Functions ---
function showSpinner() { spinner.classList.remove('hidden'); }
function hideSpinner() { spinner.classList.add('hidden'); }
// --- NEW: Custom Notification Function ---
function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');

    // Hide the notification after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}
function updateSidebar() {
    const stopsList = document.getElementById('stops-list');
    stopsList.innerHTML = ''; // Clear the list
    if (stops.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No stops added yet.';
        li.style.color = '#b3b3b3';
        stopsList.appendChild(li);
    } else {
        stops.forEach((stop, index) => {
            const li = document.createElement('li');
            li.textContent = `Stop ${index + 1}: (${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)})`;
            stopsList.appendChild(li);
        });
    }
}

function addStop(latlng) {
    stops.push(latlng);
    const marker = L.marker(latlng).addTo(map);
    markers.push(marker);
    updateSidebar();
}

function drawRoute(route) {
    if (routeLine) map.removeLayer(routeLine);
    const latlngs = route.map(s => [s.lat, s.lng]);
    latlngs.push(latlngs[0]); // Complete the loop
    routeLine = L.polyline(latlngs, { color: '#1DB954', weight: 4 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
}

// --- NEW: Clear Route Function ---
function clearRoute() {
    // Clear data arrays
    stops = [];

    // Clear visuals from the map
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    if (routeLine) map.removeLayer(routeLine);

    // NEW: Display the route distance
    const routeInfo = document.getElementById('route-info');
    routeInfo.textContent = ``;
    // Reset sidebar
    updateSidebar();

    // Reset map view
    map.setView([19.0760, 72.8777], 11);
}

// --- NEW/UPDATED: Search Location Function ---
async function searchLocation() {
    const query = searchInput.value;
    if (!query) return;

    showSpinner();
    // NEW: Clear any previous temporary marker
    if (temporaryMarker) {
        map.removeLayer(temporaryMarker);
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.length > 0) {
            const result = data[0];
            const latlng = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
            map.setView(latlng, 14);

            // NEW: Add a temporary, distinct marker instead of adding to the route
            temporaryMarker = L.marker(latlng, {
                icon: L.icon({ // Custom icon for the temporary marker
                    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
                })
            }).addTo(map);

            temporaryMarker.bindPopup("<b>Location Found!</b><br>Click here to add to route.").openPopup();
            temporaryMarker.on('click', () => addStop(latlng));

            searchInput.value = '';
        } else {
            showNotification('Location not found.');
        }
    } catch (error) {
        // ... (error handling)
    } finally {
        hideSpinner();
    }
}

// UPDATED: The optimizeRoute function now displays the distance
async function optimizeRoute() {
    if (stops.length < 2) {
        showNotification("Please add at least 2 stops to optimize.");
        return;
    }

    showSpinner();
    try {
        const response = await fetch('http://127.0.0.1:5000/api/optimize-route', { // Ensure URL is correct
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stops: stops })
        });
        const data = await response.json();

        // ... (code to reorder and redraw markers) ...

        updateSidebar();
        drawRoute(stops);

        // NEW: Display the route distance
        const routeInfo = document.getElementById('route-info');
        // A rough conversion from lat/lon degrees to km. Replace with a real API for accuracy.
        const distanceInKm = data.total_distance * 111.32;
        routeInfo.textContent = `Optimized Route Distance: ${distanceInKm.toFixed(2)} km`;

    } catch (error) {
        // ... (error handling)
    } finally {
        hideSpinner();
    }
}
// --- Event Listeners ---
map.on('click', (e) => addStop(e.latlng));
document.getElementById('optimize-button').addEventListener('click', optimizeRoute);
document.getElementById('clear-button').addEventListener('click', clearRoute); // NEW
document.getElementById('search-button').addEventListener('click', searchLocation); // NEW
searchInput.addEventListener('keypress', function (e) { // NEW: Allow 'Enter' to search
    if (e.key === 'Enter') searchLocation();
});


// --- Initial UI Update ---
updateSidebar(); // Show initial "No stops" message