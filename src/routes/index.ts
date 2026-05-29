import { type Router as RouterType, Router } from 'express';
import healthRouter from '@/modules/health/health.route';
import postsRouter  from '@/modules/posts/posts.route';
import characterRouter from '../modules/characters/character.route';

export const router: RouterType = Router();

router.use('/health', healthRouter);
router.use('/posts', postsRouter);
router.use('/characters', characterRouter);
