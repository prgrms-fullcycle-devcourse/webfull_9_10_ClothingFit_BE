import { type Router as RouterType, Router } from 'express';
import { healthCheck } from './health.controller';

export const healthRouter: RouterType = Router();

healthRouter.get('/', healthCheck);
