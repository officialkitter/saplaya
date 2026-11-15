import { Request, Response, NextFunction } from 'express';
import { createClient, type User } from '@supabase/supabase-js';
import { ZodError } from 'zod';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User | null;
    }
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SECRET_KEY || ''
);

export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized - No token provided' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

export function handleZodError(error: ZodError) {
  return {
    error: 'Validation error',
    details: error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

export function errorHandler(error: unknown) {
  if (error instanceof ZodError) {
    return { status: 400, body: handleZodError(error) };
  }
  if (error instanceof Error) {
    return { status: 500, body: { error: error.message } };
  }
  return { status: 500, body: { error: 'Unknown error occurred' } };
}
