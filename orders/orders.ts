import { api } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { Prisma } from '@prisma/client';
import { auth, UserData, UserRole } from '../auth/auth';

// Define OrderStatus enum directly for Encore compatibility
export enum OrderStatus {
  PENDING = "PENDING",
  ORDERED = "ORDERED",
  SHIPPED = "SHIPPED", 
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED"
}
import { 
  AuthenticationRequiredError, 
  PermissionDeniedError, 
  NotFoundError, 
  AlreadyExistsError,
  InvalidArgumentError,
  InternalError
} from '../common/errors';
import { successResponse, paginatedResponse, StandardResponse, PaginatedResponse } from '../common/responses';
import { prisma } from '../common/database';

// Request/Response interfaces
export interface GetOrdersQuery {
  search?: string;
  status?: OrderStatus;
  supplierId?: number;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateOrderData {
  orderNumber?: string; // Optional - will be auto-generated if not provided
  supplierId: number;
  orderDate?: string; // Optional - defaults to now
  status?: OrderStatus; // Optional - defaults to PENDING
  items?: CreateOrderItemData[]; // Optional initial items
}

export interface CreateOrderItemData {
  partId: number;
  quantity: number;
  price?: number; // Optional - will use part's current price if not provided
}

export interface UpdateOrderData {
  orderNumber?: string;
  supplierId?: number;
  orderDate?: string;
  status?: OrderStatus;
}

export interface AddOrderItemData {
  partId: number;
  quantity: number;
  price?: number;
}

export interface UpdateOrderItemData {
  quantity?: number;
  price?: number;
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

// Helper function to generate order number
function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

// Get all orders with filtering and pagination
export const getAllOrders = api(
  { method: "GET", path: "/orders", auth: true },
  async (query: GetOrdersQuery): Promise<PaginatedResponse> => {
    try {
      const {
        search,
        status,
        supplierId,
        startDate,
        endDate,
        sortBy = 'orderDate',
        order = 'desc',
        page = 1,
        limit = 20,
      } = query;

      // Build where conditions
      const where: Prisma.OrderWhereInput = {};
      
      if (search) {
        where.OR = [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { supplier: { name: { contains: search, mode: 'insensitive' } } },
        ];
      }

      if (status) where.status = status;
      if (supplierId) where.supplierId = supplierId;

      // Date range filtering
      if (startDate || endDate) {
        where.orderDate = {};
        if (startDate) where.orderDate.gte = new Date(startDate);
        if (endDate) where.orderDate.lte = new Date(endDate);
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Build sort options
      let orderBy: Prisma.OrderOrderByWithRelationInput = { orderDate: 'desc' };
      
      switch (sortBy) {
        case 'orderNumber':
          orderBy = { orderNumber: order };
          break;
        case 'orderDate':
          orderBy = { orderDate: order };
          break;
        case 'status':
          orderBy = { status: order };
          break;
        case 'supplier':
          orderBy = { supplier: { name: order } };
          break;
        case 'createdAt':
          orderBy = { createdAt: order };
          break;
        case 'updatedAt':
          orderBy = { updatedAt: order };
          break;
        default:
          orderBy = { orderDate: 'desc' };
      }

      // Execute query with count
      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
                contactName: true,
                email: true,
              }
            },
            orderItems: {
              include: {
                part: {
                  select: {
                    id: true,
                    partNumber: true,
                    name: true,
                  }
                }
              }
            },
            _count: {
              select: { orderItems: true }
            }
          },
          orderBy,
          skip,
          take: limit,
        }),
        prisma.order.count({ where }),
      ]);

      // Calculate order totals
      const ordersWithTotals = orders.map(order => ({
        ...order,
        totalItems: order._count.orderItems,
        totalAmount: order.orderItems.reduce((sum, item) => {
          const price = item.price ? Number(item.price) : 0;
          return sum + (price * item.quantity);
        }, 0),
      }));

      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrevious = page > 1;

      return paginatedResponse(ordersWithTotals, {
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

// Get order by ID with full details
export const getOrderById = api(
  { method: "GET", path: "/orders/:id", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          supplier: true,
          orderItems: {
            include: {
              part: {
                include: {
                  category: { select: { id: true, name: true } },
                  unit: { select: { id: true, name: true } },
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        },
      });

      if (!order) {
        throw NotFoundError('Order');
      }

      // Calculate totals
      const totalItems = order.orderItems.length;
      const totalQuantity = order.orderItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalAmount = order.orderItems.reduce((sum, item) => {
        const price = item.price ? Number(item.price) : 0;
        return sum + (price * item.quantity);
      }, 0);

      const orderWithTotals = {
        ...order,
        totals: {
          totalItems,
          totalQuantity,
          totalAmount,
        }
      };

      return successResponse(orderWithTotals);
    } catch (error) {
      throw error;
    }
  }
);

// Get orders by supplier
export const getOrdersBySupplier = api(
  { method: "GET", path: "/orders/by-supplier/:supplierId", auth: true },
  async ({ supplierId, page = 1, limit = 20 }: { supplierId: number; page?: number; limit?: number }): Promise<PaginatedResponse> => {
    try {
      const skip = (page - 1) * limit;
      
      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where: { supplierId },
          include: {
            supplier: {
              select: { id: true, name: true, contactName: true }
            },
            _count: {
              select: { orderItems: true }
            }
          },
          skip,
          take: limit,
          orderBy: { orderDate: 'desc' },
        }),
        prisma.order.count({ where: { supplierId } }),
      ]);

      const totalPages = Math.ceil(total / limit);
      
      return paginatedResponse(orders, {
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

// Get orders by status  
export const getOrdersByStatus = api(
  { method: "GET", path: "/orders/by-status/:status", auth: true },  
  async ({ status, page = 1, limit = 20 }: { status: string; page?: number; limit?: number }): Promise<PaginatedResponse> => {
    // Validate status parameter
    if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
      throw InvalidArgumentError(`Invalid order status: ${status}`);
    }
    const orderStatus = status as OrderStatus;
    try {
      const skip = (page - 1) * limit;
      
      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where: { status: orderStatus },
          include: {
            supplier: {
              select: { id: true, name: true, contactName: true }
            },
            _count: {
              select: { orderItems: true }
            }
          },
          skip,
          take: limit,
          orderBy: { orderDate: 'desc' },
        }),
        prisma.order.count({ where: { status: orderStatus } }),
      ]);

      const totalPages = Math.ceil(total / limit);
      
      return paginatedResponse(orders, {
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

// Create order (MANAGER/ADMIN only)
export const createOrder = api(
  { method: "POST", path: "/orders", auth: true },
  async (orderData: CreateOrderData): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      // Verify supplier exists
      const supplier = await prisma.supplier.findUnique({
        where: { id: orderData.supplierId }
      });

      if (!supplier) {
        throw NotFoundError('Supplier');
      }

      // Generate order number if not provided
      const orderNumber = orderData.orderNumber || generateOrderNumber();

      // Check if order number already exists
      const existingOrder = await prisma.order.findUnique({
        where: { orderNumber }
      });

      if (existingOrder) {
        throw AlreadyExistsError('Order with this order number');
      }

      // Create order with items in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the order
        const order = await tx.order.create({
          data: {
            orderNumber,
            orderDate: orderData.orderDate ? new Date(orderData.orderDate) : new Date(),
            status: orderData.status || OrderStatus.PENDING,
            supplierId: orderData.supplierId,
          },
          include: {
            supplier: true,
          }
        });

        // Add initial items if provided
        if (orderData.items && orderData.items.length > 0) {
          for (const itemData of orderData.items) {
            // Verify part exists
            const part = await tx.part.findUnique({
              where: { id: itemData.partId }
            });

            if (!part) {
              throw NotFoundError(`Part with ID ${itemData.partId}`);
            }

            // Use provided price or fall back to part's current price
            const price = itemData.price !== undefined 
              ? new Prisma.Decimal(itemData.price)
              : part.price;

            // Create order item
            await tx.orderItem.create({
              data: {
                orderId: order.id,
                partId: itemData.partId,
                quantity: itemData.quantity,
                price,
              }
            });
          }
        }

        // Return order with items
        return await tx.order.findUnique({
          where: { id: order.id },
          include: {
            supplier: true,
            orderItems: {
              include: {
                part: {
                  select: {
                    id: true,
                    partNumber: true,
                    name: true,
                  }
                }
              }
            }
          }
        });
      });

      return successResponse(result);
    } catch (error) {
      throw error;
    }
  }
);

// Update order (MANAGER/ADMIN only)
export const updateOrder = api(
  { method: "PUT", path: "/orders/:id", auth: true },  
  async (params: UpdateOrderData & { id: number }): Promise<StandardResponse> => {
    const { id, ...orderData } = params;
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const currentOrder = await prisma.order.findUnique({
        where: { id },
      });
      
      if (!currentOrder) {
        throw NotFoundError('Order');
      }

      // Check if order number is being changed and if it already exists
      if (orderData.orderNumber && orderData.orderNumber !== currentOrder.orderNumber) {
        const existingOrder = await prisma.order.findUnique({
          where: { orderNumber: orderData.orderNumber }
        });

        if (existingOrder) {
          throw AlreadyExistsError('Order with this order number');
        }
      }

      // Verify supplier exists if being changed
      if (orderData.supplierId && orderData.supplierId !== currentOrder.supplierId) {
        const supplier = await prisma.supplier.findUnique({
          where: { id: orderData.supplierId }
        });

        if (!supplier) {
          throw NotFoundError('Supplier');
        }
      }

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: {
          orderNumber: orderData.orderNumber,
          orderDate: orderData.orderDate ? new Date(orderData.orderDate) : undefined,
          status: orderData.status,
          supplierId: orderData.supplierId,
        },
        include: {
          supplier: true,
          orderItems: {
            include: {
              part: {
                select: {
                  id: true,
                  partNumber: true,
                  name: true,
                }
              }
            }
          }
        },
      });

      return successResponse(updatedOrder);
    } catch (error) {
      throw error;
    }
  }
);

// Update order status (MANAGER/ADMIN only)
export const updateOrderStatus = api(
  { method: "PUT", path: "/orders/:id/status", auth: true },
  async ({ id, status }: { id: number; status: string }): Promise<StandardResponse> => {
    // Validate status parameter
    if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
      throw InvalidArgumentError(`Invalid order status: ${status}`);
    }
    const orderStatus = status as OrderStatus;
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const order = await prisma.order.findUnique({
        where: { id }
      });

      if (!order) {
        throw NotFoundError('Order');
      }

      // Validate status transition (basic business rules)
      const validTransitions: Record<OrderStatus, OrderStatus[]> = {
        [OrderStatus.PENDING]: [OrderStatus.ORDERED, OrderStatus.CANCELLED],
        [OrderStatus.ORDERED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
        [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
        [OrderStatus.DELIVERED]: [], // Terminal state
        [OrderStatus.CANCELLED]: [], // Terminal state
      };

      if (!validTransitions[order.status].includes(orderStatus)) {
        throw InvalidArgumentError(`Cannot transition from ${order.status} to ${orderStatus}`);
      }

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: { status: orderStatus },
        include: {
          supplier: true,
          orderItems: {
            include: {
              part: {
                select: {
                  id: true,
                  partNumber: true,
                  name: true,
                }
              }
            }
          }
        }
      });

      return successResponse(updatedOrder);
    } catch (error) {
      throw error;
    }
  }
);

// Calculate order total
export const getOrderTotal = api(
  { method: "GET", path: "/orders/:id/total", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          orderItems: {
            include: {
              part: {
                select: {
                  id: true,
                  partNumber: true,
                  name: true,
                }
              }
            }
          }
        }
      });

      if (!order) {
        throw NotFoundError('Order');
      }

      const totals = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalItems: order.orderItems.length,
        totalQuantity: order.orderItems.reduce((sum, item) => sum + item.quantity, 0),
        totalAmount: order.orderItems.reduce((sum, item) => {
          const price = item.price ? Number(item.price) : 0;
          return sum + (price * item.quantity);
        }, 0),
        itemBreakdown: order.orderItems.map(item => ({
          partId: item.partId,
          partNumber: item.part.partNumber,
          partName: item.part.name,
          quantity: item.quantity,
          unitPrice: item.price ? Number(item.price) : 0,
          lineTotal: item.price ? Number(item.price) * item.quantity : 0,
        }))
      };

      return successResponse(totals);
    } catch (error) {
      throw error;
    }
  }
);

// Delete order (ADMIN only)
export const deleteOrder = api(
  { method: "DELETE", path: "/orders/:id", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.ADMIN]);

      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          orderItems: true,
        },
      });
      
      if (!order) {
        throw NotFoundError('Order');
      }

      // Prevent deletion of orders that are not in PENDING or CANCELLED status
      if (![OrderStatus.PENDING, OrderStatus.CANCELLED].includes(order.status)) {
        throw InvalidArgumentError(`Cannot delete order with status ${order.status}`);
      }

      // Delete in a transaction to clean up related records
      await prisma.$transaction(async (tx) => {
        // Delete order items first
        await tx.orderItem.deleteMany({
          where: { orderId: id },
        });
        
        // Delete the order
        await tx.order.delete({
          where: { id },
        });
      });

      return successResponse();
    } catch (error) {
      throw error;
    }
  }
);

// ==================== ORDER ITEMS SUB-RESOURCE OPERATIONS ====================

// Get all items for an order
export const getOrderItems = api(
  { method: "GET", path: "/orders/:id/items", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      // Verify order exists
      const order = await prisma.order.findUnique({
        where: { id },
        select: { id: true, orderNumber: true, status: true }
      });

      if (!order) {
        throw NotFoundError('Order');
      }

      const orderItems = await prisma.orderItem.findMany({
        where: { orderId: id },
        include: {
          part: {
            include: {
              category: { select: { id: true, name: true } },
              unit: { select: { id: true, name: true } },
              supplier: { select: { id: true, name: true } },
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      // Calculate totals
      const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalAmount = orderItems.reduce((sum, item) => {
        const price = item.price ? Number(item.price) : 0;
        return sum + (price * item.quantity);
      }, 0);

      const response = {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
        },
        items: orderItems,
        totals: {
          totalItems: orderItems.length,
          totalQuantity,
          totalAmount,
        }
      };

      return successResponse(response);
    } catch (error) {
      throw error;
    }
  }
);

// Add item to order (MANAGER/ADMIN only)
export const addOrderItem = api(
  { method: "POST", path: "/orders/:id/items", auth: true },
  async ({ id, ...itemData }: AddOrderItemData & { id: number }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      // Verify order exists and is editable
      const order = await prisma.order.findUnique({
        where: { id }
      });

      if (!order) {
        throw NotFoundError('Order');
      }

      // Prevent adding items to orders that are not editable
      if (![OrderStatus.PENDING, OrderStatus.ORDERED].includes(order.status)) {
        throw InvalidArgumentError(`Cannot add items to order with status ${order.status}`);
      }

      // Verify part exists
      const part = await prisma.part.findUnique({
        where: { id: itemData.partId }
      });

      if (!part) {
        throw NotFoundError('Part');
      }

      // Check if item already exists (unique constraint on orderId + partId)
      const existingItem = await prisma.orderItem.findUnique({
        where: {
          orderId_partId: {
            orderId: id,
            partId: itemData.partId
          }
        }
      });

      if (existingItem) {
        throw AlreadyExistsError('Item for this part already exists in the order');
      }

      // Use provided price or fall back to part's current price
      const price = itemData.price !== undefined 
        ? new Prisma.Decimal(itemData.price)
        : part.price;

      const orderItem = await prisma.orderItem.create({
        data: {
          orderId: id,
          partId: itemData.partId,
          quantity: itemData.quantity,
          price,
        },
        include: {
          part: {
            include: {
              category: { select: { id: true, name: true } },
              unit: { select: { id: true, name: true } },
            }
          }
        }
      });

      return successResponse(orderItem);
    } catch (error) {
      throw error;
    }
  }
);

// Update order item (MANAGER/ADMIN only)
export const updateOrderItem = api(
  { method: "PUT", path: "/orders/:id/items/:itemId", auth: true },
  async (params: UpdateOrderItemData & { id: number; itemId: number }): Promise<StandardResponse> => {
    const { id, itemId, ...updateData } = params;
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      // Verify order exists and is editable
      const order = await prisma.order.findUnique({
        where: { id }
      });

      if (!order) {
        throw NotFoundError('Order');
      }

      if (![OrderStatus.PENDING, OrderStatus.ORDERED].includes(order.status)) {
        throw InvalidArgumentError(`Cannot update items in order with status ${order.status}`);
      }

      // Verify order item exists and belongs to the order
      const orderItem = await prisma.orderItem.findUnique({
        where: { id: itemId }
      });

      if (!orderItem || orderItem.orderId !== id) {
        throw NotFoundError('Order item');
      }

      const updatedItem = await prisma.orderItem.update({
        where: { id: itemId },
        data: {
          quantity: updateData.quantity,
          price: updateData.price ? new Prisma.Decimal(updateData.price) : undefined,
        },
        include: {
          part: {
            include: {
              category: { select: { id: true, name: true } },
              unit: { select: { id: true, name: true } },
            }
          }
        }
      });

      return successResponse(updatedItem);
    } catch (error) {
      throw error;
    }
  }
);

// Remove item from order (MANAGER/ADMIN only)
export const removeOrderItem = api(
  { method: "DELETE", path: "/orders/:id/items/:itemId", auth: true },
  async ({ id, itemId }: { id: number; itemId: number }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      // Verify order exists and is editable
      const order = await prisma.order.findUnique({
        where: { id }
      });

      if (!order) {
        throw NotFoundError('Order');
      }

      if (![OrderStatus.PENDING, OrderStatus.ORDERED].includes(order.status)) {
        throw InvalidArgumentError(`Cannot remove items from order with status ${order.status}`);
      }

      // Verify order item exists and belongs to the order
      const orderItem = await prisma.orderItem.findUnique({
        where: { id: itemId }
      });

      if (!orderItem || orderItem.orderId !== id) {
        throw NotFoundError('Order item');
      }

      await prisma.orderItem.delete({
        where: { id: itemId }
      });

      return successResponse();
    } catch (error) {
      throw error;
    }
  }
);

// Bulk update order items (MANAGER/ADMIN only)
export const bulkUpdateOrderItems = api(
  { method: "PUT", path: "/orders/:id/items/bulk", auth: true },
  async ({ id, items }: { id: number; items: Array<{ itemId: number } & UpdateOrderItemData> }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      // Verify order exists and is editable
      const order = await prisma.order.findUnique({
        where: { id }
      });

      if (!order) {
        throw NotFoundError('Order');
      }

      if (![OrderStatus.PENDING, OrderStatus.ORDERED].includes(order.status)) {
        throw InvalidArgumentError(`Cannot update items in order with status ${order.status}`);
      }

      // Update all items in a transaction
      const updatedItems = await prisma.$transaction(async (tx) => {
        const results = [];
        
        for (const itemUpdate of items) {
          // Verify order item exists and belongs to the order
          const orderItem = await tx.orderItem.findUnique({
            where: { id: itemUpdate.itemId }
          });

          if (!orderItem || orderItem.orderId !== id) {
            throw NotFoundError(`Order item with ID ${itemUpdate.itemId}`);
          }

          const updated = await tx.orderItem.update({
            where: { id: itemUpdate.itemId },
            data: {
              quantity: itemUpdate.quantity,
              price: itemUpdate.price ? new Prisma.Decimal(itemUpdate.price) : undefined,
            },
            include: {
              part: {
                select: {
                  id: true,
                  partNumber: true,
                  name: true,
                }
              }
            }
          });

          results.push(updated);
        }

        return results;
      });

      return successResponse(updatedItems);
    } catch (error) {
      throw error;
    }
  }
);