import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Building,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Sliders,
  X,
} from 'lucide-react';
import { authService } from '../services/authService';
import { authStore, useAuthStore } from '../stores/authStore';

const PLATFORM_LINKS = [
  { to: '/platform', label: 'Platform Overview', icon: LayoutDashboard, end: true },
  { to: '/platform/tenants', label: 'Client Organizations', icon: Building, end: false },
  { to: '/platform/features', label: 'Global Feature Catalog', icon: Sliders, end: false },
  { to: '/platform/audit-logs', label: 'Platform Audit Logs', icon: ClipboardList, end: false },
];

export function PlatformLayout() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { platformAdmin } = useAuthStore();

  const handleLogout = async () => {
    try {
      await authService.logoutPlatform();
    } catch {
      // Clear local tokens even if server unreachable
    } finally {
      await authStore.clearSession();
      navigate('/platform/login', { replace: true });
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-68 flex-col bg-slate-950 text-slate-100 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Platform Admin</p>
              <p className="text-[11px] text-slate-400">SaaS Control Plane</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-800 lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5">
          {PLATFORM_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-900 hover:text-white"
          >
            <span>Sign Out</span>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              Platform Owner Workspace
            </span>
          </div>
          {platformAdmin && (
            <div className="text-xs font-medium text-slate-700">
              {platformAdmin.firstName} {platformAdmin.lastName} ({platformAdmin.email})
            </div>
          )}
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
