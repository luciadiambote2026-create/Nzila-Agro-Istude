import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, parseUserPermissions, type AuxPermissionKey } from './db.ts';

const JWT_SECRET = process.env.JWT_SECRET || crypto.createHash('sha256').update(process.cwd() + ':nzila-agro-secret-key').digest('hex');

export interface JwtPayload {
  userId: number;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: Record<string, unknown>;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(userId: number, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sessão não autenticada. Faça login novamente.' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);
  if (!user) {
    res.status(401).json({ error: 'Utilizador não encontrado.' });
    return;
  }

  req.authUser = user;
  next();
}

export function requirePrincipalAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser || req.authUser.role !== 'ADMIN_PRINCIPAL') {
    res.status(403).json({ error: 'Acesso restrito exclusivamente ao Administrador Principal.' });
    return;
  }
  next();
}

export function requireAuxOrPrincipalAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser || (req.authUser.role !== 'ADMIN_PRINCIPAL' && req.authUser.role !== 'ADMIN_AUXILIAR')) {
    res.status(403).json({ error: 'Acesso restrito à moderação administrativa.' });
    return;
  }
  next();
}

export function requirePermission(permission: AuxPermissionKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Sessão não autenticada.' });
      return;
    }
    if (req.authUser.role === 'ADMIN_PRINCIPAL') {
      next();
      return;
    }
    if (req.authUser.role !== 'ADMIN_AUXILIAR') {
      res.status(403).json({ error: 'Acesso restrito a administradores.' });
      return;
    }
    const perms = parseUserPermissions(req.authUser);
    if (!perms.includes(permission)) {
      res.status(403).json({
        error: 'O seu nível de acesso não inclui permissão para executar esta ação. Contacte o Administrador Principal.',
      });
      return;
    }
    next();
  };
}
