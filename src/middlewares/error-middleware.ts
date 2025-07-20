// src/middlewares/error-middleware.ts
import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  statusCode: number;
  
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError | Prisma.PrismaClientKnownRequestError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error(err);
  
  // Handle AppError instances
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }
  
  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violations
    if (err.code === 'P2002') {
      const field = err.meta?.target as string[];
      return res.status(409).json({
        status: 'error',
        message: `A record with this ${field?.join(', ')} already exists`,
      });
    }
    
    // Foreign key constraint failures
    if (err.code === 'P2003') {
      return res.status(409).json({
        status: 'error',
        message: 'Referenced record does not exist',
      });
    }
    
    // Record not found
    if (err.code === 'P2001') {
      return res.status(404).json({
        status: 'error',
        message: 'Record not found',
      });
    }
  }
  
  // Handle generic errors
  return res.status(500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
  });
};