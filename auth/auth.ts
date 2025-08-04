// Temporary: Use stubs for testing until Encore runtime is available
// import { api } from "encore.dev/api";
// import { authHandler } from "encore.dev/auth";
import { api, authHandler } from "../test-stubs/encore-stubs";
import { User, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../common/config';
import { RegisterUserDto, LoginUserDto } from '../src/dto/user-dto';
import { AlreadyExistsError, AuthenticationRequiredError, NotFoundError } from '../common/errors';
import { successResponse, StandardResponse } from '../common/responses';
import { prisma } from '../common/database';

export interface AuthParams {
  email: string;
  password: string;
}

export interface RegisterParams extends AuthParams {
  username: string;
  role?: UserRole;
}

export interface AuthData {
  user: Partial<User>;
  token: string;
}

export interface AuthResponse extends StandardResponse<AuthData> {}

export interface UserData {
  id: number;
  username: string;
  email: string;
  role: UserRole;
}

// Encore auth handler
export const auth = authHandler<UserData>(
  async (token: string): Promise<UserData | null> => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET()) as any;
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, username: true, email: true, role: true },
      });

      return user;
    } catch {
      return null;
    }
  }
);

// Register endpoint
export const register = api(
  { method: "POST", path: "/register", auth: false },
  async (params: RegisterParams): Promise<AuthResponse> => {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: params.email },
      });

      if (existingUser) {
        throw AlreadyExistsError('User with this email');
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(params.password, salt);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: params.email,
          password: hashedPassword,
          username: params.username,
          role: params.role || UserRole.USER
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
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        JWT_SECRET(),
        {
          expiresIn: JWT_EXPIRES_IN,
        }
      );

      return successResponse({ user, token });
    } catch (error) {
      throw error;
    }
  }
);

// Login endpoint
export const login = api(
  { method: "POST", path: "/login", auth: false },
  async (params: AuthParams): Promise<AuthResponse> => {
    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email: params.email },
      });

      if (!user) {
        throw AuthenticationRequiredError('Invalid credentials or inactive account');
      }

      // Check password
      const isPasswordValid = await bcrypt.compare(params.password, user.password);
      if (!isPasswordValid) {
        throw AuthenticationRequiredError('Invalid credentials');
      }

      // Generate JWT
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        JWT_SECRET(),
        {
          expiresIn: JWT_EXPIRES_IN,
        }
      );

      // Return user data without password
      const { password, ...userWithoutPassword } = user;
      
      return successResponse({ user: userWithoutPassword, token });
    } catch (error) {
      throw error;
    }
  }
);

// Get current user endpoint
export const getCurrentUser = api(
  { method: "GET", path: "/me", auth: true },
  async (): Promise<StandardResponse<Partial<User>>> => {
    try {
      const userData = auth.data();
      if (!userData) {
        throw AuthenticationRequiredError();
      }

      const user = await prisma.user.findUnique({
        where: { id: userData.id },
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
        throw NotFoundError('User');
      }

      return successResponse(user);
    } catch (error) {
      throw error;
    }
  }
);