# -*- coding: utf-8 -*-
import os
import torch
from .config import config, logger

class OptimizedDetector:
    def __init__(self):
        if not os.path.exists(config.MODEL_PATH):
            raise FileNotFoundError(f"模型檔案未找到: {config.MODEL_PATH}")
        try:
            from ultralytics import YOLO
            self.model = YOLO(config.MODEL_PATH)
            self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
            logger.info(f"使用設備: {self.device}")
            if torch.cuda.is_available():
                self.model.to(self.device)
        except Exception as e:
            logger.error(f"無法載入模型: {e}")
            raise

    def detect(self, image):
        try:
            if image is None or image.size == 0:
                return None
            results = self.model(
                image,
                device=self.device,
                verbose=False,
                conf=config.CONFIDENCE_THRESHOLD,
                iou=config.IOU_THRESHOLD,
                imgsz=640
            )
            return results
        except Exception as e:
            logger.error(f"偵測失敗: {e}")
            return None
