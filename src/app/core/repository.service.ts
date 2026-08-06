import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface ListOptions { search?: string; searchColumns?: string[]; page?: number; pageSize?: number; orderBy?: string; ascending?: boolean; filters?: Record<string, unknown>; }

@Injectable({ providedIn: 'root' })
export class RepositoryService {
  constructor(private supabase: SupabaseService) {}

  async list<T>(table: string, options: ListOptions = {}): Promise<{ data: T[]; count: number }> {
    const page = options.page ?? 0;
    const pageSize = options.pageSize ?? 25;
    let query = this.supabase.client.from(table).select('*', { count: 'exact' });
    Object.entries(options.filters ?? {}).forEach(([key, value]) => { query = query.eq(key, value); });
    if (options.search && options.searchColumns?.length) {
      query = query.or(options.searchColumns.map((column) => `${column}.ilike.%${options.search}%`).join(','));
    }
    query = query.order(options.orderBy ?? 'created_at', { ascending: options.ascending ?? false }).range(page * pageSize, page * pageSize + pageSize - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    return { data: (data ?? []) as T[], count: count ?? 0 };
  }

  async create<T>(table: string, dto: Partial<T>, auditAction?: string): Promise<T> {
    const { data, error } = await this.supabase.client.from(table).insert(dto as never).select().single();
    if (error) throw error;
    if (auditAction) await this.supabase.audit(auditAction, table, (data as { id?: string }).id, dto as Record<string, unknown>);
    return data as T;
  }

  async update<T>(table: string, id: string | number, dto: Partial<T>, auditAction?: string): Promise<T> {
    const { data, error } = await this.supabase.client.from(table).update(dto as never).eq('id', id).select().single();
    if (error) throw error;
    if (auditAction) await this.supabase.audit(auditAction, table, String(id), dto as Record<string, unknown>);
    return data as T;
  }

  async remove(table: string, id: string, auditAction?: string): Promise<void> {
    const { error } = await this.supabase.client.from(table).delete().eq('id', id);
    if (error) throw error;
    if (auditAction) await this.supabase.audit(auditAction, table, id);
  }
}
