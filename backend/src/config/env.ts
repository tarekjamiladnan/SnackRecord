import 'dotenv/config';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const WEAK_SECRETS = [
  'change_this_to_a_strong_random_secret',
  'development_secret_replace_this_in_production',
  'your-random-secret-key',
  'secret'
];

const jwtSecret = required('JWT_SECRET');
if (isProduction) {
  const trimmed = jwtSecret.trim().toLowerCase();
  if (trimmed.length < 32 || WEAK_SECRETS.includes(trimmed)) {
    throw new Error(
      'JWT_SECRET is too weak for production. Use a random secret of at least 32 characters.'
    );
  }
}

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:4200';
const corsOrigins = corsOrigin
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 5000),
  databaseUrl: required('DATABASE_URL'),
  directUrl: required('DIRECT_URL'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
  corsOrigin,
  corsOrigins
};
