export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisionDetection {
  label: string;
  confidence: number;
  boundingBox: BoundingBox;
  trackId?: string;
  metadata?: Record<string, unknown>;
}

export interface VisionFrame {
  id: string;
  timestamp: Date;
  sourceId: string;
  width: number;
  height: number;
  detections: VisionDetection[];
  rawBuffer?: Buffer;
}

export interface VisionStreamConfig {
  sourceId: string;
  url: string;
  fps?: number;
  resolution?: { width: number; height: number };
  modelName?: string;
}

export interface VisionProvider {
  readonly name: string;
  readonly supportedModels: string[];

  detect(imageBuffer: Buffer, modelName?: string): Promise<VisionDetection[]>;
  analyzeFrame(frame: VisionFrame): Promise<VisionFrame>;
  startStream(config: VisionStreamConfig): Promise<string>;
  stopStream(streamId: string): Promise<void>;
  captureSnapshot(streamId: string): Promise<Buffer>;
  onFrame(streamId: string, handler: (frame: VisionFrame) => void): () => void;
}
