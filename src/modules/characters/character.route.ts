import { type Router as RouterType, Router } from 'express';
import { authenticate } from '@/common/middleware/auth.middleware';
import { validate } from '@/common/middleware/validate.middleware';
import { getCharactersController, selectCharacterController } from './character.controller';
import { SelectCharacterBodySchema } from './character.schema';

const router: RouterType = Router();

router.get('/', getCharactersController);
router.post('/me', authenticate, validate({ body: SelectCharacterBodySchema }), selectCharacterController);

export default router;