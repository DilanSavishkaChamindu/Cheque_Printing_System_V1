import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import type { FeatureKey, PermissionCode } from '@cheque-saas/shared';
import { authService } from '../services/authService';
import { authStore, useAuthStore } from '../stores/authStore';
import { EmptyState } from '../components/ui/EmptyState';

export function TenantProtectedRoute() {
  const auth = useAuthStore();
  const [hydrating, setHydrating] = useState(
    Boolean(auth.actorType === 'TENANT_USER' && auth.accessToken)
  );

  useEffect(() => {
    let active = true;
    if (auth.actorType === 'TENANT_USER' && auth.accessToken) {
      authService
        .fetchTenantMe()
        .then((user) => {
          if (active) {
            authStore.updateTenantUser(user);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) {
            setHydrating(false);
          }
        });
    } else {
      setHydrating(false);
    }
    return () => {
      active = false;
    };
  }, [auth.actorType, auth.accessToken]);

  if (auth.actorType !== 'TENANT_USER' || !auth.accessToken || !auth.tenantUser) {
    return <Navigate to="/login" replace />;
  }

  if (hydrating && !auth.tenantUser) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Verifying session...
      </div>
    );
  }

  return <Outlet />;
}

export function PlatformProtectedRoute() {
  const auth = useAuthStore();
  const [hydrating, setHydrating] = useState(
    Boolean(auth.actorType === 'PLATFORM_ADMIN' && auth.accessToken)
  );

  useEffect(() => {
    let active = true;
    if (auth.actorType === 'PLATFORM_ADMIN' && auth.accessToken) {
      authService
        .fetchPlatformMe()
        .then((admin) => {
          if (active) {
            authStore.updatePlatformAdmin(admin);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) {
            setHydrating(false);
          }
        });
    } else {
      setHydrating(false);
    }
    return () => {
      active = false;
    };
  }, [auth.actorType, auth.accessToken]);

  if (auth.actorType !== 'PLATFORM_ADMIN' || !auth.accessToken || !auth.platformAdmin) {
    return <Navigate to="/platform/login" replace />;
  }

  if (hydrating && !auth.platformAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Verifying platform session...
      </div>
    );
  }

  return <Outlet />;
}

export function FeatureRouteGuard({
  featureKey,
  requiredPermission,
  requireAdmin = false,
  children,
}: {
  featureKey?: FeatureKey;
  requiredPermission?: PermissionCode;
  requireAdmin?: boolean;
  children: ReactNode;
}) {
  const { tenantUser } = useAuthStore();

  if (!tenantUser) {
    return <Navigate to="/login" replace />;
  }

  if (featureKey && !tenantUser.tenant.enabledFeatures.includes(featureKey)) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5 text-rose-600" />}
          title="Feature Disabled (403)"
          description={`The '${featureKey}' module is currently disabled for ${tenantUser.tenant.organizationName}. Contact your Platform Administrator to enable this entitlement.`}
        />
      </div>
    );
  }

  if (requireAdmin && !tenantUser.isClientAdmin) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5 text-rose-600" />}
          title="Client Administrator Access Required (403)"
          description="Only an organization Client Administrator can access this page."
        />
      </div>
    );
  }

  if (
    requiredPermission &&
    !tenantUser.isClientAdmin &&
    !tenantUser.permissions.includes(requiredPermission)
  ) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5 text-rose-600" />}
          title="Insufficient Permissions (403)"
          description={`Your account does not hold the '${requiredPermission}' permission required for this module.`}
        />
      </div>
    );
  }

  return <>{children}</>;
}
