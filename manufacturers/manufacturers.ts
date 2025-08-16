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
export interface GetManufacturersQuery {
  search?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateManufacturerData {
  name: string;
  website?: string;
  notes?: string;
}

export interface UpdateManufacturerData extends CreateManufacturerData {}

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

// Get all manufacturers with filtering and pagination
export const getAllManufacturers = api(
  { method: "GET", path: "/manufacturers", auth: false },
  async (query: GetManufacturersQuery): Promise<PaginatedResponse> => {
    try {
      const {
        search,
        sortBy = 'name',
        order = 'asc',
        page = 1,
        limit = 20,
      } = query;

      // Build where conditions
      const where: Prisma.ManufacturerWhereInput = {};
      
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { website: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Build sort options
      let orderBy: Prisma.ManufacturerOrderByWithRelationInput = { name: 'asc' };
      
      switch (sortBy) {
        case 'name':
          orderBy = { name: order };
          break;
        case 'website':
          orderBy = { website: order };
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
      const [manufacturers, total] = await Promise.all([
        prisma.manufacturer.findMany({
          where,
          orderBy,
          skip,
          take: limit,
        }),
        prisma.manufacturer.count({ where }),
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrevious = page > 1;

      return paginatedResponse(manufacturers, {
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

// Get manufacturer by ID
export const getManufacturerById = api(
  { method: "GET", path: "/manufacturers/:id", auth: false },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const manufacturer = await prisma.manufacturer.findUnique({
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
          },
        },
      });

      if (!manufacturer) {
        throw NotFoundError('Manufacturer');
      }

      return successResponse(manufacturer);
    } catch (error) {
      throw error;
    }
  }
);

// Get manufacturers with parts count
export const getManufacturersWithPartsCount = api(
  { method: "GET", path: "/manufacturers/with-parts-count", auth: true },
  async ({ page = 1, limit = 20 }: { page?: number; limit?: number }): Promise<PaginatedResponse> => {
    try {
      const skip = (page - 1) * limit;

      const [manufacturers, total] = await Promise.all([
        prisma.manufacturer.findMany({
          include: {
            _count: {
              select: { parts: true }
            }
          },
          skip,
          take: limit,
          orderBy: { name: 'asc' },
        }),
        prisma.manufacturer.count(),
      ]);

      const totalPages = Math.ceil(total / limit);

      return paginatedResponse(manufacturers, {
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

// Get manufacturer statistics (MANAGER/ADMIN only)
export const getManufacturerStats = api(
  { method: "GET", path: "/manufacturers/:id/stats", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const manufacturer = await prisma.manufacturer.findUnique({
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

      if (!manufacturer) {
        throw NotFoundError('Manufacturer');
      }

      // Calculate statistics
      const totalParts = manufacturer._count.parts;

      // Calculate low stock parts (quantity < minQuantity)
      const lowStockParts = manufacturer.parts.filter(part => part.quantity < part.minQuantity).length;

      // Calculate total inventory value
      const totalInventoryValue = manufacturer.parts.reduce((sum, part) => {
        const price = part.price ? Number(part.price) : 0;
        return sum + (price * part.quantity);
      }, 0);

      const stats = {
        manufacturer: {
          id: manufacturer.id,
          name: manufacturer.name,
          website: manufacturer.website,
        },
        counts: {
          totalParts,
          lowStockParts,
        },
        inventory: {
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

// Create manufacturer (MANAGER/ADMIN only)
export const createManufacturer = api(
  { method: "POST", path: "/manufacturers", auth: true },
  async (manufacturerData: CreateManufacturerData): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      // Check if manufacturer with same name already exists
      const existingManufacturer = await prisma.manufacturer.findFirst({
        where: {
          name: {
            equals: manufacturerData.name,
            mode: 'insensitive'
          }
        }
      });

      if (existingManufacturer) {
        throw AlreadyExistsError('A manufacturer with this name');
      }

      const manufacturer = await prisma.manufacturer.create({
        data: {
          name: manufacturerData.name,
          website: manufacturerData.website,
          notes: manufacturerData.notes,
        },
      });

      return successResponse(manufacturer);
    } catch (error) {
      throw error;
    }
  }
);

// Update manufacturer (MANAGER/ADMIN only)
export const updateManufacturer = api(
  { method: "PUT", path: "/manufacturers/:id", auth: true },  
  async (params: UpdateManufacturerData & { id: number }): Promise<StandardResponse> => {
    const { id, ...manufacturerData } = params;
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const currentManufacturer = await prisma.manufacturer.findUnique({
        where: { id },
      });
      
      if (!currentManufacturer) {
        throw NotFoundError('Manufacturer');
      }

      // Check if another manufacturer with same name exists (excluding current one)
      if (manufacturerData.name) {
        const existingManufacturer = await prisma.manufacturer.findFirst({
          where: {
            name: {
              equals: manufacturerData.name,
              mode: 'insensitive'
            },
            id: { not: id }
          }
        });

        if (existingManufacturer) {
          throw AlreadyExistsError('A manufacturer with this name');
        }
      }

      const updatedManufacturer = await prisma.manufacturer.update({
        where: { id },
        data: {
          name: manufacturerData.name,
          website: manufacturerData.website,
          notes: manufacturerData.notes,
        },
      });

      return successResponse(updatedManufacturer);
    } catch (error) {
      throw error;
    }
  }
);

// Delete manufacturer (ADMIN only)
export const deleteManufacturer = api(
  { method: "DELETE", path: "/manufacturers/:id", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.ADMIN]);

      const manufacturer = await prisma.manufacturer.findUnique({
        where: { id },
        include: {
          parts: true,
        },
      });
      
      if (!manufacturer) {
        throw NotFoundError('Manufacturer');
      }

      // Check for related parts
      if (manufacturer.parts.length > 0) {
        throw ReferencedInOrdersError(manufacturer.parts.length);
      }

      // Delete the manufacturer
      await prisma.manufacturer.delete({
        where: { id },
      });

      return successResponse();
    } catch (error) {
      throw error;
    }
  }
);