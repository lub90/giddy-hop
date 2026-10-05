import { describe, expect, it } from 'vitest';
import { chooseCamera } from '../src/pose/camera';

const cameras = [
  { id: 'built-in', label: 'Integrated Camera' },
  { id: 'usb', label: 'USB Webcam' },
];

describe('chooseCamera', () => {
  it('uses the remembered camera when it is connected', () => {
    expect(chooseCamera('usb', cameras)).toBe('usb');
  });

  it('falls back to the browser default when the remembered camera is gone', () => {
    expect(chooseCamera('unplugged', cameras)).toBeNull();
  });

  it('uses the browser default when nothing was remembered', () => {
    expect(chooseCamera(null, cameras)).toBeNull();
    expect(chooseCamera('', cameras)).toBeNull();
  });
});
