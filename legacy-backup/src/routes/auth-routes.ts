// src/routes/auth-routes.ts
import { Router } from 'express';
import { AuthController } from '../controllers/auth-controller';
import { authenticate } from '../middlewares/auth-middleware';

const router = Router();
const authController = new AuthController();

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes
router.get('/me', authenticate, authController.getCurrentUser);

export default router;