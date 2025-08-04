// src/interfaces/user-dto.ts
import { UserRole } from '@prisma/client';

/**
 * DTO for user registration
 */
export interface RegisterUserDto {
  username: string;
  email: string;
  password: string;
  role?: UserRole; // Optional, defaults to USER in service
}

/**
 * DTO for user login
 * Allows login with either username or email
 */
export interface LoginUserDto {
  username?: string;
  email?: string;
  password: string;
}

/**
 * DTO for user data returned in responses
 * Never includes password
 */
export interface UserResponseDto {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for updating user profile
 * All fields are optional
 */
export interface UpdateUserDto {
  username?: string;
  email?: string;
  password?: string;
  currentPassword?: string; // Required when changing password
}

/**
 * DTO for admin updating user details
 * Allows changing roles and other attributes
 */
export interface AdminUpdateUserDto extends UpdateUserDto {
  role?: UserRole;
  active?: boolean;
}

/**
 * DTO for password change
 */
export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * DTO for user search/filtering
 */
export interface UserFilterDto {
  search?: string; // Search in username or email
  role?: UserRole;
  orderBy?: 'username' | 'email' | 'createdAt' | 'role';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * DTO for user list response with pagination
 */
export interface UserListResponseDto {
  users: UserResponseDto[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * DTO for authentication response
 */
export interface AuthResponseDto {
  user: UserResponseDto;
  token: string;
  expiresAt?: Date; // Optional timestamp for token expiration
}