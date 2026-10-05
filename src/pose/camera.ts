import { t } from '../i18n';

export interface CameraInfo {
  id: string;
  label: string;
}

/**
 * Starts the webcam (optionally a specific one) and attaches it to the video
 * element. A previously running stream is stopped first.
 */
export async function startCamera(video: HTMLVideoElement, width: number, height: number, deviceId?: string | null): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(t('startup.noCameraApi'));
  }
  stopCamera(video);
  const constraints: MediaTrackConstraints = { width: { ideal: width }, height: { ideal: height } };
  if (deviceId) constraints.deviceId = { exact: deviceId };
  else constraints.facingMode = 'user';
  const stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.onloadedmetadata = () => resolve();
  });
  await video.play();
}

/** Stops the camera stream of the video element (if any). */
export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject;
  if (stream instanceof MediaStream) for (const track of stream.getTracks()) track.stop();
  video.srcObject = null;
}

/** Id of the camera the video element currently shows, or null. */
export function activeCameraId(video: HTMLVideoElement): string | null {
  const stream = video.srcObject;
  if (!(stream instanceof MediaStream)) return null;
  return stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
}

/** All cameras (labels are only available after camera permission was granted). */
export async function listCameras(): Promise<CameraInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `${t('register.cameraFallback')} ${i + 1}` }));
}

/** The remembered camera if it is still connected, otherwise null (= browser default). */
export function chooseCamera(saved: string | null, cameras: readonly CameraInfo[]): string | null {
  return saved && cameras.some((c) => c.id === saved) ? saved : null;
}
