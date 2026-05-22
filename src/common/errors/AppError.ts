import type { ErrorCodeType } from './ErrorCode';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeType;
  public readonly isOperational: boolean;

  constructor(code: ErrorCodeType, message: string, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
