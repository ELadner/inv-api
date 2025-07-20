// src/routes/parts-routes.ts
import { Router } from 'express';
import { PartsController } from '../controllers/parts-controller';
import { authenticate, authorize } from '../middlewares/auth-middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const partsController = new PartsController();

// Public routes
router.get('/', (req, res) => partsController.getAllParts(req, res));
router.get('/:id', (req, res) => partsController.getPartById(req, res));

// Protected routes - require authentication
router.use(authenticate);

// Routes requiring USER role or above (read-only operations)
router.get('/by-category/:categoryId', (req, res) => partsController.getPartsByCategory(req, res));
router.get('/by-supplier/:supplierId', (req, res) => partsController.getPartsBySupplier(req, res));
router.get('/inventory/low', (req, res) => partsController.getLowInventoryParts(req, res));

// Routes requiring MANAGER role or above (write operations)
router.post(
  '/', 
  authorize([UserRole.MANAGER, UserRole.ADMIN]), 
  (req, res) => partsController.createPart(req, res)
);

router.put(
  '/:id', 
  authorize([UserRole.MANAGER, UserRole.ADMIN]), 
  (req, res) => partsController.updatePart(req, res)
);

router.post(
  '/:id/adjust-quantity', 
  authorize([UserRole.MANAGER, UserRole.ADMIN]), 
  (req, res) => partsController.adjustQuantity(req, res)
);

// Routes requiring ADMIN role (delete operations)
router.delete(
  '/:id', 
  authorize([UserRole.ADMIN]), 
  (req, res) => partsController.deletePart(req, res)
);

export default router;