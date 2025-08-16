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
  InternalError
} from '../common/errors';
import { successResponse, paginatedResponse, StandardResponse, PaginatedResponse } from '../common/responses';
import { prisma } from '../common/database';

// Request/Response interfaces
export interface GetAttachmentsQuery {
  search?: string;
  fileType?: string;
  partId?: number;
  supplierId?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CreateAttachmentData {
  filename: string;
  path: string;
  fileType: string;
  partId?: number;
  supplierId?: number;
}

export interface UpdateAttachmentData {
  filename?: string;
  partId?: number;
  supplierId?: number;
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

// Get all attachments with filtering and pagination
export const getAllAttachments = api(
  { method: "GET", path: "/attachments", auth: true },
  async (query: GetAttachmentsQuery): Promise<PaginatedResponse> => {
    try {
      const {
        search,
        fileType,
        partId,
        supplierId,
        sortBy = 'createdAt',
        order = 'desc',
        page = 1,
        limit = 20,
      } = query;

      // Build where conditions
      const where: Prisma.AttachmentWhereInput = {};
      
      if (search) {
        where.OR = [
          { filename: { contains: search, mode: 'insensitive' } },
          { fileType: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (fileType) where.fileType = { contains: fileType, mode: 'insensitive' };
      if (partId) where.partId = partId;
      if (supplierId) where.supplierId = supplierId;

      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Build sort options
      let orderBy: Prisma.AttachmentOrderByWithRelationInput = { createdAt: 'desc' };
      
      switch (sortBy) {
        case 'filename':
          orderBy = { filename: order };
          break;
        case 'fileType':
          orderBy = { fileType: order };
          break;
        case 'createdAt':
          orderBy = { createdAt: order };
          break;
        case 'part':
          orderBy = { part: { name: order } };
          break;
        case 'supplier':
          orderBy = { supplier: { name: order } };
          break;
        default:
          orderBy = { createdAt: 'desc' };
      }

      // Execute query with count
      const [attachments, total] = await Promise.all([
        prisma.attachment.findMany({
          where,
          include: {
            part: {
              select: {
                id: true,
                partNumber: true,
                name: true,
              }
            },
            supplier: {
              select: {
                id: true,
                name: true,
              }
            }
          },
          orderBy,
          skip,
          take: limit,
        }),
        prisma.attachment.count({ where }),
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrevious = page > 1;

      return paginatedResponse(attachments, {
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

// Get attachment by ID
export const getAttachmentById = api(
  { method: "GET", path: "/attachments/:id", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const attachment = await prisma.attachment.findUnique({
        where: { id },
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
          supplier: {
            select: {
              id: true,
              name: true,
              contactName: true,
              email: true,
            }
          }
        },
      });

      if (!attachment) {
        throw NotFoundError('Attachment');
      }

      return successResponse(attachment);
    } catch (error) {
      throw error;
    }
  }
);

// Get attachments by part ID
export const getAttachmentsByPart = api(
  { method: "GET", path: "/attachments/by-part/:partId", auth: true },
  async ({ partId, page = 1, limit = 20 }: { partId: number; page?: number; limit?: number }): Promise<PaginatedResponse> => {
    try {
      // Verify part exists
      const part = await prisma.part.findUnique({
        where: { id: partId },
        select: { id: true }
      });

      if (!part) {
        throw NotFoundError('Part');
      }

      const skip = (page - 1) * limit;
      
      const [attachments, total] = await Promise.all([
        prisma.attachment.findMany({
          where: { partId },
          include: {
            part: {
              select: {
                id: true,
                partNumber: true,
                name: true,
              }
            }
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.attachment.count({ where: { partId } }),
      ]);

      const totalPages = Math.ceil(total / limit);
      
      return paginatedResponse(attachments, {
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

// Get attachments by supplier ID
export const getAttachmentsBySupplier = api(
  { method: "GET", path: "/attachments/by-supplier/:supplierId", auth: true },
  async ({ supplierId, page = 1, limit = 20 }: { supplierId: number; page?: number; limit?: number }): Promise<PaginatedResponse> => {
    try {
      // Verify supplier exists
      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true }
      });

      if (!supplier) {
        throw NotFoundError('Supplier');
      }

      const skip = (page - 1) * limit;
      
      const [attachments, total] = await Promise.all([
        prisma.attachment.findMany({
          where: { supplierId },
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
              }
            }
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.attachment.count({ where: { supplierId } }),
      ]);

      const totalPages = Math.ceil(total / limit);
      
      return paginatedResponse(attachments, {
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

// Get attachment statistics (MANAGER/ADMIN only)
export const getAttachmentStats = api(
  { method: "GET", path: "/attachments/stats", auth: true },
  async (): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      // Get attachment counts by type
      const fileTypeStats = await prisma.attachment.groupBy({
        by: ['fileType'],
        _count: {
          id: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        }
      });

      // Get total counts
      const [totalAttachments, partAttachments, supplierAttachments] = await Promise.all([
        prisma.attachment.count(),
        prisma.attachment.count({ where: { partId: { not: null } } }),
        prisma.attachment.count({ where: { supplierId: { not: null } } }),
      ]);

      // Get recent attachments (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentAttachments = await prisma.attachment.count({
        where: {
          createdAt: { gte: thirtyDaysAgo }
        }
      });

      const stats = {
        summary: {
          totalAttachments,
          partAttachments,
          supplierAttachments,
          recentAttachments,
        },
        fileTypes: fileTypeStats.map(stat => ({
          fileType: stat.fileType,
          count: stat._count.id,
        })),
      };

      return successResponse(stats);
    } catch (error) {
      throw error;
    }
  }
);

// Create attachment (MANAGER/ADMIN only)
export const createAttachment = api(
  { method: "POST", path: "/attachments", auth: true },
  async (attachmentData: CreateAttachmentData): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      // Validate that either partId or supplierId is provided (but not both)
      if (!attachmentData.partId && !attachmentData.supplierId) {
        throw InvalidArgumentError('Either partId or supplierId must be provided');
      }

      if (attachmentData.partId && attachmentData.supplierId) {
        throw InvalidArgumentError('Cannot specify both partId and supplierId');
      }

      // Verify part exists if partId provided
      if (attachmentData.partId) {
        const part = await prisma.part.findUnique({
          where: { id: attachmentData.partId }
        });
        if (!part) {
          throw NotFoundError('Part');
        }
      }

      // Verify supplier exists if supplierId provided
      if (attachmentData.supplierId) {
        const supplier = await prisma.supplier.findUnique({
          where: { id: attachmentData.supplierId }
        });
        if (!supplier) {
          throw NotFoundError('Supplier');
        }
      }

      const attachment = await prisma.attachment.create({
        data: {
          filename: attachmentData.filename,
          path: attachmentData.path,
          fileType: attachmentData.fileType,
          partId: attachmentData.partId || null,
          supplierId: attachmentData.supplierId || null,
        },
        include: {
          part: {
            select: {
              id: true,
              partNumber: true,
              name: true,
            }
          },
          supplier: {
            select: {
              id: true,
              name: true,
            }
          }
        }
      });

      return successResponse(attachment);
    } catch (error) {
      throw error;
    }
  }
);

// Update attachment (MANAGER/ADMIN only)
export const updateAttachment = api(
  { method: "PUT", path: "/attachments/:id", auth: true },  
  async (params: UpdateAttachmentData & { id: number }): Promise<StandardResponse> => {
    const { id, ...attachmentData } = params;
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const currentAttachment = await prisma.attachment.findUnique({
        where: { id },
      });
      
      if (!currentAttachment) {
        throw NotFoundError('Attachment');
      }

      // Validate that not both partId and supplierId are specified
      if (attachmentData.partId && attachmentData.supplierId) {
        throw InvalidArgumentError('Cannot specify both partId and supplierId');
      }

      // Verify part exists if partId provided
      if (attachmentData.partId) {
        const part = await prisma.part.findUnique({
          where: { id: attachmentData.partId }
        });
        if (!part) {
          throw NotFoundError('Part');
        }
      }

      // Verify supplier exists if supplierId provided
      if (attachmentData.supplierId) {
        const supplier = await prisma.supplier.findUnique({
          where: { id: attachmentData.supplierId }
        });
        if (!supplier) {
          throw NotFoundError('Supplier');
        }
      }

      const updatedAttachment = await prisma.attachment.update({
        where: { id },
        data: {
          filename: attachmentData.filename,
          partId: attachmentData.partId !== undefined ? attachmentData.partId : undefined,
          supplierId: attachmentData.supplierId !== undefined ? attachmentData.supplierId : undefined,
        },
        include: {
          part: {
            select: {
              id: true,
              partNumber: true,
              name: true,
            }
          },
          supplier: {
            select: {
              id: true,
              name: true,
            }
          }
        }
      });

      return successResponse(updatedAttachment);
    } catch (error) {
      throw error;
    }
  }
);

// Download attachment (AUTH required)
export const downloadAttachment = api(
  { method: "GET", path: "/attachments/:id/download", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const attachment = await prisma.attachment.findUnique({
        where: { id },
        select: {
          id: true,
          filename: true,
          path: true,
          fileType: true,
        }
      });

      if (!attachment) {
        throw NotFoundError('Attachment');
      }

      // In a real implementation, you would:
      // 1. Verify the file exists at the path
      // 2. Return appropriate file download response or signed URL
      // 3. Handle different storage backends (local, S3, etc.)
      
      // For now, return the attachment metadata
      const downloadInfo = {
        id: attachment.id,
        filename: attachment.filename,
        path: attachment.path,
        fileType: attachment.fileType,
        downloadUrl: `/files/${attachment.path}`, // This would be the actual download URL
      };

      return successResponse(downloadInfo);
    } catch (error) {
      throw error;
    }
  }
);

// Delete attachment (MANAGER/ADMIN only)
export const deleteAttachment = api(
  { method: "DELETE", path: "/attachments/:id", auth: true },
  async ({ id }: { id: number }): Promise<StandardResponse> => {
    try {
      const userData = requireRole([UserRole.MANAGER, UserRole.ADMIN]);

      const attachment = await prisma.attachment.findUnique({
        where: { id },
      });
      
      if (!attachment) {
        throw NotFoundError('Attachment');
      }

      // In a real implementation, you would also:
      // 1. Delete the actual file from storage
      // 2. Handle cleanup of orphaned files
      
      await prisma.attachment.delete({
        where: { id },
      });

      return successResponse();
    } catch (error) {
      throw error;
    }
  }
);