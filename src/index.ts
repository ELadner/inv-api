import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import env from './config/env';
import { errorHandler } from './middlewares/error-middleware';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
import authRoutes from './routes/auth-routes';

app.use('/api/auth', authRoutes);

// Routes
app.get('/', (_req, res) => {
  res.json({ message: 'Inventory API is running' });
});

// Add error handling middleware at the end
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

export default app;