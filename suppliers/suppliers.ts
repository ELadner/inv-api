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
export interface GetSuppliersQuery {
  search?: string;
  country?: string;
  state?: string;
  city?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateSupplierData {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  notes?: string;
}

export interface UpdateSupplierData extends CreateSupplierData {}

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

// Get all suppliers with filtering and pagination
export const getAllSuppliers = api(
  { method: "GET", path: "/suppliers", auth: false },
  async (query: GetSuppliersQuery): Promise<PaginatedResponse> => {
    try {
      const {
        search,
        country,
        state,
        city,
        sortBy = 'name',
        order = 'asc',
        page = 1,
        limit = 20,
      } = query;

      // Build where conditions
      const where: Prisma.SupplierWhereInput = {};
      
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { contactName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
          { state: { contains: search, mode: 'insensitive' } },
          { country: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (country) where.country = { contains: country, mode: 'insensitive' };
      if (state) where.state = { contains: state, mode: 'insensitive' };
      if (city) where.city = { contains: city, mode: 'insensitive' };

      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Build sort options
      let orderBy: Prisma.SupplierOrderByWithRelationInput = { name: 'asc' };
      
      switch (sortBy) {
        case 'name':
          orderBy = { name: order };
          break;
        case 'contactName':
          orderBy = { contactName: order };
          break;
        case 'email':
          orderBy = { email: order };
          break;
        case 'city':
          orderBy = { city: order };
          break;
        case 'state':
          orderBy = { state: order };
          break;
        case 'country':
          orderBy = { country: order };
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
      const [suppliers, total] = await Promise.all([
        prisma.supplier.findMany({
          where,
          orderBy,
          skip,
          take: limit,
        }),
        prisma.supplier.count({ where }),
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrevious = page > 1;

      return paginatedResponse(suppliers, {
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

// Get supplier by ID
export const getSupplierById = api(
  { method: "GET", path: "/suppliers/:id", auth: false },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const supplier = await prisma.supplier.findUnique({
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
            },
            orderBy: { name: 'asc' },
          },
          orders: {
            select: {
              id: true,
              orderNumber: true,
              orderDate: true,
              status: true,
            },
            orderBy: { orderDate: 'desc' },
            take: 10,
          },
          Attachment: {
            select: {
              id: true,
              filename: true,
              fileType: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!supplier) {
        throw NotFoundError('Supplier');
      }

      return successResponse(supplier);
    } catch (error) {
      throw error;
    }
  }
);

// Get suppliers by country
export const getSuppliersByCountry = api(
  { method: "GET", path: "/suppliers/by-country/:country", auth: true },
  async ({ country, page = 1, limit = 20 }: { country: string; page?: number; limit?: number }): Promise<PaginatedResponse> => {
    try {
      const skip = (page - 1) * limit;
      
      const [suppliers, total] = await Promise.all([
        prisma.supplier.findMany({
          where: { 
            country: { 
              contains: country, 
              mode: 'insensitive' 
            } 
          },
          skip,
          take: limit,
          orderBy: { name: 'asc' },
        }),
        prisma.supplier.count({
          where: { 
            country: { 
              contains: country, 
              mode: 'insensitive' 
            } 
          },
        }),
      ]);

      const totalPages = Math.ceil(total / limit);
      
      return paginatedResponse(suppliers, {
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

// Get suppliers with parts count
export const getSuppliersWithPartsCounts = api(
  { method: "GET", path: "/suppliers/with-parts-count", auth: true },
  async ({ page = 1, limit = 20 }: { page?: number; limit?: number }): Promise<PaginatedResponse> => {
    try {
      const skip = (page - 1) * limit;

      const [suppliers, total] = await Promise.all([
        prisma.supplier.findMany({
          include: {
            _count: {
              select: { parts: true, orders: true }
            }
          },
          skip,
          take: limit,
          orderBy: { name: 'asc' },
        }),
        prisma.supplier.count(),
      ]);

      const totalPages = Math.ceil(total / limit);

      return paginatedResponse(suppliers, {
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

// Create supplier (MANAGER/ADMIN only)
export const createSupplier = api(
  { method: "POST", path: "/suppliers", auth: true },
  async (supplierData: CreateSupplierData): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      // Check if supplier with same name already exists
      const existingSupplier = await prisma.supplier.findFirst({
        where: {
          name: {
            equals: supplierData.name,
            mode: 'insensitive'
          }
        }
      });

      if (existingSupplier) {
        throw AlreadyExistsError('A supplier with this name');
      }

      const supplier = await prisma.supplier.create({
        data: {
          name: supplierData.name,
          contactName: supplierData.contactName,
          email: supplierData.email,
          phone: supplierData.phone,
          address: supplierData.address,
          city: supplierData.city,
          state: supplierData.state,
          zipCode: supplierData.zipCode,
          country: supplierData.country,
          notes: supplierData.notes,
        },
      });

      return successResponse(supplier);
    } catch (error) {
      throw error;
    }
  }
);

// Update supplier (MANAGER/ADMIN only)
export const updateSupplier = api(
  { method: "PUT", path: "/suppliers/:id", auth: true },  
  async (params: UpdateSupplierData & { id: number }): Promise<StandardResponse> => {
    const { id, ...supplierData } = params;
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const currentSupplier = await prisma.supplier.findUnique({
        where: { id },
      });
      
      if (!currentSupplier) {
        throw NotFoundError('Supplier');
      }

      // Check if another supplier with same name exists (excluding current one)
      if (supplierData.name) {
        const existingSupplier = await prisma.supplier.findFirst({
          where: {
            name: {
              equals: supplierData.name,
              mode: 'insensitive'
            },
            id: { not: id }
          }
        });

        if (existingSupplier) {
          throw AlreadyExistsError('A supplier with this name');
        }
      }

      const updatedSupplier = await prisma.supplier.update({
        where: { id },
        data: {
          name: supplierData.name,
          contactName: supplierData.contactName,
          email: supplierData.email,
          phone: supplierData.phone,
          address: supplierData.address,
          city: supplierData.city,
          state: supplierData.state,
          zipCode: supplierData.zipCode,
          country: supplierData.country,
          notes: supplierData.notes,
        },
      });

      return successResponse(updatedSupplier);
    } catch (error) {
      throw error;
    }
  }
);

// Delete supplier (ADMIN only)
export const deleteSupplier = api(
  { method: "DELETE", path: "/suppliers/:id", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.ADMIN]);

      const supplier = await prisma.supplier.findUnique({
        where: { id },
        include: {
          parts: true,
          orders: true,
          Attachment: true,
        },
      });
      
      if (!supplier) {
        throw NotFoundError('Supplier');
      }

      // Check for related parts
      if (supplier.parts.length > 0) {
        throw ReferencedInOrdersError(supplier.parts.length);
      }

      // Check for related orders
      if (supplier.orders.length > 0) {
        throw ReferencedInOrdersError(supplier.orders.length);
      }

      // Delete in a transaction to clean up related records
      await prisma.$transaction(async (tx) => {
        // Delete related attachments
        await tx.attachment.deleteMany({
          where: { supplierId: id },
        });
        
        // Delete the supplier
        await tx.supplier.delete({
          where: { id },
        });
      });

      return successResponse();
    } catch (error) {
      throw error;
    }
  }
);

// Get supplier statistics (MANAGER/ADMIN only)
export const getSupplierStats = api(
  { method: "GET", path: "/suppliers/:id/stats", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const supplier = await prisma.supplier.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              parts: true,
              orders: true,
              Attachment: true,
            }
          },
          parts: {
            select: {
              quantity: true,
              minQuantity: true,
              price: true,
            }
          },
          orders: {
            select: {
              status: true,
              orderDate: true,
            }
          }
        }
      });

      if (!supplier) {
        throw NotFoundError('Supplier');
      }

      // Calculate statistics
      const totalParts = supplier._count.parts;
      const totalOrders = supplier._count.orders;
      const totalAttachments = supplier._count.Attachment;

      // Calculate low stock parts (quantity < minQuantity)
      const lowStockParts = supplier.parts.filter(part => part.quantity < part.minQuantity).length;

      // Calculate total inventory value
      const totalInventoryValue = supplier.parts.reduce((sum, part) => {
        const price = part.price ? Number(part.price) : 0;
        return sum + (price * part.quantity);
      }, 0);

      // Order statistics
      const ordersByStatus = supplier.orders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Recent orders (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentOrders = supplier.orders.filter(order => order.orderDate >= thirtyDaysAgo).length;

      const stats = {
        supplier: {
          id: supplier.id,
          name: supplier.name,
          contactName: supplier.contactName,
          email: supplier.email,
        },
        counts: {
          totalParts,
          totalOrders,
          totalAttachments,
          lowStockParts,
          recentOrders,
        },
        inventory: {
          totalValue: totalInventoryValue,
          averagePartValue: totalParts > 0 ? totalInventoryValue / totalParts : 0,
        },
        orders: {
          byStatus: ordersByStatus,
          recentCount: recentOrders,
        }
      };

      return successResponse(stats);
    } catch (error) {
      throw error;
    }
  }
);