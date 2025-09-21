from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import math

# --- App Setup ---
app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# --- Routes ---
@app.route('/')
def index():
    return render_template('index.html')

# --- TSP Core Algorithm ---
def calculate_distance(p1, p2):
    return math.sqrt((p1['lat'] - p2['lat'])**2 + (p1['lng'] - p2['lng'])**2)

def solve_tsp_nearest_neighbour(points):
    if not points:
        return [], 0

    num_points = len(points)
    unvisited = list(range(num_points))
    tour = []
    total_distance = 0.0

    current_index = 0
    start_index = 0
    tour.append(unvisited.pop(unvisited.index(current_index)))

    while unvisited:
        nearest_index = -1
        min_distance = float('inf')

        for index in unvisited:
            distance = calculate_distance(points[current_index], points[index])
            if distance < min_distance:
                min_distance = distance
                nearest_index = index

        total_distance += min_distance
        current_index = nearest_index
        tour.append(unvisited.pop(unvisited.index(current_index)))

    # Add distance from last to start
    total_distance += calculate_distance(points[current_index], points[start_index])

    optimized_route = [points[i] for i in tour]
    return optimized_route, total_distance

# --- API Endpoint ---
@app.route('/api/optimize-route', methods=['POST'])
def optimize_route_endpoint():
    data = request.get_json()
    if not data or 'stops' not in data:
        return jsonify({"error": "Invalid input"}), 400

    stops = data['stops']
    optimized_route, total_distance = solve_tsp_nearest_neighbour(stops)

    return jsonify({
        "optimized_route": optimized_route,
        "total_distance": total_distance
    })

# --- Run Server ---
if __name__ == '__main__':
    app.run(debug=True)
