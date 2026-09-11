# -*- coding: utf-8 -*-
import threading
import queue
import logging
from dataclasses import dataclass

# ==================== 配置管理 ====================
@dataclass
class SystemConfig:
    MODEL_PATH: str = "yolov8n.pt"
    FONT_SIZE: int = 24
    TRACK_HISTORY_LENGTH: int = 20
    MAX_FRAME_WIDTH: int = 1280
    MAX_FRAME_HEIGHT: int = 720
    SKIP_FRAMES: int = 2
    FPS_LIMIT: int = 15
    CONFIDENCE_THRESHOLD: float = 0.4
    IOU_THRESHOLD: float = 0.5
    MIN_DETECTION_AREA: int = 500
    MAX_MATCHING_DISTANCE: float = 30.0
    FOV_DEGREES: float = 60.0
    AIS_UPDATE_INTERVAL: int = 10
    LOCATION_UPDATE_INTERVAL: int = 300

config = SystemConfig()

# ==================== 日誌設置 ====================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== 全域變數 ====================
AIS_DATA_FILE = "ais_data.json"
SCREENSHOT_FOLDER = "screenshots"
UPLOAD_FOLDER = "uploads"

ais_data = []
matched_ships_list = []
current_lat = 22.62
current_lng = 120.30
manual_heading = 270
manual_lat = None
manual_lng = None

detection_mode = 'camera'   # 'camera', 'image', 'video'
image_to_process = None
video_to_process = None
current_annotated_frame = None

# ==================== 鎖與事件 ====================
frame_lock = threading.RLock()
ais_data_lock = threading.RLock()
stop_threads = threading.Event()
location_lock = threading.RLock()
heading_lock = threading.RLock()
matched_ships_lock = threading.RLock()
config_lock = threading.RLock()

# ==================== 佇列 ====================
frame_queue = queue.Queue(maxsize=2)
annotated_frame_queue = queue.Queue(maxsize=2)
stream_queue = queue.Queue(maxsize=3)
