import { withLambda } from '@netlify/aws-lambda-compat';
import { handler } from '../../server/dist/netlify.js';

export default withLambda(handler);
