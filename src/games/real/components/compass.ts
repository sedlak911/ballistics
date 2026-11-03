/** Whether the browser reports the phone's orientation at all (the Aim button and the aiming settings need it). */
export const hasCompass = () => typeof window !== 'undefined' && typeof window.DeviceOrientationEvent !== 'undefined'
