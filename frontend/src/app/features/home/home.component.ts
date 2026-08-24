import { AfterViewInit, Component, ElementRef, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeService } from '../../core/theme.service';
import {
  LucideArrowDownToLine,
  LucideArrowRight,
  LucideArrowUpFromLine,
  LucideBadgeCheck,
  LucideCalendarCheck,
  LucideChartColumn,
  LucideCheck,
  LucideClipboardList,
  LucideClock,
  LucideCoffee,
  LucideEye,
  LucideFileCheck,
  LucideFileSpreadsheet,
  LucideFileText,
  LucideHandCoins,
  LucideLayoutGrid,
  LucideLeaf,
  LucideListChecks,
  LucideLogIn,
  LucideMenu,
  LucideMoon,
  LucidePiggyBank,
  LucidePlus,
  LucideRefreshCw,
  LucideSend,
  LucideSettings,
  LucideShield,
  LucideShieldCheck,
  LucideSparkles,
  LucideSun,
  LucideTrendingUp,
  LucideUserRound,
  LucideUsers,
  LucideUtensilsCrossed,
  LucideWallet,
  LucideX,
  LucideZap
} from '@lucide/angular';

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    LucideArrowDownToLine,
    LucideArrowRight,
    LucideArrowUpFromLine,
    LucideBadgeCheck,
    LucideCalendarCheck,
    LucideChartColumn,
    LucideCheck,
    LucideClipboardList,
    LucideClock,
    LucideCoffee,
    LucideEye,
    LucideFileCheck,
    LucideFileSpreadsheet,
    LucideFileText,
    LucideHandCoins,
    LucideLayoutGrid,
    LucideLeaf,
    LucideListChecks,
    LucideLogIn,
    LucideMenu,
    LucideMoon,
    LucidePiggyBank,
    LucidePlus,
    LucideRefreshCw,
    LucideSend,
    LucideSettings,
    LucideShield,
    LucideShieldCheck,
    LucideSparkles,
    LucideSun,
    LucideTrendingUp,
    LucideUserRound,
    LucideUsers,
    LucideUtensilsCrossed,
    LucideWallet,
    LucideX,
    LucideZap
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements AfterViewInit, OnDestroy {
  mobileNav = signal(false);

  private observer?: IntersectionObserver;

  constructor(private el: ElementRef, public theme: ThemeService) {}

  ngAfterViewInit(): void {
    const targets = Array.from(this.el.nativeElement.querySelectorAll('[data-reveal]')) as HTMLElement[];
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          target.classList.add('in');
          target.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => this.animateCount(el));
          this.observer?.unobserve(target);
        }
      },
      { threshold: 0.12 }
    );
    targets.forEach((target) => this.observer?.observe(target));
  }

  closeMenu(): void {
    this.mobileNav.set(false);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private animateCount(el: HTMLElement): void {
    if (el.dataset['counted']) return;
    el.dataset['counted'] = 'true';
    const target = Number(el.dataset['count'] || '0');
    const duration = 900;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased).toLocaleString('en-US');
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}