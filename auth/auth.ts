import { api, Header } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { secret } from "encore.dev/config";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { JWT_EXPIRES_IN } from '../common/config';
import { AlreadyExistsError, AuthenticationRequiredError, NotFoundError } from '../common/errors';
import { successResponse, StandardResponse } from '../common/responses';
import { prisma } from '../common/database';

// Load secrets within the service
const JWT_SECRET = secret("JWT_SECRET");

// Helper function to get JWT secret with fallback
function getJWTSecret(): string {
  try {
    const secretValue = JWT_SECRET();
    if (secretValue) {
      return secretValue;
    }
  } catch (error) {
    // Silently fall back to environment variable
  }
  
  // Fallback to environment variable for local development
  const envSecret = process.env.JWT_SECRET;
  if (!envSecret) {
    throw new Error('JWT_SECRET not found in Encore secrets or environment variables');
  }
  return envSecret;
}

// Define enums directly for Encore compatibility
export enum UserRole {
  USER = "USER",
  ADMIN = "ADMIN", 
  MANAGER = "MANAGER"
}

// Define User interface for Encore compatibility
export interface User {
  id: number;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginParams {
  email: string;
  password: string;
}

export interface RegisterParams extends LoginParams {
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
  isActive: boolean;
}

// Auth token interface for Encore
export interface AuthParams {
  authorization?: Header<string>;
}

// Encore auth handler
export const auth = authHandler<UserData>(
  async (params: AuthParams): Promise<UserData | null> => {
    try {
      if (!params.authorization) {
        return null;
      }
      
      // Extract token from Authorization header (Bearer token format)
      const authHeader = params.authorization as any;
      const token = authHeader.replace('Bearer ', '');
      
      const decoded = jwt.verify(token, getJWTSecret()) as any;
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, username: true, email: true, role: true, isActive: true },
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

      // Create user (inactive by default - requires admin approval)
      const user = await prisma.user.create({
        data: {
          email: params.email,
          password: hashedPassword,
          username: params.username,
          role: params.role || UserRole.USER,
          isActive: false // New users are inactive by default
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isActive: true,
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
        getJWTSecret(),
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
  async (params: LoginParams): Promise<AuthResponse> => {
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

      // Check if user account is active
      if (!user.isActive) {
        throw AuthenticationRequiredError('Account is pending admin approval');
      }

      // Generate JWT
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        getJWTSecret(),
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
          isActive: true,
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