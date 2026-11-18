import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { router } from './routes/api.js';
import { notFound, errorHandler } from './middleware/errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.resolve(here, '..', process.env.UPLOAD_DIR || 'uploads')));
app.get('/api/health', (_req,res) => res.json({ ok:true, service:'CivicGaps API' }));
app.use('/api',router);
app.use(notFound);
app.use(errorHandler);
