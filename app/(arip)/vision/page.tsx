import type { Metadata } from 'next';
import { ARIPPageShell } from '@/components/arip/ARIPPageShell';
import { ARIPComingSoon } from '@/components/arip/ARIPComingSoon';

export const metadata: Metadata = { title: 'Vision' };

export default function VisionPage() {
  return (
    <ARIPPageShell
      title="Vision Manager"
      description="Connect cameras and run object detection, tracking, and segmentation"
    >
      <ARIPComingSoon
        module="Vision Pipeline"
        description="Connect YOLO, TensorRT, OpenCV, OCR, or custom vision models. Stream from IP cameras, RTSP feeds, or USB devices with real-time detection overlays."
      />
    </ARIPPageShell>
  );
}
