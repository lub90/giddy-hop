import { t } from '../i18n';

/** Starts the webcam and attaches it to the given video element. */
export async function startCamera(video: HTMLVideoElement, width: number, height: number): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(t('startup.noCameraApi'));
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: width }, height: { ideal: height }, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.onloadedmetadata = () => resolve();
  });
  await video.play();
}
