// Temporary: Use stubs for testing until Encore runtime is available
// import { api } from "encore.dev/api";
// import { authHandler } from "encore.dev/auth";
import { api, authHandler } from "../test-stubs/encore-stubs";
import { Prisma, UserRole } from '@prisma/client';
import { auth, UserData } from '../auth/auth';
import { 
  AuthenticationRequiredError, 
  PermissionDeniedError, 
  NotFoundError, 
  AlreadyExistsError,
  InvalidArgumentError,
  InsufficientQuantityError,
  ReferencedInOrdersError
} from '../common/errors';
import { successResponse, paginatedResponse, StandardResponse, PaginatedResponse } from '../common/responses';
import { prisma } from '../common/database';

// Request/Response interfaces
export interface GetPartsQuery {
  search?: string;
  categoryId?: number;
  supplierId?: number;
  minQuantity?: number;
  maxQuantity?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreatePartData {
  partNumber: string;
  name: string;
  description?: string;
  quantity?: number;
  minQuantity?: number;
  location?: string;
  price?: number;
  categoryId: number;
  supplierId: number;
  unitId: number;
  manufacturerId?: number;
}

export interface UpdatePartData extends CreatePartData {
  reason?: string;
}

export interface AdjustQuantityData {
  quantity: number;
  reason?: string;
  type: 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT';
}


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

// Get all parts with filtering and pagination
export const getAllParts = api(
  { method: "GET", path: "/parts", auth: false },
  async (query: GetPartsQuery): Promise<PaginatedResponse> => {
    try {
      const {
        search,
        categoryId,
        supplierId,
        minQuantity,
        maxQuantity,
        sortBy = 'name',
        order = 'asc',
        page = 1,
        limit = 20,
      } = query;

      // Build where conditions
      const where: Prisma.PartWhereInput = {};
      
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { partNumber: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (categoryId) where.categoryId = categoryId;
      if (supplierId) where.supplierId = supplierId;
      if (minQuantity !== undefined) where.quantity = { gte: minQuantity };
      if (maxQuantity !== undefined) {
        where.quantity = { ...where.quantity, lte: maxQuantity };
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Build sort options
      let orderBy: Prisma.PartOrderByWithRelationInput = { name: 'asc' };
      
      switch (sortBy) {
        case 'name':
          orderBy = { name: order };
          break;
        case 'partNumber':
          orderBy = { partNumber: order };
          break;
        case 'quantity':
          orderBy = { quantity: order };
          break;
        case 'price':
          orderBy = { price: order };
          break;
        case 'createdAt':
          orderBy = { createdAt: order };
          break;
        case 'updatedAt':
          orderBy = { updatedAt: order };
          break;
        case 'category':
          orderBy = { category: { name: order } };
          break;
        case 'supplier':
          orderBy = { supplier: { name: order } };
          break;
        default:
          orderBy = { name: 'asc' };
      }

      // Execute query with count
      const [parts, total] = await Promise.all([
        prisma.part.findMany({
          where,
          include: {
            category: true,
            supplier: true,
            unit: true,
            manufacturer: true,
          },
          orderBy,
          skip,
          take: limit,
        }),
        prisma.part.count({ where }),
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrevious = page > 1;

      return paginatedResponse(parts, {
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

// Get part by ID
export const getPartById = api(
  { method: "GET", path: "/parts/:id", auth: false },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const part = await prisma.part.findUnique({
        where: { id },
        include: {
          category: true,
          supplier: true,
          unit: true,
          manufacturer: true,
          attachments: true,
          inventoryTransactions: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                }
              }
            }
          }
        },
      });

      if (!part) {
        throw NotFoundError('Part');
      }

      return successResponse(part);
    } catch (error) {
      throw error;
    }
  }
);

// Get parts by category
export const getPartsByCategory = api(
  { method: "GET", path: "/parts/by-category/:categoryId", auth: true },
  async ({ categoryId, page = 1, limit = 20 }: { categoryId: number; page?: number; limit?: number }): Promise<PaginatedResponse> => {
    try {
      const skip = (page - 1) * limit;
      
      const [parts, total] = await Promise.all([
        prisma.part.findMany({
          where: { categoryId },
          include: {
            category: true,
            supplier: true,
            unit: true,
          },
          skip,
          take: limit,
          orderBy: { name: 'asc' },
        }),
        prisma.part.count({
          where: { categoryId },
        }),
      ]);

      const totalPages = Math.ceil(total / limit);
      
      return paginatedResponse(parts, {
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

// Get parts by supplier
export const getPartsBySupplier = api(
  { method: "GET", path: "/parts/by-supplier/:supplierId", auth: true },
  async ({ supplierId, page = 1, limit = 20 }: { supplierId: number; page?: number; limit?: number }): Promise<PaginatedResponse> => {
    try {
      const skip = (page - 1) * limit;
      
      const [parts, total] = await Promise.all([
        prisma.part.findMany({
          where: { supplierId },
          include: {
            category: true,
            supplier: true,
            unit: true,
          },
          skip,
          take: limit,
          orderBy: { name: 'asc' },
        }),
        prisma.part.count({
          where: { supplierId },
        }),
      ]);

      const totalPages = Math.ceil(total / limit);
      
      return paginatedResponse(parts, {
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

// Get low inventory parts
export const getLowInventoryParts = api(
  { method: "GET", path: "/parts/inventory/low", auth: true },
  async (): Promise<StandardResponse> => {
    try {
      const allParts = await prisma.part.findMany({
        include: {
          category: true,
          supplier: true,
          unit: true,
        },
        orderBy: [
          {
            supplier: {
              name: 'asc',
            },
          },
          { name: 'asc' },
        ],
      });
  
      const lowInventoryParts = allParts.filter(part => part.quantity < part.minQuantity);
  
      return successResponse(lowInventoryParts);
    } catch (error) {
      throw error;
    }
  }
);

// Create part (MANAGER/ADMIN only)
export const createPart = api(
  { method: "POST", path: "/parts", auth: true },
  async (partData: CreatePartData): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const result = await prisma.$transaction(async (tx) => {
        const part = await tx.part.create({
          data: {
            partNumber: partData.partNumber,
            name: partData.name,
            description: partData.description,
            quantity: partData.quantity || 0,
            minQuantity: partData.minQuantity || 0,
            location: partData.location,
            price: partData.price ? new Prisma.Decimal(partData.price) : null,
            categoryId: partData.categoryId,
            supplierId: partData.supplierId,
            unitId: partData.unitId,
            manufacturerId: partData.manufacturerId,
          },
          include: {
            category: true,
            supplier: true,
            unit: true,
            manufacturer: true,
          },
        });

        if (partData.quantity && partData.quantity > 0) {
          await tx.inventoryTransaction.create({
            data: {
              partId: part.id,
              quantity: partData.quantity,
              type: 'STOCK_IN',
              reason: 'Initial inventory',
              userId: userData.id,
            },
          });
        }

        return part;
      });

      return successResponse(result);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AlreadyExistsError('A part with this part number');
      }
      throw error;
    }
  }
);

// Update part (MANAGER/ADMIN only)
export const updatePart = api(
  { method: "PUT", path: "/parts/:id", auth: true },  
  async (params: UpdatePartData & { id: number }): Promise<StandardResponse> => {
    const { id, ...partData } = params;
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const currentPart = await prisma.part.findUnique({
        where: { id },
      });
      
      if (!currentPart) {
        throw NotFoundError('Part');
      }

      const quantityChange = partData.quantity !== undefined 
        ? partData.quantity - currentPart.quantity 
        : 0;

      const result = await prisma.$transaction(async (tx) => {
        const updatedPart = await tx.part.update({
          where: { id },
          data: {
            partNumber: partData.partNumber,
            name: partData.name,
            description: partData.description,
            quantity: partData.quantity,
            minQuantity: partData.minQuantity,
            location: partData.location,
            price: partData.price ? new Prisma.Decimal(partData.price) : null,
            categoryId: partData.categoryId,
            supplierId: partData.supplierId,
            unitId: partData.unitId,
            manufacturerId: partData.manufacturerId,
          },
          include: {
            category: true,
            supplier: true,
            unit: true,
            manufacturer: true,
          },
        });

        if (quantityChange !== 0) {
          await tx.inventoryTransaction.create({
            data: {
              partId: id,
              quantity: Math.abs(quantityChange),
              type: quantityChange > 0 ? 'STOCK_IN' : 'STOCK_OUT',
              reason: partData.reason || 'Manual adjustment',
              userId: userData.id,
            },
          });
        }

        return updatedPart;
      });

      return successResponse(result);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AlreadyExistsError('A part with this part number');
      }
      throw error;
    }
  }
);

// Adjust quantity (MANAGER/ADMIN only)
export const adjustQuantity = api(
  { method: "POST", path: "/parts/:id/adjust-quantity", auth: true },
  async (params: AdjustQuantityData & { id: number }): Promise<StandardResponse> => {
    const { id, ...adjustData } = params;
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      if (!adjustData.type || !['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT'].includes(adjustData.type)) {
        throw InvalidArgumentError('Valid transaction type is required');
      }
      
      if (typeof adjustData.quantity !== 'number' || adjustData.quantity <= 0) {
        throw InvalidArgumentError('Valid positive quantity is required');
      }

      const result = await prisma.$transaction(async (tx) => {
        const part = await tx.part.findUnique({
          where: { id },
        });
        
        if (!part) {
          throw NotFoundError('Part');
        }

        let newQuantity = part.quantity;
        if (adjustData.type === 'STOCK_IN') {
          newQuantity += adjustData.quantity;
        } else if (adjustData.type === 'STOCK_OUT') {
          newQuantity -= adjustData.quantity;
          if (newQuantity < 0) {
            throw InsufficientQuantityError();
          }
        } else if (adjustData.type === 'ADJUSTMENT') {
          newQuantity = adjustData.quantity;
        }

        const transaction = await tx.inventoryTransaction.create({
          data: {
            partId: id,
            quantity: adjustData.quantity,
            type: adjustData.type as any,
            reason: adjustData.reason || `Quantity ${adjustData.type.toLowerCase()}`,
            userId: userData.id,
          },
        });

        const updatedPart = await tx.part.update({
          where: { id },
          data: {
            quantity: newQuantity,
          },
          include: {
            category: true,
            supplier: true,
            unit: true,
          },
        });

        return {
          part: updatedPart,
          transaction,
        };
      });

      return successResponse(result);
    } catch (error) {
      throw error;
    }
  }
);

// Delete part (ADMIN only)
export const deletePart = api(
  { method: "DELETE", path: "/parts/:id", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.ADMIN]);

      const part = await prisma.part.findUnique({
        where: { id },
        include: {
          orderItems: true,
          inventoryTransactions: true,
          attachments: true,
        },
      });
      
      if (!part) {
        throw NotFoundError('Part');
      }

      if (part.orderItems.length > 0) {
        throw ReferencedInOrdersError(part.orderItems.length);
      }

      await prisma.$transaction(async (tx) => {
        await tx.inventoryTransaction.deleteMany({
          where: { partId: id },
        });
        
        await tx.attachment.deleteMany({
          where: { partId: id },
        });
        
        await tx.part.delete({
          where: { id },
        });
      });

      return successResponse();
    } catch (error) {
      throw error;
    }
  }
);