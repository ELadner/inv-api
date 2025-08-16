# Inventory System API - Backend Requirements

## Project Context
This is the backend API for an inventory management system built with Encore.ts, TypeScript, and Prisma ORM with PostgreSQL, serving an Angular 19+ frontend as a separate project. The system manages parts, suppliers, orders, categories, units, and related inventory data.

## Technology Stack
- TypeScript (strict mode)
- Encore.ts (backend development framework)
- Prisma ORM
- PostgreSQL

## API Design with Encore
- Encore's API-first approach enforces RESTful principles:
  - Endpoints defined with `encore.api` decorator
  - Appropriate HTTP methods through Encore's API definitions
  - Resource-based URLs structured by services
  - Standard error responses using Encore's error handling
  - Pagination support through structured parameters
  - Filtering via API parameters
  - Standard JSON format for all data endpoints (following the response format below)
  - RESTful principles following Microsoft's REST API guidelines
  - Plural nouns for collections (e.g., `/parts`, `/suppliers`)

## Code Structure
- Services organized using Encore's service abstraction
- Each service contains:
  - API definitions with input/output types
  - Business logic and validation
  - Database access via Prisma 
- Encore automatically handles routing, API documentation, type checking, and serialization

## API Services
- **Auth Service** (`auth/auth.ts`): User authentication and authorization
- **Parts Service** (`parts/parts.ts`): Parts management and inventory operations
- **Suppliers Service** (`suppliers/suppliers.ts`): Supplier management and relationship tracking
- **Orders Service** (`orders/orders.ts`): Order management with embedded OrderItem operations
- **Common Utilities** (`common/`): Shared errors, responses, config, and database client

## Standard Response Format
All API endpoints return responses in this standardized format:

```typescript
interface StandardResponse<T = any> {
  success: boolean;
  data?: T;
  meta?: any;
  error?: string;
}

// Success response example
{
  "success": true,
  "data": { /* response data */ }
}

// Paginated response example  
{
  "success": true,
  "data": [ /* array of items */ ],
  "meta": {
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 20,
      "totalPages": 5,
      "hasNext": true,
      "hasPrevious": false
    }
  }
}

// Error response example
{
  "success": false,
  "error": "Error message"
}
```

## Authentication & Authorization
- JWT-based authentication with role-based access control
- User roles: `USER`, `MANAGER`, `ADMIN`
- Protected endpoints require appropriate role permissions
- Auth service handles registration, login, and user profile management

## API Endpoints

### Authentication Endpoints
- `POST /register` - User registration
- `POST /login` - User authentication  
- `GET /me` - Current user profile

### Parts Management Endpoints
- `GET /parts` - List parts with filtering/pagination
- `GET /parts/:id` - Get single part with details
- `GET /parts/by-category/:categoryId` - Parts by category (AUTH)
- `GET /parts/by-supplier/:supplierId` - Parts by supplier (AUTH)
- `GET /parts/inventory/low` - Low inventory alerts (AUTH)
- `POST /parts` - Create part (MANAGER/ADMIN)
- `PUT /parts/:id` - Update part (MANAGER/ADMIN)
- `POST /parts/:id/adjust-quantity` - Adjust inventory (MANAGER/ADMIN)
- `DELETE /parts/:id` - Delete part (ADMIN)

### Supplier Management Endpoints
- `GET /suppliers` - List suppliers with filtering/pagination
- `GET /suppliers/:id` - Get single supplier with parts/orders
- `GET /suppliers/by-country/:country` - Suppliers by country (AUTH)
- `GET /suppliers/with-parts-count` - Suppliers with parts/orders count (AUTH)
- `GET /suppliers/:id/stats` - Supplier statistics and analytics (MANAGER/ADMIN)
- `POST /suppliers` - Create supplier (MANAGER/ADMIN)
- `PUT /suppliers/:id` - Update supplier (MANAGER/ADMIN)
- `DELETE /suppliers/:id` - Delete supplier (ADMIN)

### Order Management Endpoints
- `GET /orders` - List orders with filtering/pagination (AUTH)
- `GET /orders/:id` - Get single order with full details (AUTH)
- `GET /orders/by-supplier/:supplierId` - Orders by supplier (AUTH)
- `GET /orders/by-status/:status` - Orders by status (AUTH)
- `GET /orders/:id/total` - Calculate order totals (AUTH)
- `POST /orders` - Create order with optional initial items (MANAGER/ADMIN)
- `PUT /orders/:id` - Update order details (MANAGER/ADMIN)
- `PUT /orders/:id/status` - Update order status with validation (MANAGER/ADMIN)
- `DELETE /orders/:id` - Delete order (ADMIN, restricted by status)

### Order Items Sub-Resource Endpoints
- `GET /orders/:id/items` - Get all items for an order (AUTH)
- `POST /orders/:id/items` - Add item to order (MANAGER/ADMIN)
- `PUT /orders/:id/items/:itemId` - Update order item (MANAGER/ADMIN)
- `DELETE /orders/:id/items/:itemId` - Remove item from order (MANAGER/ADMIN)
- `PUT /orders/:id/items/bulk` - Bulk update order items (MANAGER/ADMIN)

