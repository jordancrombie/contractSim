import { Router } from 'express';
import { contractController } from '../controllers/contractController';
import { serviceAuth, requireUserContext, allowServices } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';

const router = Router();

// All routes require service authentication
router.use(serviceAuth);

/**
 * POST /api/v1/contracts
 * Create a new contract
 * Auth: WSIM proxy with user context
 */
router.post(
  '/',
  requireUserContext,
  idempotency,
  (req, res, next) => contractController.createContract(req, res, next)
);

/**
 * GET /api/v1/contracts
 * List contracts for authenticated user
 * Auth: WSIM proxy with user context
 */
router.get(
  '/',
  requireUserContext,
  (req, res, next) => contractController.listContracts(req, res, next)
);

/**
 * GET /api/v1/contracts/:id
 * Get contract details
 * Auth: WSIM proxy with user context
 */
router.get(
  '/:id',
  requireUserContext,
  (req, res, next) => contractController.getContract(req, res, next)
);

/**
 * POST /api/v1/contracts/:id/accept
 * Accept a contract
 * Auth: WSIM proxy with user context
 */
router.post(
  '/:id/accept',
  requireUserContext,
  (req, res, next) => contractController.acceptContract(req, res, next)
);

/**
 * POST /api/v1/contracts/:id/fund
 * Initiate funding by calling BSIM escrow API
 * Auth: WSIM proxy with user context
 *
 * Request body:
 * - account_id: The BSIM account to escrow from
 * - bsim_user_id: The user's ID in BSIM (from WSIM enrollment)
 *
 * The actual funding is recorded when BSIM sends the escrow.held webhook.
 */
router.post(
  '/:id/fund',
  requireUserContext,
  (req, res, next) => contractController.initiateFunding(req, res, next)
);

/**
 * POST /api/v1/contracts/:id/cancel
 * Cancel a contract
 * Auth: WSIM proxy with user context
 */
router.post(
  '/:id/cancel',
  requireUserContext,
  (req, res, next) => contractController.cancelContract(req, res, next)
);

export default router;
