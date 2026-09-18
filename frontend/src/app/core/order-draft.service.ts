import { Injectable, computed, signal } from '@angular/core';

export interface DraftItem {
  name: string;
  qty: number;
}

@Injectable({ providedIn: 'root' })
export class OrderDraftService {
  readonly items = signal<DraftItem[]>([]);

  readonly totalUnits = computed(() => this.items().reduce((sum, item) => sum + item.qty, 0));
  readonly totalKinds = computed(() => this.items().length);
  readonly hasItems = computed(() => this.totalKinds() > 0);

  qty(name: string): number {
    return this.items().find((item) => item.name === name)?.qty ?? 0;
  }

  add(name: string): void {
    this.items.update((list) => {
      const index = list.findIndex((item) => item.name === name);
      if (index >= 0) {
        const copy = [...list];
        copy[index] = { ...copy[index], qty: copy[index].qty + 1 };
        return copy;
      }
      return [...list, { name, qty: 1 }];
    });
  }

  minus(name: string): void {
    this.items.update((list) => {
      const index = list.findIndex((item) => item.name === name);
      if (index < 0) return list;
      if (list[index].qty <= 1) return list.filter((item) => item.name !== name);
      const copy = [...list];
      copy[index] = { ...copy[index], qty: copy[index].qty - 1 };
      return copy;
    });
  }

  remove(name: string): void {
    this.items.update((list) => list.filter((item) => item.name !== name));
  }

  clear(): void {
    this.items.set([]);
  }

  compose(): string {
    return this.items().map((item) => renderDraftItem(item.name, item.qty)).join(', ');
  }
}

export function renderDraftItem(name: string, qty: number): string {
  if (qty <= 1) return name;
  return `${qty} ${pluralize(name)}`;
}

function pluralize(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return name;
  if (/^\d/.test(trimmed)) return trimmed;
  if (/(?:s|x|z|ch|sh)$/i.test(trimmed)) return trimmed;
  return `${trimmed}s`;
}