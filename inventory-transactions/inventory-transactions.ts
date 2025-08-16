import { api } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { Prisma, UserRole } from '@prisma/client';
import { auth, UserData } from '../auth/auth';
import { 
  AuthenticationRequiredError, 
  PermissionDeniedError, 
  NotFoundError, 
  InvalidArgumentError
} from '../common/errors';
import { successResponse, paginatedResponse, StandardResponse, PaginatedResponse } from '../common/responses';
import { prisma } from '../common/database';

// Define TransactionType enum directly for Encore compatibility
export enum TransactionType {
  STOCK_IN = "STOCK_IN",
  STOCK_OUT = "STOCK_OUT",
  ADJUSTMENT = "ADJUSTMENT"
}

// Request/Response interfaces
export interface GetTransactionsQuery {
  partId?: number;
  userId?: number;
  type?: TransactionType;
  startDate?: string;
  endDate?: string;
  reason?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface GetTransactionsByPartQuery {
  type?: TransactionType;
  startDate?: string;
  endDate?: string;
  userId?: number;
  page?: number;
  limit?: number;
}

export interface GetTransactionsByUserQuery {
  partId?: number;
  type?: TransactionType;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
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

// Helper function to parse date strings
function parseDate(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw InvalidArgumentError('Invalid date format');
  }
  return date;
}

// Get all inventory transactions with filtering and pagination (AUTH required)
export const getAllTransactions = api(
  { method: "GET", path: "/inventory-transactions", auth: true },
  async (query: GetTransactionsQuery): Promise<PaginatedResponse> => {
    try {
      const {
        partId,
        userId,
        type,
        startDate,
        endDate,
        reason,
        sortBy = 'createdAt',
        order = 'desc',
        page = 1,
        limit = 20,
      } = query;

      // Build where conditions
      const where: Prisma.InventoryTransactionWhereInput = {};
      
      if (partId) where.partId = partId;
      if (userId) where.userId = userId;
      if (type) where.type = type;
      if (reason) {
        where.reason = { contains: reason, mode: 'insensitive' };
      }

      // Handle date filtering
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = parseDate(startDate);
        if (endDate) where.createdAt.lte = parseDate(endDate);
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Build sort options
      let orderBy: Prisma.InventoryTransactionOrderByWithRelationInput = { createdAt: 'desc' };
      
      switch (sortBy) {
        case 'createdAt':
          orderBy = { createdAt: order };
          break;
        case 'quantity':
          orderBy = { quantity: order };
          break;
        case 'type':
          orderBy = { type: order };
          break;
        case 'part':
          orderBy = { part: { name: order } };
          break;
        case 'user':
          orderBy = { user: { username: order } };
          break;
        default:
          orderBy = { createdAt: 'desc' };
      }

      // Execute query with count
      const [transactions, total] = await Promise.all([
        prisma.inventoryTransaction.findMany({
          where,
          include: {
            part: {
              select: {
                id: true,
                partNumber: true,
                name: true,
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
              }
            },
            user: {
              select: {
                id: true,
                username: true,
                email: true,
              }
            }
          },
          orderBy,
          skip,
          take: limit,
        }),
        prisma.inventoryTransaction.count({ where }),
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrevious = page > 1;

      return paginatedResponse(transactions, {
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

// Get inventory transaction by ID (AUTH required)
export const getTransactionById = api(
  { method: "GET", path: "/inventory-transactions/:id", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const transaction = await prisma.inventoryTransaction.findUnique({
        where: { id },
        include: {
          part: {
            include: {
              category: true,
              supplier: true,
              unit: true,
              manufacturer: true,
            }
          },
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              role: true,
            }
          }
        },
      });

      if (!transaction) {
        throw NotFoundError('Inventory transaction');
      }

      return successResponse(transaction);
    } catch (error) {
      throw error;
    }
  }
);

// Get inventory transactions by part ID (AUTH required)
export const getTransactionsByPart = api(
  { method: "GET", path: "/inventory-transactions/by-part/:partId", auth: true },
  async (params: GetTransactionsByPartQuery & { partId: number }): Promise<PaginatedResponse> => {
    const { partId, type, startDate, endDate, userId, page = 1, limit = 20 } = params;
    try {
      // Verify part exists
      const part = await prisma.part.findUnique({
        where: { id: partId },
        select: { id: true }
      });

      if (!part) {
        throw NotFoundError('Part');
      }

      // Build where conditions
      const where: Prisma.InventoryTransactionWhereInput = { partId };
      
      if (type) where.type = type;
      if (userId) where.userId = userId;

      // Handle date filtering
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = parseDate(startDate);
        if (endDate) where.createdAt.lte = parseDate(endDate);
      }

      const skip = (page - 1) * limit;

      const [transactions, total] = await Promise.all([
        prisma.inventoryTransaction.findMany({
          where,
          include: {
            part: {
              select: {
                id: true,
                partNumber: true,
                name: true,
              }
            },
            user: {
              select: {
                id: true,
                username: true,
                email: true,
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.inventoryTransaction.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return paginatedResponse(transactions, {
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

// Get inventory transactions by user ID (AUTH required)
export const getTransactionsByUser = api(
  { method: "GET", path: "/inventory-transactions/by-user/:userId", auth: true },
  async (params: GetTransactionsByUserQuery & { userId: number }): Promise<PaginatedResponse> => {
    const { userId, partId, type, startDate, endDate, page = 1, limit = 20 } = params;
    try {
      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });

      if (!user) {
        throw NotFoundError('User');
      }

      // Build where conditions
      const where: Prisma.InventoryTransactionWhereInput = { userId };
      
      if (partId) where.partId = partId;
      if (type) where.type = type;

      // Handle date filtering
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = parseDate(startDate);
        if (endDate) where.createdAt.lte = parseDate(endDate);
      }

      const skip = (page - 1) * limit;

      const [transactions, total] = await Promise.all([
        prisma.inventoryTransaction.findMany({
          where,
          include: {
            part: {
              select: {
                id: true,
                partNumber: true,
                name: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                  }
                }
              }
            },
            user: {
              select: {
                id: true,
                username: true,
                email: true,
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.inventoryTransaction.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return paginatedResponse(transactions, {
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

// Get transaction statistics by transaction type (MANAGER/ADMIN only)
export const getTransactionStats = api(
  { method: "GET", path: "/inventory-transactions/stats", auth: true },
  async ({ startDate, endDate }: { startDate?: string; endDate?: string }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      // Build date filter
      const dateFilter: Prisma.InventoryTransactionWhereInput = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.gte = parseDate(startDate);
        if (endDate) dateFilter.createdAt.lte = parseDate(endDate);
      }

      // Get transaction counts by type
      const [stockInCount, stockOutCount, adjustmentCount, totalTransactions] = await Promise.all([
        prisma.inventoryTransaction.count({
          where: { type: TransactionType.STOCK_IN, ...dateFilter }
        }),
        prisma.inventoryTransaction.count({
          where: { type: TransactionType.STOCK_OUT, ...dateFilter }
        }),
        prisma.inventoryTransaction.count({
          where: { type: TransactionType.ADJUSTMENT, ...dateFilter }
        }),
        prisma.inventoryTransaction.count({ where: dateFilter }),
      ]);

      // Get quantity totals by type
      const [stockInTotal, stockOutTotal, adjustmentTotal] = await Promise.all([
        prisma.inventoryTransaction.aggregate({
          where: { type: TransactionType.STOCK_IN, ...dateFilter },
          _sum: { quantity: true }
        }),
        prisma.inventoryTransaction.aggregate({
          where: { type: TransactionType.STOCK_OUT, ...dateFilter },
          _sum: { quantity: true }
        }),
        prisma.inventoryTransaction.aggregate({
          where: { type: TransactionType.ADJUSTMENT, ...dateFilter },
          _sum: { quantity: true }
        }),
      ]);

      // Get most active parts
      const mostActivePartTransactions = await prisma.inventoryTransaction.groupBy({
        by: ['partId'],
        where: dateFilter,
        _count: { id: true },
        _sum: { quantity: true },
        orderBy: {
          _count: { id: 'desc' }
        },
        take: 10,
      });

      // Get part details for most active parts
      const partIds = mostActivePartTransactions.map(t => t.partId);
      const partDetails = await prisma.part.findMany({
        where: { id: { in: partIds } },
        select: {
          id: true,
          partNumber: true,
          name: true,
          category: { select: { name: true } },
          supplier: { select: { name: true } },
        }
      });

      const mostActiveParts = mostActivePartTransactions.map(transaction => {
        const part = partDetails.find(p => p.id === transaction.partId);
        return {
          part,
          transactionCount: transaction._count.id,
          totalQuantity: transaction._sum.quantity || 0,
        };
      });

      // Get most active users
      const mostActiveUserTransactions = await prisma.inventoryTransaction.groupBy({
        by: ['userId'],
        where: { ...dateFilter, userId: { not: null } },
        _count: { id: true },
        orderBy: {
          _count: { id: 'desc' }
        },
        take: 10,
      });

      // Get user details for most active users
      const userIds = mostActiveUserTransactions.map(t => t.userId).filter((id): id is number => id !== null);
      const userDetails = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          username: true,
          email: true,
        }
      });

      const mostActiveUsers = mostActiveUserTransactions.map(transaction => {
        const user = userDetails.find(u => u.id === transaction.userId);
        return {
          user,
          transactionCount: transaction._count.id,
        };
      }).filter(item => item.user);

      const stats = {
        summary: {
          totalTransactions,
          stockInCount,
          stockOutCount,
          adjustmentCount,
        },
        quantities: {
          totalStockIn: stockInTotal._sum.quantity || 0,
          totalStockOut: stockOutTotal._sum.quantity || 0,
          totalAdjustments: adjustmentTotal._sum.quantity || 0,
        },
        mostActiveParts,
        mostActiveUsers,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null,
        }
      };

      return successResponse(stats);
    } catch (error) {
      throw error;
    }
  }
);

// Get recent inventory transactions (AUTH required) 
export const getRecentTransactions = api(
  { method: "GET", path: "/inventory-transactions/recent", auth: true },
  async ({ limit = 50 }: { limit?: number }): Promise<StandardResponse> => {
    try {
      const transactions = await prisma.inventoryTransaction.findMany({
        include: {
          part: {
            select: {
              id: true,
              partNumber: true,
              name: true,
              category: {
                select: {
                  name: true,
                }
              }
            }
          },
          user: {
            select: {
              id: true,
              username: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100), // Cap at 100 for performance
      });

      return successResponse(transactions);
    } catch (error) {
      throw error;
    }
  }
);