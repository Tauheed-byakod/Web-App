export function notFound(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That endpoint could not be found.' } });
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof SyntaxError && error.status === 400 && Object.hasOwn(error, 'body')) {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body must be valid JSON.' } });
  }
  if (error?.name === 'ZodError') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted information.', details: error.issues }
    });
  }
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: { code: 'FILE_TOO_LARGE', message: 'Images must be 5 MB or smaller.' } });
  }
  if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: { code: 'ALREADY_EXISTS', message: 'That action has already been recorded.' } });
  }
  if (error?.status && error?.code) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  }
  console.error(error);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
}

export function fail(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
