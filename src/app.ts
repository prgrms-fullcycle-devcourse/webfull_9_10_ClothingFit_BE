import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { corsOptions } from './config/cors';
import { openApiDocument } from './config/swagger';
import { errorHandler } from './common/errors/errorHandler';
import { loggerMiddleware } from './common/middleware/logger.middleware';
import { router } from './routes';

const app: Application = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(loggerMiddleware);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
});
app.use('/api/v1', router);

app.use(errorHandler);

export { app };
