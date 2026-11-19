const configuredOrigins = process.env.CLIENT_ORIGIN
  ?.split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

export const clientOrigins = configuredOrigins?.length ? configuredOrigins : [
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];
