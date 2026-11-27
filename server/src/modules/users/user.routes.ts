import { Router } from 'express';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import {
  authenticateTenantUser,
  requireFeature,
  requirePermission,
} from '../../middleware/auth.js';
import {
  adminResetPasswordController,
  createRoleController,
  createUserController,
  getUserActivityController,
  getUserController,
  listPermissionsController,
  listRolesController,
  listUsersController,
  updateRoleController,
  updateUserController,
  updateUserStatusController,
} from './user.controller.js';

const userRouter = Router();
userRouter.use(authenticateTenantUser);
userRouter.use(requireFeature(FEATURE_KEYS.USER_MANAGEMENT));

userRouter.get('/', requirePermission(PERMISSION_CODES.USER_VIEW), asyncHandler(listUsersController));
userRouter.get('/:userId', requirePermission(PERMISSION_CODES.USER_VIEW), asyncHandler(getUserController));
userRouter.get('/:userId/activity', requirePermission(PERMISSION_CODES.USER_VIEW), asyncHandler(getUserActivityController));
userRouter.post('/', requirePermission(PERMISSION_CODES.USER_MANAGE), asyncHandler(createUserController));
userRouter.patch('/:userId', requirePermission(PERMISSION_CODES.USER_MANAGE), asyncHandler(updateUserController));
userRouter.patch('/:userId/status', requirePermission(PERMISSION_CODES.USER_MANAGE), asyncHandler(updateUserStatusController));
userRouter.post('/:userId/reset-password', requirePermission(PERMISSION_CODES.USER_MANAGE), asyncHandler(adminResetPasswordController));

const roleRouter = Router();
roleRouter.use(authenticateTenantUser);
roleRouter.use(requireFeature(FEATURE_KEYS.USER_MANAGEMENT));

roleRouter.get('/', requirePermission(PERMISSION_CODES.USER_VIEW), asyncHandler(listRolesController));
roleRouter.post('/', requirePermission(PERMISSION_CODES.USER_MANAGE), asyncHandler(createRoleController));
roleRouter.patch('/:roleId', requirePermission(PERMISSION_CODES.USER_MANAGE), asyncHandler(updateRoleController));

const permissionRouter = Router();
permissionRouter.use(authenticateTenantUser);
permissionRouter.use(requireFeature(FEATURE_KEYS.USER_MANAGEMENT));
permissionRouter.get('/', requirePermission(PERMISSION_CODES.USER_VIEW), asyncHandler(listPermissionsController));

export { userRouter, roleRouter, permissionRouter };
