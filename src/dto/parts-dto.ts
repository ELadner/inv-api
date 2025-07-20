// src/interfaces/part-dto.ts
import { Decimal } from '@prisma/client/runtime/library';

export interface CreatePartDto {
  partNumber: string;
  name: string;
  description?: string;
  quantity?: number;
  minQuantity?: number;
  location?: string;
  price?: number | string;
  categoryId: number;
  supplierId: number;
  unitId: number;
  manufacturerId?: number;
}

export interface UpdatePartDto {
  partNumber?: string;
  name?: string;
  description?: string;
  quantity?: number;
  minQuantity?: number;
  location?: string;
  price?: number | string;
  categoryId?: number;
  supplierId?: number;
  unitId?: number;
  manufacturerId?: number;
  reason?: string; // For inventory adjustments
}

export interface PartFilterDto {
  search?: string;
  categoryId?: number;
  supplierId?: number;
  manufacturerId?: number;
  minQuantity?: number;
  maxQuantity?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface InventoryAdjustmentDto {
  quantity: number;
  type: 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT';
  reason?: string;
}

export interface PartResponseDto {
  id: number;
  partNumber: string;
  name: string;
  description?: string;
  quantity: number;
  minQuantity: number;
  location?: string;
  price?: Decimal;
  categoryId: number;
  supplierId: number;
  unitId: number;
  manufacturerId?: number;
  createdAt: Date;
  updatedAt: Date;
  category: {
    id: number;
    name: string;
  };
  supplier: {
    id: number;
    name: string;
  };
  unit: {
    id: number;
    name: string;
  };
  manufacturer?: {
    id: number;
    name: string;
  };
}

export interface PaginatedResponseDto<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext?: boolean;
    hasPrevious?: boolean;
  };
}