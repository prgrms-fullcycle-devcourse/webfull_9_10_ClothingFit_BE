import { type Router as RouterType, Router } from 'express';
import { authenticate } from '@/common/middleware/auth.middleware';
import { validate } from '@/common/middleware/validate.middleware';
import { getClosetsController } from './closet.controller';
import { ClosetQuerySchema } from './closet.schema';

const router: RouterType = Router();

router.get('/', authenticate, validate({ query: ClosetQuerySchema }), getClosetsController);

export default router;
