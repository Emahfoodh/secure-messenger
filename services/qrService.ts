import { AppError, ErrorType } from './errorService';
import { UserProfile } from './userService';

export interface QRUserData {
  username: string;
  uid: string;
  displayName?: string;
}

export const generateQRData = (profile: UserProfile): string => {
  const qrData: QRUserData = {
    username: profile.username,
    uid: profile.uid,
    displayName: profile.displayName,
  };
  
  return JSON.stringify(qrData);
};

export const parseQRData = (qrString: string): QRUserData | null => {
  try {
    const parsed = JSON.parse(qrString);
    if (parsed.username && parsed.uid) {
      return parsed as QRUserData;
    }
    return null;
  } catch (error: any) {
    throw new AppError(
      ErrorType.VALIDATION,
      'Invalid QR code format',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};