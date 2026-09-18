import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface ListOptions {
  search?: string;
  searchColumns?: string[];
  page?: number;
  pageSize?: number;
  orderBy?: string;
  ascending?: boolean;
  filters?: Record<string, unknown>;
  select?: string;
}

export interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class RepositoryService {
  constructor(private supabase: SupabaseService) {}

  private tableName(resource: string): string {
    return resource === 'settings' ? 'team_settings' : resource;
  }

  private snake(value: string): string {
    return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  private camelRow<T>(row: unknown): T {
    if (!row || typeof row !== 'object') return row as T;
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value
    ])) as T;
  }

  private snakeDto(dto: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(dto).map(([key, value]) => [this.snake(key), value]));
  }

  async list<T>(resource: string, options: ListOptions = {}): Promise<ListResponse<T>> {
    const page = options.page ?? 0;
    const pageSize = options.pageSize ?? 10;
    const table = this.tableName(resource);
    let query: any = this.supabase.from(table).select(options.select ?? '*', { count: 'exact' });
    for (const [key, value] of Object.entries(options.filters ?? {})) {
      query = query.eq(this.snake(key), value);
    }
    if (options.search && options.searchColumns?.length) {
      query = query.or(options.searchColumns.map((column) => `${this.snake(column)}.ilike.%${options.search}%`).join(','));
    }
    query = query.order(this.snake(options.orderBy ?? 'createdAt'), { ascending: options.ascending ?? false });
    query = query.range(page * pageSize, page * pageSize + pageSize - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    return { data: (data ?? []).map((row: unknown) => this.camelRow<T>(row)), total: count ?? 0, page, pageSize };
  }

  async getById<T>(resource: string, id: string | number): Promise<T> {
    let query: any = this.supabase.from(this.tableName(resource)).select('*');
    if (resource === 'settings') {
      const context = await this.supabase.userContext();
      query = query.eq('team_id', context?.team_id ?? '');
    } else {
      query = query.eq('id', id);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return this.camelRow<T>(data);
  }

  async create<T>(resource: string, dto: Partial<T>): Promise<T> {
    const row = this.snakeDto(dto as Record<string, unknown>);
    if (resource !== 'settings' && !row['team_id']) {
      const context = await this.supabase.userContext();
      if (!context?.team_id) throw new Error('Active team access is required.');
      row['team_id'] = context.team_id;
    }
    if (resource === 'collections' && !row['month_id']) {
      const date = String(row['date'] ?? '');
      const year = Number(date.slice(0, 4));
      const month = Number(date.slice(5, 7));
      const { data: openMonth, error: monthError } = await this.supabase
        .from('months').select('id').eq('year', year).eq('month', month).eq('status', 'open').maybeSingle();
      if (monthError) throw monthError;
      if (!openMonth) throw new Error('Create an open month before saving collections.');
      row['month_id'] = openMonth.id;
    }
    const { data, error } = await this.supabase.from(this.tableName(resource)).insert(row).select().single();
    if (error) throw error;
    return this.camelRow<T>(data);
  }

  async update<T>(resource: string, id: string | number, dto: Partial<T>): Promise<T> {
    let query: any = this.supabase.from(this.tableName(resource)).update(this.snakeDto(dto as Record<string, unknown>));
    if (resource === 'settings') {
      const context = await this.supabase.userContext();
      if (!context?.team_id) throw new Error('Active team access is required.');
      query = query.eq('team_id', context.team_id);
    } else {
      query = query.eq('id', id);
    }
    const { data, error } = await query.select().single();
    if (error) throw error;
    return this.camelRow<T>(data);
  }

  async remove(resource: string, id: string | number): Promise<void> {
    const { error } = await this.supabase.from(this.tableName(resource)).delete().eq('id', id);
    if (error) throw error;
  }
}
