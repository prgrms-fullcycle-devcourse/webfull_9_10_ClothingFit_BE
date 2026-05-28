import { type Router as RouterType, Router } from 'express';
import { healthCheck } from './health.controller';

const router: RouterType = Router();

router.get('/', healthCheck);

export default router;