// src/config/env.ts
import type { StringValue } from "ms";
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

export default {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'production-key-your-in-secret-change',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN as StringValue || '1d',
};


