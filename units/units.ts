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
export interface GetUnitsQuery {
  search?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateUnitData {
  name: string;
}

export interface UpdateUnitData extends CreateUnitData {}

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

// Get all units with filtering and pagination
export const getAllUnits = api(
  { method: "GET", path: "/units", auth: false },
  async (query: GetUnitsQuery): Promise<PaginatedResponse> => {
    try {
      const {
        search,
        sortBy = 'name',
        order = 'asc',
        page = 1,
        limit = 20,
      } = query;

      // Build where conditions
      const where: Prisma.UnitWhereInput = {};
      
      if (search) {
        where.name = { contains: search, mode: 'insensitive' };
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Build sort options
      let orderBy: Prisma.UnitOrderByWithRelationInput = { name: 'asc' };
      
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
      const [units, total] = await Promise.all([
        prisma.unit.findMany({
          where,
          orderBy,
          skip,
          take: limit,
        }),
        prisma.unit.count({ where }),
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrevious = page > 1;

      return paginatedResponse(units, {
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

// Get unit by ID
export const getUnitById = api(
  { method: "GET", path: "/units/:id", auth: false },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const unit = await prisma.unit.findUnique({
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
              category: {
                select: {
                  id: true,
                  name: true,
                }
              },
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

      if (!unit) {
        throw NotFoundError('Unit');
      }

      return successResponse(unit);
    } catch (error) {
      throw error;
    }
  }
);

// Get units with parts count
export const getUnitsWithPartsCount = api(
  { method: "GET", path: "/units/with-parts-count", auth: true },
  async ({ page = 1, limit = 20 }: { page?: number; limit?: number }): Promise<PaginatedResponse> => {
    try {
      const skip = (page - 1) * limit;

      const [units, total] = await Promise.all([
        prisma.unit.findMany({
          include: {
            _count: {
              select: { parts: true }
            }
          },
          skip,
          take: limit,
          orderBy: { name: 'asc' },
        }),
        prisma.unit.count(),
      ]);

      const totalPages = Math.ceil(total / limit);

      return paginatedResponse(units, {
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

// Get unit statistics (MANAGER/ADMIN only)
export const getUnitStats = api(
  { method: "GET", path: "/units/:id/stats", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const unit = await prisma.unit.findUnique({
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

      if (!unit) {
        throw NotFoundError('Unit');
      }

      // Calculate statistics
      const totalParts = unit._count.parts;

      // Calculate low stock parts (quantity < minQuantity)
      const lowStockParts = unit.parts.filter(part => part.quantity < part.minQuantity).length;

      // Calculate total inventory value
      const totalInventoryValue = unit.parts.reduce((sum, part) => {
        const price = part.price ? Number(part.price) : 0;
        return sum + (price * part.quantity);
      }, 0);

      // Calculate total inventory quantity
      const totalQuantity = unit.parts.reduce((sum, part) => sum + part.quantity, 0);

      const stats = {
        unit: {
          id: unit.id,
          name: unit.name,
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

// Create unit (MANAGER/ADMIN only)
export const createUnit = api(
  { method: "POST", path: "/units", auth: true },
  async (unitData: CreateUnitData): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      // Check if unit with same name already exists
      const existingUnit = await prisma.unit.findFirst({
        where: {
          name: {
            equals: unitData.name,
            mode: 'insensitive'
          }
        }
      });

      if (existingUnit) {
        throw AlreadyExistsError('A unit with this name');
      }

      const unit = await prisma.unit.create({
        data: {
          name: unitData.name,
        },
      });

      return successResponse(unit);
    } catch (error) {
      throw error;
    }
  }
);

// Update unit (MANAGER/ADMIN only)
export const updateUnit = api(
  { method: "PUT", path: "/units/:id", auth: true },  
  async (params: UpdateUnitData & { id: number }): Promise<StandardResponse> => {
    const { id, ...unitData } = params;
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const currentUnit = await prisma.unit.findUnique({
        where: { id },
      });
      
      if (!currentUnit) {
        throw NotFoundError('Unit');
      }

      // Check if another unit with same name exists (excluding current one)
      if (unitData.name) {
        const existingUnit = await prisma.unit.findFirst({
          where: {
            name: {
              equals: unitData.name,
              mode: 'insensitive'
            },
            id: { not: id }
          }
        });

        if (existingUnit) {
          throw AlreadyExistsError('A unit with this name');
        }
      }

      const updatedUnit = await prisma.unit.update({
        where: { id },
        data: {
          name: unitData.name,
        },
      });

      return successResponse(updatedUnit);
    } catch (error) {
      throw error;
    }
  }
);

// Delete unit (ADMIN only)
export const deleteUnit = api(
  { method: "DELETE", path: "/units/:id", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.ADMIN]);

      const unit = await prisma.unit.findUnique({
        where: { id },
        include: {
          parts: true,
        },
      });
      
      if (!unit) {
        throw NotFoundError('Unit');
      }

      // Check for related parts
      if (unit.parts.length > 0) {
        throw ReferencedInOrdersError(unit.parts.length);
      }

      // Delete the unit
      await prisma.unit.delete({
        where: { id },
      });

      return successResponse();
    } catch (error) {
      throw error;
    }
  }
);