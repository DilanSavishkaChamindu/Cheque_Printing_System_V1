import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  Building2,
  Landmark,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  Shield,
  X,
} from 'lucide-react';
import { FEATURE_KEYS } from '@cheque-saas/shared';
import {
  TENANT_NAVIGATION_ITEMS,
  filterNavigationItems,
} from '../config/navigation';
import { clientEnv } from '../config/env';
import { ConnectivityIndicator } from '../components/ConnectivityIndicator';
import { Badge } from '../components/ui/Badge';
import { authService } from '../services/authService';
import { authStore, useAuthStore } from '../stores/authStore';

export function AppLayout() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { tenantUser, activeCompanyId } = useAuthStore();

  const navItems = filterNavigationItems(TENANT_NAVIGATION_ITEMS, {
    tenantStatus: tenantUser?.tenant.status ?? null,
    enabledFeatures: tenantUser?.tenant.enabledFeatures ?? [],
    userPermissions: tenantUser?.permissions ?? [],
    isClientAdmin: tenantUser?.isClientAdmin ?? false,
  });

  const companiesFeatureEnabled =
    tenantUser?.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES) ?? false;

  const handleLogout = async () => {
    try {
      await authService.logoutTenant();
    } catch {
      // Clear local session regardless of network reachability
    } finally {
      await authStore.clearSession();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="flex bg-slate-50 min-h-screen text-slate-900">
      {mobileMenuOpen && (
        <div
          className="lg:hidden z-30 fixed inset-0 bg-slate-900/50 no-print"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 flex w-68 flex-col border-r border-slate-200 bg-slate-950 text-slate-100 transition-transform duration-200 lg:static lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex justify-between items-center px-5 border-slate-800 border-b h-16">
          <div className="flex items-center gap-2.5">
            <div className="flex justify-center items-center bg-emerald-500/15 rounded-lg ring-1 ring-emerald-500/30 w-9 h-9 text-emerald-400">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm tracking-tight">
                {clientEnv.appName}
              </p>
              <p className="text-[11px] text-slate-400">
                {tenantUser ? tenantUser.tenant.tenantCode : 'Multi-Tenant SaaS'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="lg:hidden hover:bg-slate-800 p-1 rounded-md text-slate-400 hover:text-white"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 px-3 py-5 overflow-y-auto" aria-label="Primary">
          <div>
            <p className="px-3 font-semibold text-[11px] text-slate-400 uppercase tracking-wider">
              Workspace
            </p>
            <ul className="space-y-1 mt-2">
              {navItems.map((item) => (
                <li key={item.id}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      }`
                    }
                  >
                    <span className="flex items-center gap-2.5">
                      <Activity className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          {tenantUser && (
            <div>
              <p className="px-3 font-semibold text-[11px] text-slate-400 uppercase tracking-wider">
                Account
              </p>
              <ul className="space-y-1 mt-2">
                {tenantUser.isClientAdmin && (
                  <li>
                    <NavLink
                      to="/settings/organization"
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive
                          ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                          : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                        }`
                      }
                    >
                      <Settings className="w-4 h-4" />
                      <span>Organization Settings</span>
                    </NavLink>
                  </li>
                )}
                <li>
                  <NavLink
                    to="/sync"
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      }`
                    }
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Offline &amp; Sync Center</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/settings/security"
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      }`
                    }
                  >
                    <Shield className="w-4 h-4" />
                    <span>Security & Password</span>
                  </NavLink>
                </li>
              </ul>
            </div>
          )}
        </nav>

        <div className="p-4 border-slate-800 border-t text-slate-400 text-xs">
          {tenantUser ? (
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex justify-between items-center hover:bg-slate-900 px-2.5 py-2 rounded-lg w-full text-slate-300 hover:text-white"
            >
              <span>Sign Out</span>
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <Link
              to="/login"
              className="block bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg font-medium text-white text-center"
            >
              Sign In
            </Link>
          )}
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        <header className="top-0 z-20 sticky flex justify-between items-center gap-4 bg-white/95 backdrop-blur-xs px-4 sm:px-6 border-slate-200 border-b h-16 no-print">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              className="lg:hidden hover:bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-600"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {tenantUser ? (
              <>
                <Badge variant="info">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{tenantUser.tenant.organizationName}</span>
                </Badge>

                {companiesFeatureEnabled && tenantUser.companies.length > 0 && (
                  <select
                    aria-label="Active Company"
                    value={activeCompanyId ?? tenantUser.tenant.defaultCompanyId ?? ''}
                    onChange={(e) => authStore.setActiveCompanyId(e.target.value)}
                    className="bg-white px-2.5 py-1 border border-slate-300 focus:border-slate-900 rounded-lg focus:outline-none font-medium text-slate-700 text-xs"
                  >
                    {tenantUser.companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.companyName} ({company.companyCode})
                      </option>
                    ))}
                  </select>
                )}
              </>
            ) : (
              <Badge variant="neutral">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span>System Status Probe</span>
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <ConnectivityIndicator />
            </div>

            {tenantUser && (
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-lg text-xs">
                <span className="font-medium text-slate-900">
                  {tenantUser.firstName} {tenantUser.lastName}
                </span>
                <span className="hidden md:inline bg-slate-200 px-1.5 py-0.5 rounded font-semibold text-[10px] text-slate-700">
                  {tenantUser.isClientAdmin ? 'CLIENT ADMIN' : 'USER'}
                </span>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <div className="sm:hidden mb-4 no-print">
            <ConnectivityIndicator />
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
