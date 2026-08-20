import { Component, computed, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { ApiService } from '../../core/api.service';
import { AdminTeam, TeamStatus } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import { UI_IMPORTS } from '../../shared/ui';

@Component({
  selector: 'app-teams',
  imports: UI_IMPORTS,
  templateUrl: './teams.component.html',
  styleUrl: '../../shared/page.scss'
})
export class TeamsComponent {
  teams = signal<AdminTeam[]>([]);
  loading = signal(false);
  busyId = signal<string | null>(null);
  filter = signal('');
  filteredTeams = computed(() => {
    const term = this.filter().toLowerCase().trim();
    if (!term) return this.teams();
    return this.teams().filter(
      (t) => t.name.toLowerCase().includes(term) || t.slug.toLowerCase().includes(term)
    );
  });

  constructor(private api: ApiService, private message: MessageService, private dialog: DialogService) {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await this.api.get<{ teams: AdminTeam[] }>('/super-admin/teams');
      this.teams.set(response.teams ?? []);
    } catch (err) {
      this.message.add({
        severity: 'error',
        summary: 'Failed to load teams',
        detail: err instanceof Error ? err.message : 'Please try again.'
      });
    } finally {
      this.loading.set(false);
    }
  }

  adminOf(team: AdminTeam): { name: string; email: string } | null {
    const admin = team.users?.find((u) => u.role === 'TEAM_ADMIN');
    if (admin) return { name: admin.name, email: admin.email };
    const first = team.users?.[0];
    return first ? { name: first.name, email: first.email } : null;
  }

  statusLabel(status: TeamStatus): string {
    switch (status) {
      case 'PENDING': return 'Pending Approval';
      case 'ACTIVE': return 'Active';
      case 'SUSPENDED': return 'Suspended';
      case 'REJECTED': return 'Rejected';
    }
  }

  memberCount(team: AdminTeam): number {
    return team._count?.users ?? team.users?.length ?? 0;
  }

  private async setStatus(team: AdminTeam, status: TeamStatus, successMessage: string): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(team.id);
    try {
      await this.api.patch<{ team: AdminTeam }>(`/super-admin/teams/${team.id}/status`, { status });
      this.message.add({ severity: 'success', summary: 'Team updated', detail: successMessage });
      await this.load();
    } catch (err) {
      this.message.add({
        severity: 'error',
        summary: 'Update failed',
        detail: err instanceof Error ? err.message : 'Please try again.'
      });
    } finally {
      this.busyId.set(null);
    }
  }

  approve(team: AdminTeam): void {
    void this.setStatus(team, 'ACTIVE', `${team.name} has been approved. The admin can now sign in.`);
  }

  reject(team: AdminTeam): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      header: 'Reject Request',
      width: '460px',
      data: {
        title: 'Reject Registration Request',
        message: `Rejecting "${team.name}" will decline the registration. The team admin will no longer be able to sign in.`,
        action: 'Reject'
      }
    });
    ref?.onClose.subscribe((ok) => {
      if (ok) void this.setStatus(team, 'REJECTED', `${team.name}'s registration request has been rejected.`);
    });
  }

  suspend(team: AdminTeam): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      header: 'Suspend Team',
      width: '460px',
      data: {
        title: 'Suspend Team',
        message: `Suspending "${team.name}" will block all its members from signing in until it is re-activated.`,
        action: 'Suspend'
      }
    });
    ref?.onClose.subscribe((ok) => {
      if (ok) void this.setStatus(team, 'SUSPENDED', `${team.name} has been suspended.`);
    });
  }

  reactivate(team: AdminTeam): void {
    void this.setStatus(team, 'ACTIVE', `${team.name} has been re-activated.`);
  }

  deleteTeam(team: AdminTeam): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      header: 'Delete Team',
      width: '460px',
      data: {
        title: 'Delete Team',
        message: `Deleting "${team.name}" permanently removes the team and all of its records. This cannot be undone.`,
        action: 'Delete',
        requireText: 'DELETE'
      }
    });
    ref?.onClose.subscribe(async (ok) => {
      if (!ok || this.busyId()) return;
      this.busyId.set(team.id);
      try {
        await this.api.delete<void>(`/super-admin/teams/${team.id}`);
        this.message.add({ severity: 'success', summary: 'Team deleted', detail: `${team.name} was deleted.` });
        await this.load();
      } catch (err) {
        this.message.add({
          severity: 'error',
          summary: 'Delete failed',
          detail: err instanceof Error ? err.message : 'Please try again.'
        });
      } finally {
        this.busyId.set(null);
      }
    });
  }

  statusSeverity(status: TeamStatus): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
    switch (status) {
      case 'ACTIVE': return 'success';
      case 'PENDING': return 'warn';
      case 'SUSPENDED': return 'danger';
      case 'REJECTED': return 'secondary';
    }
  }

  initials(name?: string): string {
    return (name ?? '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
