# -*- coding: utf-8 -*-
import math
import os
import geopy.distance
from datetime import datetime
from PIL import ImageFont
from .config import config, logger, location_lock

# ==================== 工具函數 ====================
def validate_ais_data(ship_data):
    try:
        required_fields = ['船名', 'MMSI', '緯度', '經度']
        if not all(field in ship_data for field in required_fields):
            return False
        lat, lng = float(ship_data['緯度']), float(ship_data['經度'])
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            return False
        mmsi = str(ship_data['MMSI'])
        if not (mmsi.isdigit() and len(mmsi) == 9):
            return False
        return True
    except Exception:
        return False


def calculate_distance(lat1, lng1, lat2, lng2):
    try:
        return geopy.distance.geodesic((lat1, lng1), (lat2, lng2)).kilometers
    except Exception as e:
        logger.error(f"距離計算錯誤: {e}")
        return float('inf')


def calculate_bearing(lat1, lng1, lat2, lng2):
    try:
        lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
        d_lng = lng2 - lng1
        y = math.sin(d_lng) * math.cos(lat2)
        x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lng)
        bearing = (math.degrees(math.atan2(y, x)) + 360) % 360
        return bearing
    except Exception as e:
        logger.error(f"方位角計算錯誤: {e}")
        return 0.0


def pixel_to_bearing(x_pixel: float, frame_width: int,
                     camera_heading: float, fov_degrees: float) -> float:
    """Map pixel x-coordinate to absolute compass bearing.

    Center of frame = camera_heading.
    Left edge = heading - fov/2, right edge = heading + fov/2.
    """
    offset = (x_pixel - frame_width / 2) * (fov_degrees / frame_width)
    return (camera_heading + offset + 360) % 360


def get_chinese_font(font_size=14):
    candidate_fonts = [
        "C:\\Windows\\Fonts\\msjh.ttc",
        "C:\\Windows\\Fonts\\kaiu.ttf",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"
    ]
    for path in candidate_fonts:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, font_size)
            except Exception:
                continue
    return ImageFont.load_default()


def _bearing_label(x_center, frame_width):
    if frame_width is None or frame_width == 0:
        return '--'
    center_threshold = frame_width * 0.1
    if abs(x_center - frame_width / 2) < center_threshold:
        return '正前方'
    elif x_center < frame_width / 2:
        return '左側'
    else:
        return '右側'


# ==================== 船舶匹配函數 ====================
def optimized_match_ships(tracked_detections, ais_data_local, sensor_heading,
                          frame_width=None, fov_degrees=None):
    """Match visual tracks to AIS records using per-pixel bearing (±5° tolerance)."""
    from .config import current_lat, current_lng, manual_lat, manual_lng

    if not tracked_detections or not ais_data_local:
        return []

    with location_lock:
        current_lat_copy = manual_lat if manual_lat is not None else current_lat
        current_lng_copy = manual_lng if manual_lng is not None else current_lng

    fov = fov_degrees if fov_degrees is not None else config.FOV_DEGREES

    nearby_ships = []
    for ship in ais_data_local[:100]:
        if not validate_ais_data(ship):
            continue
        try:
            distance = calculate_distance(current_lat_copy, current_lng_copy,
                                          ship['緯度'], ship['經度'])
            if distance <= config.MAX_MATCHING_DISTANCE:
                ais_bearing = calculate_bearing(current_lat_copy, current_lng_copy,
                                                ship['緯度'], ship['經度'])
                bearing_diff = abs((ais_bearing - sensor_heading + 360) % 360)
                if bearing_diff > 180:
                    bearing_diff = 360 - bearing_diff
                if bearing_diff <= fov / 2:
                    ship_copy = ship.copy()
                    ship_copy['距離'] = distance
                    ship_copy['bearing_diff'] = bearing_diff
                    ship_copy['ais_bearing'] = ais_bearing
                    nearby_ships.append(ship_copy)
        except Exception:
            continue

    nearby_ships.sort(key=lambda x: (x['距離'], x['bearing_diff']))
    used_ships = set()
    final_matches = []

    for track in tracked_detections[:10]:
        det = track['detection']
        best_ship = None
        best_score = float('inf')

        box = det['box']
        box_x_center = (box[0] + box[2]) / 2

        if frame_width is not None and frame_width > 0:
            track_bearing = pixel_to_bearing(box_x_center, frame_width, sensor_heading, fov)
            bearing_tolerance = 5.0
        else:
            track_bearing = None
            bearing_tolerance = fov / 2

        for ship in nearby_ships:
            if ship['MMSI'] in used_ships:
                continue
            if track_bearing is not None:
                diff = abs((ship['ais_bearing'] - track_bearing + 360) % 360)
                if diff > 180:
                    diff = 360 - diff
                if diff > bearing_tolerance:
                    continue
                score = ship['距離'] + diff * 0.5
            else:
                score = ship['距離'] + ship['bearing_diff'] * 0.5

            if score < best_score:
                best_score = score
                best_ship = ship

        if best_ship:
            used_ships.add(best_ship['MMSI'])
            bearing_val = round(track_bearing if track_bearing is not None
                                else best_ship['ais_bearing'], 1)

            clean_ship_data = {
                '時間': datetime.now().isoformat(),
                '船名': best_ship.get('船名', '--'),
                'MMSL': best_ship.get('MMSI', best_ship.get('MMSL', '--')),
                '距離_km': round(best_ship.get('距離', 0), 3),
                '緯度': best_ship.get('緯度', 0),
                '經度': best_ship.get('經度', 0),
                '方位角': bearing_val,
                '方位': _bearing_label(box_x_center, frame_width),
                '航速_節': best_ship.get('航速', best_ship.get('速度', 0)),
                '追蹤ID': track['id']
            }
            final_matches.append({'box': det['box'], 'ship': clean_ship_data,
                                   'conf': det.get('conf', 0.0)})

    return final_matches
