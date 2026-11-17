import { Request, Response, NextFunction } from "express";
import { config } from "../config";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const isDev = config.app.nodeEnv === "development";

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(isDev && { stack: err.stack }),
    });
  }

  console.error("❌ Unexpected error:", err);

  return res.status(500).json({
    success: false,
    message: err.message,
    ...(isDev && {
      error: err.message,
      stack: err.stack,
    }),
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
};
