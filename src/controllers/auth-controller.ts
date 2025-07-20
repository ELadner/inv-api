// src/controllers/auth-controller.ts
import { Request, Response } from 'express';
import { AuthService } from '../services/auth-service';
import { validateRequest } from '../middlewares/validation-middleware';
import { createUserSchema, loginUserSchema } from '../validation/user-schema';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * Register a new user
   */
  register = [
    validateRequest(createUserSchema),
    async (req: Request, res: Response): Promise<void> => {
      const result = await this.authService.register(req.body);
      res.status(201).json(result);
    },
  ];

  /**
   * Login a user
   */
  login = [
    validateRequest(loginUserSchema),
    async (req: Request, res: Response): Promise<void> => {
      const result = await this.authService.login(req.body);
      res.status(200).json(result);
    },
  ];

  /**
   * Get current user profile
   */
  getCurrentUser = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const user = await this.authService.getCurrentUser(req.user.id);
    res.status(200).json(user);
  };
}