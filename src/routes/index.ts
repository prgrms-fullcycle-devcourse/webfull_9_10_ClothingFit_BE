import { type Router as RouterType, Router } from 'express';
import { healthRouter } from '../modules/health/health.route';

export const router: RouterType = Router();

router.use('/health', healthRouter);
