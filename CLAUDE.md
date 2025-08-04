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

