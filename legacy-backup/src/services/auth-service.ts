// src/services/auth-service.ts
import { PrismaClient, User, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppError } from '../middlewares/error-middleware';
import env from '../config/env';
import { RegisterUserDto, LoginUserDto } from '../dto/user-dto';

const prisma = new PrismaClient();

export class AuthService {
  /**
   * Register a new user
   */
  async register(userData: RegisterUserDto): Promise<{ user: Partial<User>; token: string }> {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email },
    });

    if (existingUser) {
      throw new AppError('User with this email already exists', 400);
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userData.password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: userData.email,
        password: hashedPassword,
        username: userData.username,
        role: userData.role || UserRole.USER
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Generate JWT
    const token = this.generateToken(user.id, user.email, user.role);

    return { user, token };
  }

  /**
   * Login a user
   */
  async login(loginData: LoginUserDto): Promise<{ user: Partial<User>; token: string }> {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: loginData.email },
    });

    if (!user) {
      throw new AppError('Invalid credentials or inactive account', 401);
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(loginData.password, user.password);
    if (!isPasswordValid) {
      throw new AppError('Invalid credentials', 401);
    }

    // Generate JWT
    const token = this.generateToken(user.id, user.email, user.role);

    // Return user data without password
    const { password, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
  }

  /**
   * Generate JWT token
   */
  private generateToken(userId: number, email: string, role: UserRole): string {

    return jwt.sign(
      {
        id: userId,
        email,
        role,
      },
      env.jwtSecret as jwt.Secret,
      {
        expiresIn: env.jwtExpiresIn,
      }
    );
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(userId: number): Promise<Partial<User>> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  }
}