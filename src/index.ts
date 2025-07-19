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

// Routes
app.get('/', (_req, res) => {
  res.json({ message: 'Inventory API is running' });
});

// Apply routes (uncomment and add your routes here)
// app.use('/api/parts', partsRouter);
// app.use('/api/suppliers', suppliersRouter);

// Error handling middleware
app.use(errorHandler);

// Start server
app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`);
});

export default app;
