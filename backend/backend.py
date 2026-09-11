# -*- coding: utf-8 -*-
"""
ShipTracker Web Backend
FastAPI server: MJPEG video stream, WebSocket status, REST API.
Run: uvicorn backend:app --host 0.0.0.0 --port 8000
"""

import asyncio
import gc
import json
import os
import queue
import shutil
import threading
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

import cv2
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import requests
import torch
from fastapi import FastAPI, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import core.config as cfg
from core.config import (
    AIS_DATA_FILE, SCREENSHOT_FOLDER, UPLOAD_FOLDER,
    annotated_frame_queue, ais_data, ais_data_lock,
    config, config_lock,
    frame_lock, frame_queue,
    heading_lock, location_lock, logger,
    matched_ships_list, matched_ships_lock,
    stop_threads, stream_queue,
)
from core.detector import OptimizedDetector
from core.matcher import get_chinese_font, optimized_match_ships, validate_ais_data
from core.tracker import OptimizedShipTracker

# ==================== WebSocket 管理 ====================
connected_websockets: set = set()

optimized_detector: Optional[OptimizedDetector] = None
ship_tracker_global: Optional[OptimizedShipTracker] = None


def cleanup_memory():
    try:
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception as e:
        logger.warning(f"記憶體清理警告: {e}")


# ==================== 線程：視頻捕獲 ====================
def video_capture_thread():
    local_cap = None
    last_mode = None

    while not stop_threads.is_set():
        try:
            mode = cfg.detection_mode

            if last_mode != mode:
                logger.info(f"模式切換: {last_mode} -> {mode}")
                if local_cap is not None:
                    local_cap.release()
                    local_cap = None
                last_mode = mode

            if mode == 'camera':
                if local_cap is None or not local_cap.isOpened():
                    local_cap = cv2.VideoCapture(0)
                    local_cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.MAX_FRAME_WIDTH)
                    local_cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.MAX_FRAME_HEIGHT)
                    logger.info("攝影機已初始化")

                if local_cap.isOpened():
                    ret, frame = local_cap.read()
                    if ret and frame is not None:
                        try:
                            frame_queue.put(frame, block=False)
                        except queue.Full:
                            pass
                    else:
                        logger.warning("無法從攝影機讀取畫面")

            elif mode == 'image':
                img = cfg.image_to_process
                if img is not None:
                    try:
                        frame_queue.put(img.copy(), block=False)
                    except queue.Full:
                        pass
                stop_threads.wait(0.5)

            elif mode == 'video':
                vpath = cfg.video_to_process
                if vpath is not None:
                    if local_cap is None or not local_cap.isOpened():
                        if local_cap is not None:
                            local_cap.release()
                        logger.info(f"開啟影片: {vpath}")
                        local_cap = cv2.VideoCapture(vpath)

                    if local_cap.isOpened():
                        ret, frame = local_cap.read()
                        if ret and frame is not None:
                            try:
                                if frame_queue.full():
                                    try:
                                        frame_queue.get_nowait()
                                    except queue.Empty:
                                        pass
                                frame_queue.put(frame, block=False)
                            except Exception:
                                pass
                        else:
                            logger.info("影片播放完畢，重新開始")
                            local_cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                else:
                    stop_threads.wait(1.0)

            stop_threads.wait(1.0 / config.FPS_LIMIT)
        except Exception as e:
            logger.error(f"視頻捕獲錯誤: {e}", exc_info=True)
            stop_threads.wait(1.0)

    if local_cap:
        local_cap.release()
        logger.info("視頻捕獲線程已關閉")


# ==================== 線程：YOLO 處理 ====================
def yolo_processing_thread(tracker: OptimizedShipTracker):
    global optimized_detector
    from PIL import Image, ImageDraw

    if optimized_detector is None:
        try:
            optimized_detector = OptimizedDetector()
        except Exception as e:
            logger.error(f"無法載入偵測器: {e}")
            return

    font = get_chinese_font(config.FONT_SIZE)

    while not stop_threads.is_set():
        try:
            try:
                frame_to_process = frame_queue.get(timeout=0.1)
            except queue.Empty:
                stop_threads.wait(0.01)
                continue

            with ais_data_lock:
                current_ais = ais_data[:100] if ais_data else []

            results = optimized_detector.detect(frame_to_process)
            h, w = frame_to_process.shape[:2]

            pil_image = Image.fromarray(cv2.cvtColor(frame_to_process, cv2.COLOR_BGR2RGB))
            draw = ImageDraw.Draw(pil_image)

            if not results or len(getattr(results[0], 'boxes', [])) == 0:
                with matched_ships_lock:
                    cfg.matched_ships_list.clear()
            else:
                try:
                    boxes_xy = results[0].boxes.xyxy.cpu().numpy()
                    conf_scores = results[0].boxes.conf.cpu().numpy()
                except Exception:
                    boxes_xy = np.array(results[0].boxes.xyxy)
                    conf_scores = np.zeros(len(boxes_xy))

                yolo_detections = []
                for i, det in enumerate(boxes_xy[:10]):
                    x1, y1, x2, y2 = map(float, det)
                    area = (x2 - x1) * (y2 - y1)
                    conf = float(conf_scores[i]) if i < len(conf_scores) else 0.0
                    if area > config.MIN_DETECTION_AREA:
                        yolo_detections.append({
                            'box': [x1, y1, x2, y2],
                            'area': area,
                            'conf': conf
                        })

                tracked = tracker.update(yolo_detections)

                with config_lock:
                    fov = config.FOV_DEGREES
                sensor_heading = cfg.manual_heading

                matched = optimized_match_ships(
                    tracked, current_ais, sensor_heading,
                    frame_width=w, fov_degrees=fov
                )

                with matched_ships_lock:
                    cfg.matched_ships_list.clear()
                    cfg.matched_ships_list.extend([m['ship'] for m in matched])

                matched_map = {m['ship'].get('追蹤ID'): m for m in matched}

                # 標注風格對齊原始 open5.py：
                # 未匹配 → 青框 + "boat 0.83" 在框內
                # 已匹配 → 藍框 + "boat 0.83" 在框內 + AIS 資訊在框下方
                for track in tracked[:10]:
                    x1, y1, x2, y2 = map(int, track['detection']['box'])
                    track_conf = track['detection'].get('conf', 0.0)
                    conf_text = f"boat  {track_conf:.2f}"

                    if track['id'] in matched_map:
                        m = matched_map[track['id']]
                        ship_name = m['ship'].get('船名', '--')
                        dist = m['ship'].get('距離_km', 0)
                        bearing_dir = m['ship'].get('方位', '')
                        draw.rectangle((x1, y1, x2, y2), outline=(100, 180, 255), width=3)
                        draw.text((x1 + 4, y1 + 4), conf_text, font=font, fill=(255, 255, 255))
                        ais_line = f"船名: {ship_name}，距離: {dist:.1f} 公里"
                        if bearing_dir and bearing_dir != '--':
                            ais_line += f"  {bearing_dir}"
                        try:
                            ab = font.getbbox(ais_line)
                            aw, ah = ab[2] - ab[0], ab[3] - ab[1]
                        except Exception:
                            aw, ah = 200, 24
                        draw.rectangle((x1, y2 + 2, x1 + aw + 10, y2 + ah + 10),
                                       fill=(0, 0, 0, 180))
                        draw.text((x1 + 5, y2 + 4), ais_line, font=font, fill=(0, 255, 100))
                    else:
                        draw.rectangle((x1, y1, x2, y2), outline=(0, 255, 255), width=2)
                        draw.text((x1 + 4, y1 + 4), conf_text, font=font, fill=(0, 255, 255))

            annotated_np = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
            cfg.current_annotated_frame = annotated_np.copy()

            try:
                annotated_frame_queue.put(annotated_np, block=False)
            except queue.Full:
                pass

        except Exception as e:
            logger.error(f"YOLO處理錯誤: {e}", exc_info=True)
            stop_threads.wait(0.1)


# ==================== 線程：MJPEG 編碼 ====================
def mjpeg_encoder_thread():
    while not stop_threads.is_set():
        try:
            try:
                frame = annotated_frame_queue.get(timeout=0.5)
            except queue.Empty:
                continue

            ret, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            if not ret:
                continue

            b = buf.tobytes()
            chunk = (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(b)).encode() + b"\r\n\r\n"
                + b + b"\r\n"
            )
            try:
                stream_queue.put(chunk, block=False)
            except queue.Full:
                try:
                    stream_queue.get_nowait()
                except queue.Empty:
                    pass
                try:
                    stream_queue.put(chunk, block=False)
                except queue.Full:
                    pass
        except Exception as e:
            logger.error(f"MJPEG編碼錯誤: {e}")


# ==================== 線程：AIS 讀取 ====================
def ais_data_reader_thread():
    while not stop_threads.is_set():
        _reload_ais_once()
        stop_threads.wait(config.AIS_UPDATE_INTERVAL)


def _reload_ais_once() -> int:
    if os.path.exists(AIS_DATA_FILE):
        try:
            with open(AIS_DATA_FILE, "r", encoding="utf-8") as f:
                new_data = json.load(f)
            valid = [s for s in new_data if validate_ais_data(s)]
            unique = list({s.get('MMSI'): s for s in valid}.values())[:200]
            with ais_data_lock:
                ais_data.clear()
                ais_data.extend(unique)
            logger.info(f"AIS數據更新: {len(unique)} 筆")
            return len(unique)
        except Exception as e:
            logger.error(f"AIS讀取錯誤: {e}")
            return -1
    return 0


# ==================== 線程：自動定位 ====================
def get_location_thread():
    while not stop_threads.is_set():
        if cfg.manual_lat is None:
            try:
                response = requests.get('http://ip-api.com/json/', timeout=10)
                data = response.json()
                if data.get('status') == 'success':
                    with location_lock:
                        cfg.current_lat = data['lat']
                        cfg.current_lng = data['lon']
                    logger.info(f"位置自動更新: {cfg.current_lat:.4f}, {cfg.current_lng:.4f}")
            except Exception as e:
                logger.error(f"位置獲取錯誤: {e}")
        stop_threads.wait(config.LOCATION_UPDATE_INTERVAL)


# ==================== 截圖 ====================
def capture_screenshot() -> dict:
    os.makedirs(SCREENSHOT_FOLDER, exist_ok=True)

    if cfg.current_annotated_frame is None:
        raise ValueError("目前沒有可用的畫面")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    img_path = os.path.join(SCREENSHOT_FOLDER, f"screenshot_{timestamp}.jpg")
    cv2.imwrite(img_path, cfg.current_annotated_frame)

    with location_lock:
        lat = cfg.manual_lat if cfg.manual_lat is not None else cfg.current_lat
        lng = cfg.manual_lng if cfg.manual_lng is not None else cfg.current_lng

    with matched_ships_lock:
        ships_copy = list(cfg.matched_ships_list)

    data = {
        "擷取時間": datetime.now().isoformat(),
        "GPS位置": {"緯度": lat, "經度": lng},
        "偵測模式": cfg.detection_mode,
        "偵測船隻數量": len(ships_copy),
        "船隻資料": [
            {
                "船名": s.get('船名', '--'),
                "MMSI": s.get('MMSL', '--'),
                "距離_km": round(s.get('距離_km', 0), 2),
                "航速_節": s.get('航速_節', 0),
                "方位角": s.get('方位角', '--'),
                "方位": s.get('方位', '--'),
                "緯度": s.get('緯度', 0),
                "經度": s.get('經度', 0),
            }
            for s in ships_copy
        ]
    }

    json_path = os.path.join(SCREENSHOT_FOLDER, f"data_{timestamp}.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    txt_path = os.path.join(SCREENSHOT_FOLDER, f"report_{timestamp}.txt")
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write("=" * 60 + "\n船舶偵測報告\n" + "=" * 60 + "\n\n")
        f.write(f"擷取時間: {data['擷取時間']}\n")
        f.write(f"GPS位置: 緯度 {lat:.6f}°, 經度 {lng:.6f}°\n")
        f.write(f"偵測模式: {data['偵測模式']}\n")
        f.write(f"偵測船隻數量: {data['偵測船隻數量']} 艘\n\n")
        for idx, s in enumerate(data['船隻資料'], 1):
            f.write(f"船隻 {idx}:\n")
            f.write(f"  船名: {s['船名']}\n")
            f.write(f"  MMSI: {s['MMSI']}\n")
            f.write(f"  距離: {s['距離_km']} 公里\n")
            f.write(f"  航速: {s['航速_節']} 節\n")
            f.write(f"  方位: {s['方位']} ({s['方位角']}°)\n")
            f.write(f"  座標: ({s['緯度']:.6f}, {s['經度']:.6f})\n\n")

    logger.info(f"截圖已儲存: {img_path}")
    return {
        "image": os.path.basename(img_path),
        "json": os.path.basename(json_path),
        "txt": os.path.basename(txt_path),
        "ship_count": len(ships_copy),
    }


# ==================== WebSocket 廣播 ====================
async def ws_broadcaster():
    while True:
        await asyncio.sleep(0.5)
        if not connected_websockets:
            continue

        with matched_ships_lock:
            ships_copy = list(cfg.matched_ships_list)
        with location_lock:
            lat = cfg.manual_lat if cfg.manual_lat is not None else cfg.current_lat
            lng = cfg.manual_lng if cfg.manual_lng is not None else cfg.current_lng
            loc_mode = "manual" if cfg.manual_lat is not None else "auto"
        with ais_data_lock:
            ais_count = len(ais_data)

        payload = json.dumps({
            "ships": ships_copy,
            "gps": {"lat": lat, "lng": lng, "mode": loc_mode},
            "detection_mode": cfg.detection_mode,
            "ship_count": len(ships_copy),
            "ais_count": ais_count,
            "heading": cfg.manual_heading,
            "fov": config.FOV_DEGREES,
        }, ensure_ascii=False)

        dead = set()
        for ws in list(connected_websockets):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        connected_websockets.difference_update(dead)


# ==================== FastAPI lifespan ====================
@asynccontextmanager
async def lifespan(app: FastAPI):
    global ship_tracker_global
    os.makedirs(SCREENSHOT_FOLDER, exist_ok=True)
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    ship_tracker_global = OptimizedShipTracker()

    threads = [
        threading.Thread(target=get_location_thread, daemon=True, name="location"),
        threading.Thread(target=ais_data_reader_thread, daemon=True, name="ais_reader"),
        threading.Thread(target=video_capture_thread, daemon=True, name="capture"),
        threading.Thread(target=lambda: yolo_processing_thread(ship_tracker_global),
                         daemon=True, name="yolo"),
        threading.Thread(target=mjpeg_encoder_thread, daemon=True, name="mjpeg"),
    ]
    for t in threads:
        t.start()
        logger.info(f"線程已啟動: {t.name}")

    asyncio.create_task(ws_broadcaster())
    logger.info("ShipTracker Web 後端已啟動，開啟瀏覽器: http://localhost:8000")

    yield

    logger.info("正在關閉系統...")
    stop_threads.set()
    cleanup_memory()


# ==================== FastAPI App ====================
app = FastAPI(title="ShipTracker Web")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----- MJPEG 串流 -----
async def mjpeg_generator():
    while True:
        chunk = await asyncio.to_thread(stream_queue.get)
        yield chunk


@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(
        mjpeg_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# ----- WebSocket -----
@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        connected_websockets.discard(websocket)


# ----- 首頁 -----
@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = Path(__file__).parent / "static" / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/screenshots", StaticFiles(directory=SCREENSHOT_FOLDER), name="screenshots")


# ----- API: 狀態 -----
@app.get("/api/status")
async def api_status():
    with matched_ships_lock:
        ship_count = len(cfg.matched_ships_list)
    with location_lock:
        lat = cfg.manual_lat if cfg.manual_lat is not None else cfg.current_lat
        lng = cfg.manual_lng if cfg.manual_lng is not None else cfg.current_lng
    with ais_data_lock:
        ais_count = len(ais_data)
    return {
        "detection_mode": cfg.detection_mode,
        "ship_count": ship_count,
        "ais_count": ais_count,
        "gps": {"lat": lat, "lng": lng,
                "mode": "manual" if cfg.manual_lat is not None else "auto"},
        "heading": cfg.manual_heading,
        "fov": config.FOV_DEGREES,
    }


@app.get("/api/ships")
async def api_ships():
    with matched_ships_lock:
        return list(cfg.matched_ships_list)


# ----- API: GPS 位置 -----
class LocationBody(BaseModel):
    lat: float
    lng: float

@app.post("/api/location")
async def set_location(body: LocationBody):
    if not (-90 <= body.lat <= 90 and -180 <= body.lng <= 180):
        raise HTTPException(status_code=400, detail="座標超出有效範圍")
    with location_lock:
        cfg.manual_lat = body.lat
        cfg.manual_lng = body.lng
    return {"status": "ok", "lat": body.lat, "lng": body.lng}

@app.delete("/api/location")
async def reset_location():
    with location_lock:
        cfg.manual_lat = None
        cfg.manual_lng = None
    return {"status": "ok", "mode": "auto"}


# ----- API: 航向 -----
class HeadingBody(BaseModel):
    heading: float

@app.post("/api/heading")
async def set_heading(body: HeadingBody):
    with heading_lock:
        cfg.manual_heading = body.heading % 360
    return {"status": "ok", "heading": cfg.manual_heading}


# ----- API: FOV 設定 -----
class ConfigBody(BaseModel):
    fov_degrees: Optional[float] = None

@app.post("/api/config")
async def set_config(body: ConfigBody):
    with config_lock:
        if body.fov_degrees is not None:
            if not (10 <= body.fov_degrees <= 180):
                raise HTTPException(status_code=400, detail="FOV 需在 10°~180° 之間")
            config.FOV_DEGREES = body.fov_degrees
    return {"status": "ok", "fov": config.FOV_DEGREES}


# ----- API: 模式切換 -----
class ModeBody(BaseModel):
    mode: str

@app.post("/api/mode")
async def set_mode(body: ModeBody):
    if body.mode not in ('camera', 'image', 'video'):
        raise HTTPException(status_code=400, detail="無效模式")
    cfg.detection_mode = body.mode
    if body.mode == 'camera':
        cfg.image_to_process = None
        cfg.video_to_process = None
    return {"status": "ok", "mode": body.mode}


# ----- API: 上傳圖片 -----
@app.post("/api/upload/image")
async def upload_image(file: UploadFile):
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    dest = os.path.join(UPLOAD_FOLDER, file.filename or "upload.jpg")
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    img = cv2.imread(dest)
    if img is None:
        raise HTTPException(status_code=400, detail="無法讀取圖片")

    with frame_lock:
        cfg.image_to_process = img
    cfg.detection_mode = 'image'
    return {"status": "ok", "filename": file.filename, "mode": "image"}


# ----- API: 上傳影片 -----
@app.post("/api/upload/video")
async def upload_video(file: UploadFile):
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    dest = os.path.join(UPLOAD_FOLDER, file.filename or "upload.mp4")

    CHUNK = 1024 * 1024
    with open(dest, "wb") as f:
        while True:
            chunk = file.file.read(CHUNK)
            if not chunk:
                break
            f.write(chunk)

    test_cap = cv2.VideoCapture(dest)
    if not test_cap.isOpened():
        test_cap.release()
        raise HTTPException(status_code=400, detail="無法讀取影片")
    total = int(test_cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = test_cap.get(cv2.CAP_PROP_FPS)
    w = int(test_cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(test_cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    test_cap.release()

    while not frame_queue.empty():
        try:
            frame_queue.get_nowait()
        except queue.Empty:
            break

    with frame_lock:
        cfg.video_to_process = dest
        cfg.image_to_process = None
    cfg.detection_mode = 'video'

    return {
        "status": "ok",
        "filename": file.filename,
        "mode": "video",
        "total_frames": total,
        "fps": round(fps, 2),
        "resolution": f"{w}x{h}",
        "duration_sec": round(total / fps, 2) if fps > 0 else 0,
    }


# ----- API: 截圖 -----
@app.post("/api/screenshot")
async def take_screenshot():
    try:
        result = await asyncio.to_thread(capture_screenshot)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"截圖失敗: {e}")
        raise HTTPException(status_code=500, detail=f"截圖失敗: {e}")


@app.get("/api/screenshot/{filename}")
async def download_screenshot(filename: str):
    path = os.path.join(SCREENSHOT_FOLDER, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="找不到檔案")
    return FileResponse(path)


# ----- API: 匯出偵測資料 -----
@app.get("/api/export")
async def export_data():
    with matched_ships_lock:
        ships_copy = list(cfg.matched_ships_list)
    with location_lock:
        lat = cfg.manual_lat if cfg.manual_lat is not None else cfg.current_lat
        lng = cfg.manual_lng if cfg.manual_lng is not None else cfg.current_lng

    export = {
        "匯出時間": datetime.now().isoformat(),
        "GPS": {"緯度": lat, "經度": lng},
        "偵測模式": cfg.detection_mode,
        "航向": cfg.manual_heading,
        "FOV": config.FOV_DEGREES,
        "船隻數量": len(ships_copy),
        "船隻資料": ships_copy,
    }
    content = json.dumps(export, ensure_ascii=False, indent=2)
    fname = f"ships_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


# ----- API: 手動刷新 AIS -----
@app.post("/api/ais/refresh")
async def ais_refresh():
    count = await asyncio.to_thread(_reload_ais_once)
    if count < 0:
        raise HTTPException(status_code=500, detail="AIS 檔案讀取失敗")
    return {"status": "ok", "count": count}


# ==================== 啟動入口 ====================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend:app", host="0.0.0.0", port=8000, reload=False)
