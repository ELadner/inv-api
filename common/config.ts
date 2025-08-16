// Application configuration - no secrets at global level
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = parseInt(process.env.PORT || '3000', 10);

// Configuration object for compatibility with existing code (without secrets)
export const config = {
  nodeEnv: NODE_ENV,
  port: PORT,
  jwtExpiresIn: JWT_EXPIRES_IN,
};

export default config;