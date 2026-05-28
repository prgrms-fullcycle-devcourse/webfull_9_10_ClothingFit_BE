import { type Router as RouterType, Router } from 'express';
import { getCharactersController } from './character.controller';

const router: RouterType = Router();

router.get('/', getCharactersController);

export default router;