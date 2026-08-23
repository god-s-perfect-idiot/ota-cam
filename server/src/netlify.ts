import awsLambdaFastify from '@fastify/aws-lambda';
import { buildApp } from './app.js';

const app = await buildApp();

export const handler = awsLambdaFastify(app, {
  binaryMimeTypes: [
    'application/octet-stream',
    'image/jpeg',
    'image/png',
    'image/webp',
    'multipart/form-data',
  ],
});

await app.ready();
