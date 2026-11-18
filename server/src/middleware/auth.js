import jwt from 'jsonwebtoken';
import { fail } from './errors.js';

const secret = () => process.env.JWT_SECRET || 'local-demo-only-change-this-secret';

export function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, secret(), { expiresIn: '7d' });
}

export function authenticate(req, _res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next(fail(401, 'AUTH_REQUIRED', 'Sign in to continue.'));
  try {
    req.auth = jwt.verify(token, secret());
    next();
  } catch {
    next(fail(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.'));
  }
}

export function optionalAuthenticate(req, _res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next();
  try {
    req.auth = jwt.verify(token, secret());
    next();
  } catch {
    next(fail(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.'));
  }
}

export function allow(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(fail(401, 'AUTH_REQUIRED', 'Sign in to continue.'));
    if (!roles.includes(req.auth.role)) return next(fail(403, 'FORBIDDEN', 'You do not have permission to do that.'));
    next();
  };
}
