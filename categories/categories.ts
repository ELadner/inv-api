import { api } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { Prisma, UserRole } from '@prisma/client';
import { auth, UserData } from '../auth/auth';
import { 
  AuthenticationRequiredError, 
  PermissionDeniedError, 
  NotFoundError, 
  AlreadyExistsError,
  InvalidArgumentError,
  ReferencedInOrdersError
} from '../common/errors';
import { successResponse, paginatedResponse, StandardResponse, PaginatedResponse } from '../common/responses';
import { prisma } from '../common/database';

// Request/Response interfaces
export interface GetCategoriesQuery {
  search?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateCategoryData {
  name: string;
}

export interface UpdateCategoryData extends CreateCategoryData {}

// Helper function for role-based authorization
function requireRole(allowedRoles: UserRole[]): UserData {
  const userData = auth.data();
  if (!userData) {
    throw AuthenticationRequiredError();
  }
  if (!allowedRoles.includes(userData.role)) {
    throw PermissionDeniedError();
  }
  return userData;
}

// Get all categories with filtering and pagination
export const getAllCategories = api(
  { method: "GET", path: "/categories", auth: false },
  async (query: GetCategoriesQuery): Promise<PaginatedResponse> => {
    try {
      const {
        search,
        sortBy = 'name',
        order = 'asc',
        page = 1,
        limit = 20,
      } = query;

      // Build where conditions
      const where: Prisma.CategoryWhereInput = {};
      
      if (search) {
        where.name = { contains: search, mode: 'insensitive' };
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Build sort options
      let orderBy: Prisma.CategoryOrderByWithRelationInput = { name: 'asc' };
      
      switch (sortBy) {
        case 'name':
          orderBy = { name: order };
          break;
        case 'createdAt':
          orderBy = { createdAt: order };
          break;
        case 'updatedAt':
          orderBy = { updatedAt: order };
          break;
        default:
          orderBy = { name: 'asc' };
      }

      // Execute query with count
      const [categories, total] = await Promise.all([
        prisma.category.findMany({
          where,
          orderBy,
          skip,
          take: limit,
        }),
        prisma.category.count({ where }),
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrevious = page > 1;

      return paginatedResponse(categories, {
        total,
        page,
        limit,
        totalPages,
        hasNext,
        hasPrevious,
      });
    } catch (error) {
      throw error;
    }
  }
);

// Get category by ID
export const getCategoryById = api(
  { method: "GET", path: "/categories/:id", auth: false },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const category = await prisma.category.findUnique({
        where: { id },
        include: {
          parts: {
            select: {
              id: true,
              partNumber: true,
              name: true,
              quantity: true,
              minQuantity: true,
              price: true,
              supplier: {
                select: {
                  id: true,
                  name: true,
                }
              },
            },
            orderBy: { name: 'asc' },
            take: 50, // Limit parts to avoid large responses
          },
          _count: {
            select: { parts: true }
          }
        },
      });

      if (!category) {
        throw NotFoundError('Category');
      }

      return successResponse(category);
    } catch (error) {
      throw error;
    }
  }
);

// Get categories with parts count
export const getCategoriesWithPartsCount = api(
  { method: "GET", path: "/categories/with-parts-count", auth: true },
  async ({ page = 1, limit = 20 }: { page?: number; limit?: number }): Promise<PaginatedResponse> => {
    try {
      const skip = (page - 1) * limit;

      const [categories, total] = await Promise.all([
        prisma.category.findMany({
          include: {
            _count: {
              select: { parts: true }
            }
          },
          skip,
          take: limit,
          orderBy: { name: 'asc' },
        }),
        prisma.category.count(),
      ]);

      const totalPages = Math.ceil(total / limit);

      return paginatedResponse(categories, {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      });
    } catch (error) {
      throw error;
    }
  }
);

// Get category statistics (MANAGER/ADMIN only)
export const getCategoryStats = api(
  { method: "GET", path: "/categories/:id/stats", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const category = await prisma.category.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              parts: true,
            }
          },
          parts: {
            select: {
              quantity: true,
              minQuantity: true,
              price: true,
            }
          }
        }
      });

      if (!category) {
        throw NotFoundError('Category');
      }

      // Calculate statistics
      const totalParts = category._count.parts;

      // Calculate low stock parts (quantity < minQuantity)
      const lowStockParts = category.parts.filter(part => part.quantity < part.minQuantity).length;

      // Calculate total inventory value
      const totalInventoryValue = category.parts.reduce((sum, part) => {
        const price = part.price ? Number(part.price) : 0;
        return sum + (price * part.quantity);
      }, 0);

      // Calculate total inventory quantity
      const totalQuantity = category.parts.reduce((sum, part) => sum + part.quantity, 0);

      const stats = {
        category: {
          id: category.id,
          name: category.name,
        },
        counts: {
          totalParts,
          lowStockParts,
        },
        inventory: {
          totalQuantity,
          totalValue: totalInventoryValue,
          averagePartValue: totalParts > 0 ? totalInventoryValue / totalParts : 0,
        },
      };

      return successResponse(stats);
    } catch (error) {
      throw error;
    }
  }
);

// Create category (MANAGER/ADMIN only)
export const createCategory = api(
  { method: "POST", path: "/categories", auth: true },
  async (categoryData: CreateCategoryData): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      // Check if category with same name already exists
      const existingCategory = await prisma.category.findFirst({
        where: {
          name: {
            equals: categoryData.name,
            mode: 'insensitive'
          }
        }
      });

      if (existingCategory) {
        throw AlreadyExistsError('A category with this name');
      }

      const category = await prisma.category.create({
        data: {
          name: categoryData.name,
        },
      });

      return successResponse(category);
    } catch (error) {
      throw error;
    }
  }
);

// Update category (MANAGER/ADMIN only)
export const updateCategory = api(
  { method: "PUT", path: "/categories/:id", auth: true },  
  async (params: UpdateCategoryData & { id: number }): Promise<StandardResponse> => {
    const { id, ...categoryData } = params;
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const currentCategory = await prisma.category.findUnique({
        where: { id },
      });
      
      if (!currentCategory) {
        throw NotFoundError('Category');
      }

      // Check if another category with same name exists (excluding current one)
      if (categoryData.name) {
        const existingCategory = await prisma.category.findFirst({
          where: {
            name: {
              equals: categoryData.name,
              mode: 'insensitive'
            },
            id: { not: id }
          }
        });

        if (existingCategory) {
          throw AlreadyExistsError('A category with this name');
        }
      }

      const updatedCategory = await prisma.category.update({
        where: { id },
        data: {
          name: categoryData.name,
        },
      });

      return successResponse(updatedCategory);
    } catch (error) {
      throw error;
    }
  }
);

// Delete category (ADMIN only)
export const deleteCategory = api(
  { method: "DELETE", path: "/categories/:id", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.ADMIN]);

      const category = await prisma.category.findUnique({
        where: { id },
        include: {
          parts: true,
        },
      });
      
      if (!category) {
        throw NotFoundError('Category');
      }

      // Check for related parts
      if (category.parts.length > 0) {
        throw ReferencedInOrdersError(category.parts.length);
      }

      // Delete the category
      await prisma.category.delete({
        where: { id },
      });

      return successResponse();
    } catch (error) {
      throw error;
    }
  }
);