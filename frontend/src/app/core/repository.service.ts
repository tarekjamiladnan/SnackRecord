import { Injectable } from '@angular/core';
import { ApiService } from './api.service';

export interface ListOptions {
  search?: string;
  searchColumns?: string[];
  page?: number;
  pageSize?: number;
  orderBy?: string;
  ascending?: boolean;
  filters?: Record<string, unknown>;
}

export interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class RepositoryService {
  constructor(private api: ApiService) {}

  async list<T>(resource: string, options: ListOptions = {}): Promise<ListResponse<T>> {
    const params: Record<string, unknown> = {
      page: options.page ?? 0,
      pageSize: options.pageSize ?? 25,
      orderBy: options.orderBy ?? 'createdAt',
      ascending: options.ascending ?? false
    };

    if (options.search) params['search'] = options.search;
    if (options.searchColumns?.length) params['searchColumns'] = options.searchColumns.join(',');
    if (options.filters) Object.assign(params, options.filters);

    return this.api.get<ListResponse<T>>(`/${resource}`, params);
  }

  async getById<T>(resource: string, id: string | number): Promise<T> {
    return this.api.get<T>(`/${resource}/${id}`);
  }

  async create<T>(resource: string, dto: Partial<T>): Promise<T> {
    return this.api.post<T>(`/${resource}`, dto as Record<string, unknown>);
  }

  async update<T>(resource: string, id: string | number, dto: Partial<T>): Promise<T> {
    return this.api.put<T>(`/${resource}/${id}`, dto as Record<string, unknown>);
  }

  async remove(resource: string, id: string | number): Promise<void> {
    await this.api.delete<void>(`/${resource}/${id}`);
  }
}
