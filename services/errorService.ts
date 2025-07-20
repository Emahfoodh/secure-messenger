import { Alert } from 'react-native';

// Error types for better categorization
export enum ErrorType {
  AUTH = 'AUTH',
  STORAGE = 'STORAGE',
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  PERMISSION = 'PERMISSION',
  BIOMETRIC = 'BIOMETRIC',
  ENCRYPTION = 'ENCRYPTION',
  UNKNOWN = 'UNKNOWN'
}

export class AppError extends Error {
  readonly type: ErrorType;
  readonly userMessage: string;
  readonly originalError?: Error | AppError;
  readonly message: string;

  constructor(
    type: ErrorType,
    userMessage: string,
    originalError?: Error | AppError,
  ) {
    // If no specific message provided, use userMessage
    super(userMessage);
    
    this.type = type;
    this.userMessage = userMessage;
    this.originalError = originalError;
    this.message = originalError?.message || userMessage;
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }

    // Preserve original error's stack if it exists
    if (originalError?.stack) {
      this.stack = `${this.stack}\nCaused by: ${originalError.stack}`;
    }
  }
}

// Error service class
export class ErrorService {
  private static isDevelopment = process.env.EXPO_PUBLIC_NODE_ENV !== 'production';

  /**
   * Handle and display errors to users
   */
  static handleError(error: any, context?: string): void {
    const appError = this.processError(error, context);
    
    // Log error for debugging
    if (this.isDevelopment) {
      this.logError(appError, context);
    }

    // Show user-friendly message
    this.showUserError(appError);
  }

  /**
   * Process any error into AppError
   */
  private static processError(error: any, context?: string): AppError {
    // If it's already an AppError, return it
    if (error instanceof AppError) {
      console.log('🔴 Already an AppError:', error.type);
      return error;
    }

    // Handle Firebase Auth errors
    if (error?.code?.startsWith('auth/')) {
      return this.handleFirebaseAuthError(error);
    }

    // Handle Firebase Firestore errors
    if (error?.code?.startsWith('firestore/')) {
      return this.handleFirestoreError(error);
    }

    // Handle network errors
    if (error?.code === 'NETWORK_ERROR' || error?.message?.includes('network')) {
      return new AppError(
        ErrorType.NETWORK,
        'Please check your internet connection and try again',
        error
      );
    }

    // Handle validation errors
    if (error?.name === 'ValidationError') {
      return new AppError(
        ErrorType.VALIDATION,
        error.message || 'Please check your input and try again',
        error
      );
    }

    // Handle permission errors
    if (error?.message?.includes('permission')) {
      return new AppError(
        ErrorType.PERMISSION,
        'Permission required. Please check your settings and try again',
        error
      );
    }

    // Handle biometric authentication errors
    if (error?.name === 'BiometricError') {
      return new AppError(
        ErrorType.BIOMETRIC,
        'Biometric authentication failed. Please try again',
        error
      );
    }

    // Handle encryption errors
    if (error?.name === 'EncryptionError') {
      return new AppError(
        ErrorType.ENCRYPTION,
        'Failed to encrypt message. Please try again',
        error
      );
    }

    // Default unknown error
    return new AppError(
      ErrorType.UNKNOWN,
      'Something went wrong. Please try again',
      error,
    );
  }

  /**
   * Handle Firebase Auth errors
   */
  private static handleFirebaseAuthError(error: any): AppError {
    const errorMessages: { [key: string]: string } = {
      'auth/user-not-found': 'No account found with this email',
      'auth/wrong-password': 'Incorrect password',
      'auth/email-already-in-use': 'An account with this email already exists',
      'auth/weak-password': 'Password must be at least 6 characters',
      'auth/invalid-email': 'Invalid email address',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later',
      'auth/network-request-failed': 'Network error. Please check your connection',
      'auth/invalid-credential': 'Invalid email or password',
    };

    const userMessage = errorMessages[error.code] || 'Authentication failed. Please try again';
    
    return new AppError(ErrorType.AUTH, userMessage, error);
  }

  /**
   * Handle Firestore errors
   */
  private static handleFirestoreError(error: any): AppError {
    const errorMessages: { [key: string]: string } = {
      'firestore/permission-denied': 'Access denied. Please check your permissions',
      'firestore/not-found': 'Document not found',
      'firestore/already-exists': 'Document already exists',
      'firestore/unavailable': 'Service temporarily unavailable. Please try again',
      'firestore/deadline-exceeded': 'Request timeout. Please try again',
    };

    const userMessage = errorMessages[error.code] || 'Database error. Please try again';
    
    return new AppError(ErrorType.STORAGE, userMessage, error);
  }

  /**
   * Show user-friendly error message
   */
  private static showUserError(error: AppError): void {
    const title = this.getErrorTitle(error.type);
    
    Alert.alert(
      title,
      error.userMessage,
      [{ text: 'OK', style: 'default' }],
      { cancelable: true }
    );
  }

  /**
   * Get appropriate error title based on type
   */
  private static getErrorTitle(type: ErrorType): string {
    switch (type) {
      case ErrorType.NETWORK:
        return 'Connection Error';
      case ErrorType.AUTH:
        return 'Authentication Error';
      case ErrorType.VALIDATION:
        return 'Invalid Input';
      case ErrorType.PERMISSION:
        return 'Permission Required';
      case ErrorType.STORAGE:
        return 'Data Error';
      case ErrorType.BIOMETRIC:
        return 'Authentication Failed';
      case ErrorType.ENCRYPTION:
        return 'Encryption Error';
      default:
        return 'Error';
    }
  }

  /**
   * Log error details in development
   */
  private static logError(error: AppError, context?: string): void {
      console.group(`🔴 ${error.type} Error ${context ? `(${context})` : ''}`);
      console.error('User Message:', error.userMessage);
      console.error('Error Details:', error.message);
      
      if (error.originalError) {
        console.group('Error Chain:');
        let currentError: Error | AppError | undefined = error.originalError;
        
        while (currentError) {
          if (currentError instanceof AppError) {
            console.error(`├─ ${currentError.message}`);
            currentError = currentError.originalError;
          } else {
            console.error(`└─ Root Cause:`,  currentError);
            break
          }
        }

        console.groupEnd();
      }
      console.groupEnd();
  }
}