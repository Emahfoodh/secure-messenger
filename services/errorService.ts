import { Alert } from 'react-native';

// Error types for better categorization
export enum ErrorType {
  NETWORK = 'NETWORK',
  AUTH = 'AUTH',
  VALIDATION = 'VALIDATION',
  PERMISSION = 'PERMISSION',
  STORAGE = 'STORAGE',
  BIOMETRIC = 'BIOMETRIC',
  UNKNOWN = 'UNKNOWN',
}

// Custom error class
export class AppError extends Error {
  public type: ErrorType;
  public userMessage: string;
  public originalError?: any;

  constructor(
    type: ErrorType,
    userMessage: string,
    originalError?: any,
    developerMessage?: string
  ) {
    super(developerMessage || userMessage);
    this.type = type;
    this.userMessage = userMessage;
    this.originalError = originalError;
    this.name = 'AppError';
  }
}

// Error service class
export class ErrorService {
  private static isDevelopment = __DEV__;

  /**
   * Handle and display errors to users
   */
  static handleError(error: any, context?: string): void {
    const appError = this.processError(error, context);
    
    // Log error for debugging
    this.logError(appError, context);
    
    // Show user-friendly message
    this.showUserError(appError);
  }

  /**
   * Process any error into AppError
   */
  private static processError(error: any, context?: string): AppError {
    // If it's already an AppError, return it
    if (error instanceof AppError) {
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

    // Default unknown error
    return new AppError(
      ErrorType.UNKNOWN,
      'Something went wrong. Please try again',
      error,
      error?.message
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
      default:
        return 'Error';
    }
  }

  /**
   * Log error for debugging
   */
  private static logError(error: AppError, context?: string): void {
    if (this.isDevelopment) {
      console.group(`🔴 ${error.type} Error ${context ? `(${context})` : ''}`);
      console.error('User Message:', error.userMessage);
      console.error('Error Details:', error.message);
      if (error.originalError) {
        console.error('Original Error:', error.originalError);
      }
      console.groupEnd();
    }
  }
}