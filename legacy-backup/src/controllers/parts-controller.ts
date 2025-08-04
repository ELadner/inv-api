// src/controllers/parts-controller.ts
import { Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { AppError } from '../middlewares/auth-middleware';

const prisma = new PrismaClient();

export class PartsController {
  /**
   * Get all parts with optional filtering and pagination
   */
  async getAllParts(req: Request, res: Response): Promise<void> {
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
      } = req.query;

      // Build where conditions
      const where: Prisma.PartWhereInput = {};
      
      // Add search filter
      if (search) {
        where.OR = [
          { name: { contains: String(search), mode: 'insensitive' } },
          { partNumber: { contains: String(search), mode: 'insensitive' } },
          { description: { contains: String(search), mode: 'insensitive' } },
        ];
      }

      // Add other filters...

      // Calculate pagination
      const skip = (Number(page) - 1) * Number(limit);
      
      // Build sort options in a type-safe way
      let orderBy: Prisma.PartOrderByWithRelationInput = { name: 'asc' }; // Default ordering
      
      // Handle sorting based on valid field names
      const sortField = String(sortBy);
      const sortOrder = order === 'desc' ? 'desc' : 'asc';
      
      // Use switch/case for type safety instead of dynamic property assignment
      switch (sortField) {
        case 'name':
          orderBy = { name: sortOrder };
          break;
        case 'partNumber':
          orderBy = { partNumber: sortOrder };
          break;
        case 'quantity':
          orderBy = { quantity: sortOrder };
          break;
        case 'price':
          orderBy = { price: sortOrder };
          break;
        case 'createdAt':
          orderBy = { createdAt: sortOrder };
          break;
        case 'updatedAt':
          orderBy = { updatedAt: sortOrder };
          break;
        case 'category':
          orderBy = { category: { name: sortOrder } };
          break;
        case 'supplier':
          orderBy = { supplier: { name: sortOrder } };
          break;
        default:
          orderBy = { name: 'asc' }; // Default to name ascending
          break;
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
          take: Number(limit),
        }),
        prisma.part.count({ where }),
      ]);



      // Calculate pagination metadata
      const totalPages = Math.ceil(total / Number(limit));
      const hasNext = Number(page) < totalPages;
      const hasPrevious = Number(page) > 1;

      res.status(200).json({
        data: parts,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages,
          hasNext,
          hasPrevious,
        },
      });
    } catch (error) {
      console.error('Error getting parts:', error);
      res.status(500).json({ message: 'Failed to retrieve parts' });
    }
  }

  /**
   * Get a single part by ID
   */
  async getPartById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      const part = await prisma.part.findUnique({
        where: { id: Number(id) },
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
        res.status(404).json({ message: 'Part not found' });
        return;
      }

      res.status(200).json(part);
    } catch (error) {
      console.error('Error getting part:', error);
      res.status(500).json({ message: 'Failed to retrieve part' });
    }
  }

  /**
   * Get parts by category
   */
  async getPartsByCategory(req: Request, res: Response): Promise<void> {
    try {
      const { categoryId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      // Calculate pagination
      const skip = (Number(page) - 1) * Number(limit);
      
      const [parts, total] = await Promise.all([
        prisma.part.findMany({
          where: { categoryId: Number(categoryId) },
          include: {
            category: true,
            supplier: true,
            unit: true,
          },
          skip,
          take: Number(limit),
          orderBy: { name: 'asc' },
        }),
        prisma.part.count({
          where: { categoryId: Number(categoryId) },
        }),
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(total / Number(limit));
      
      res.status(200).json({
        data: parts,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages,
        },
      });
    } catch (error) {
      console.error('Error getting parts by category:', error);
      res.status(500).json({ message: 'Failed to retrieve parts by category' });
    }
  }

  /**
   * Get parts by supplier
   */
  async getPartsBySupplier(req: Request, res: Response): Promise<void> {
    try {
      const { supplierId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      // Calculate pagination
      const skip = (Number(page) - 1) * Number(limit);
      
      const [parts, total] = await Promise.all([
        prisma.part.findMany({
          where: { supplierId: Number(supplierId) },
          include: {
            category: true,
            supplier: true,
            unit: true,
          },
          skip,
          take: Number(limit),
          orderBy: { name: 'asc' },
        }),
        prisma.part.count({
          where: { supplierId: Number(supplierId) },
        }),
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(total / Number(limit));
      
      res.status(200).json({
        data: parts,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages,
        },
      });
    } catch (error) {
      console.error('Error getting parts by supplier:', error);
      res.status(500).json({ message: 'Failed to retrieve parts by supplier' });
    }
  }

  /**
   * Create a new part
   */
  async createPart(req: Request, res: Response): Promise<void> {
    try {
      const partData = req.body;
      
      // Extract the user ID from the authenticated request
      const userId = req.user?.id;

      // Create transaction to handle both part creation and inventory transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the part
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

        // Create an inventory transaction if initial quantity > 0
        if (partData.quantity && partData.quantity > 0) {
          await tx.inventoryTransaction.create({
            data: {
              partId: part.id,
              quantity: partData.quantity,
              type: 'STOCK_IN',
              reason: 'Initial inventory',
              userId: userId || null,
            },
          });
        }

        return part;
      });

      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating part:', error);
      
      // Handle unique constraint errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          res.status(409).json({ message: 'A part with this part number already exists' });
          return;
        }
      }
      
      res.status(500).json({ message: 'Failed to create part' });
    }
  }

  /**
   * Update an existing part
   */
  async updatePart(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const partData = req.body;
      const userId = req.user?.id;
      
      // Get current part data for comparison
      const currentPart = await prisma.part.findUnique({
        where: { id: Number(id) },
      });
      
      if (!currentPart) {
        res.status(404).json({ message: 'Part not found' });
        return;
      }

      // Check for quantity change
      const quantityChange = partData.quantity !== undefined 
        ? partData.quantity - currentPart.quantity 
        : 0;

      // Process update in a transaction if quantity is changing
      const result = await prisma.$transaction(async (tx) => {
        // Update the part
        const updatedPart = await tx.part.update({
          where: { id: Number(id) },
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

        // Create inventory transaction if quantity changed
        if (quantityChange !== 0) {
          await tx.inventoryTransaction.create({
            data: {
              partId: Number(id),
              quantity: Math.abs(quantityChange),
              type: quantityChange > 0 ? 'STOCK_IN' : 'STOCK_OUT',
              reason: partData.reason || 'Manual adjustment',
              userId: userId || null,
            },
          });
        }

        return updatedPart;
      });

      res.status(200).json(result);
    } catch (error) {
      console.error('Error updating part:', error);
      
      // Handle unique constraint errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          res.status(409).json({ message: 'A part with this part number already exists' });
          return;
        }
      }
      
      res.status(500).json({ message: 'Failed to update part' });
    }
  }

  /**
   * Delete a part
   */
  async deletePart(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Check if part exists
      const part = await prisma.part.findUnique({
        where: { id: Number(id) },
        include: {
          orderItems: true,
          inventoryTransactions: true,
          attachments: true,
        },
      });
      
      if (!part) {
        res.status(404).json({ message: 'Part not found' });
        return;
      }

      // Check for related order items
      if (part.orderItems.length > 0) {
        res.status(409).json({ 
          message: 'Cannot delete part that is referenced in orders',
          orderCount: part.orderItems.length
        });
        return;
      }

      // Delete in a transaction to clean up related records
      await prisma.$transaction(async (tx) => {
        // Delete related inventory transactions
        await tx.inventoryTransaction.deleteMany({
          where: { partId: Number(id) },
        });
        
        // Delete related attachments
        await tx.attachment.deleteMany({
          where: { partId: Number(id) },
        });
        
        // Delete the part
        await tx.part.delete({
          where: { id: Number(id) },
        });
      });

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting part:', error);
      res.status(500).json({ message: 'Failed to delete part' });
    }
  }

  /**
   * Adjust part quantity
   */
  async adjustQuantity(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { quantity, reason, type } = req.body;
      const userId = req.user?.id;
      
      if (!type || !['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT'].includes(type)) {
        res.status(400).json({ message: 'Valid transaction type is required' });
        return;
      }
      
      if (typeof quantity !== 'number' || quantity <= 0) {
        res.status(400).json({ message: 'Valid positive quantity is required' });
        return;
      }

      // Process in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Get current part
        const part = await tx.part.findUnique({
          where: { id: Number(id) },
        });
        
        if (!part) {
          throw new AppError('Part not found', 404);
        }

        // Calculate new quantity
        let newQuantity = part.quantity;
        if (type === 'STOCK_IN') {
          newQuantity += quantity;
        } else if (type === 'STOCK_OUT') {
          newQuantity -= quantity;
          if (newQuantity < 0) {
            throw new AppError('Insufficient quantity available', 400);
          }
        } else if (type === 'ADJUSTMENT') {
          newQuantity = quantity; // Direct set
        }

        // Create transaction record
        const transaction = await tx.inventoryTransaction.create({
          data: {
            partId: Number(id),
            quantity,
            type: type as any, // The type checking is done above
            reason: reason || `Quantity ${type.toLowerCase()}`,
            userId: userId || null,
          },
        });

        // Update part quantity
        const updatedPart = await tx.part.update({
          where: { id: Number(id) },
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

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ message: error.message });
      } else {
        console.error('Error adjusting quantity:', error);
        res.status(500).json({ message: 'Failed to adjust quantity' });
      }
    }
  }

  /**
   * Get parts with low inventory (below min quantity)
   */
  async getLowInventoryParts(req: Request, res: Response): Promise<void> {
    try {
      // First, get all parts to perform comparison in memory
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
  
      // Filter parts where quantity < minQuantity
      const lowInventoryParts = allParts.filter(part => part.quantity < part.minQuantity);
  
      res.status(200).json(lowInventoryParts);
    } catch (error) {
      console.error('Error getting low inventory parts:', error);
      res.status(500).json({ message: 'Failed to retrieve low inventory parts' });
    }
  }
}