// For now, use regular environment variables until Encore is properly set up
// This allows the code to compile and run during testing phase

// Database configuration
export const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/inventory';

// JWT configuration  
export const JWT_SECRET = () => process.env.JWT_SECRET || 'change-this-secret-in-production';
export const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '1d';

// Application configuration
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = parseInt(process.env.PORT || '3000', 10);

// Configuration object for compatibility with existing code
export const config = {
  nodeEnv: NODE_ENV,
  port: PORT,
  jwtSecret: JWT_SECRET(),
  jwtExpiresIn: JWT_EXPIRES_IN,
};

export default config;