# -*- coding: utf-8 -*-
import threading
import numpy as np
from collections import deque
from .config import config

# ==================== Kalman 濾波器 ====================
class KalmanBoxTracker:
    """4-state Kalman filter [x, y, vx, vy] for stable track prediction."""

    def __init__(self, x, y):
        self.x = np.array([[x], [y], [0.], [0.]], dtype=float)
        self.P = np.eye(4) * 500.0
        self.F = np.array([[1, 0, 1, 0],
                           [0, 1, 0, 1],
                           [0, 0, 1, 0],
                           [0, 0, 0, 1]], dtype=float)
        self.H = np.array([[1, 0, 0, 0],
                           [0, 1, 0, 0]], dtype=float)
        self.R = np.eye(2) * 10.0   # measurement noise
        self.Q = np.eye(4) * 1.0    # process noise

    def predict(self):
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q
        return float(self.x[0]), float(self.x[1])

    def update(self, x, y):
        z = np.array([[x], [y]], dtype=float)
        y_ = z - self.H @ self.x
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + K @ y_
        self.P = (np.eye(4) - K @ self.H) @ self.P


# ==================== 船舶追蹤類 ====================
class OptimizedShipTracker:
    def __init__(self, max_age=15, min_hits=2):
        self.tracks = {}
        self.next_id = 1
        self.max_age = max_age
        self.min_hits = min_hits
        self.lock = threading.RLock()

    def update(self, detections):
        with self.lock:
            if not detections:
                tracks_to_delete = []
                for track_id in list(self.tracks.keys()):
                    self.tracks[track_id]['age'] += 1
                    if self.tracks[track_id]['age'] > self.max_age:
                        tracks_to_delete.append(track_id)
                for track_id in tracks_to_delete:
                    del self.tracks[track_id]
                return []

            matched_tracks = {}
            for detection in detections:
                x_center = float((detection['box'][0] + detection['box'][2]) / 2)
                y_center = float((detection['box'][1] + detection['box'][3]) / 2)
                best_match = None
                best_distance = 150

                for track_id, track in list(self.tracks.items()):
                    if track_id in matched_tracks:
                        continue
                    px, py = track['kalman'].predict()
                    distance = abs(x_center - px) + abs(y_center - py)
                    if distance < best_distance:
                        best_distance = distance
                        best_match = track_id

                if best_match:
                    self.tracks[best_match]['kalman'].update(x_center, y_center)
                    self.tracks[best_match]['history'].append((x_center, y_center))
                    self.tracks[best_match]['age'] = 0
                    self.tracks[best_match]['hits'] += 1
                    self.tracks[best_match]['detection'] = detection
                    matched_tracks[best_match] = True
                else:
                    self.tracks[self.next_id] = {
                        'kalman': KalmanBoxTracker(x_center, y_center),
                        'history': deque([(x_center, y_center)], maxlen=config.TRACK_HISTORY_LENGTH),
                        'age': 0,
                        'hits': 1,
                        'detection': detection
                    }
                    self.next_id += 1

            tracks_to_delete = []
            for track_id in list(self.tracks.keys()):
                if track_id not in matched_tracks:
                    self.tracks[track_id]['age'] += 1
                    if self.tracks[track_id]['age'] > self.max_age:
                        tracks_to_delete.append(track_id)
            for track_id in tracks_to_delete:
                del self.tracks[track_id]

            stable_tracks = []
            for track_id, track in list(self.tracks.items()):
                if track['hits'] >= self.min_hits and track['age'] == 0:
                    stable_tracks.append({
                        'id': track_id,
                        'detection': track['detection'],
                        'history': list(track['history'])[-5:]
                    })
            return stable_tracks
