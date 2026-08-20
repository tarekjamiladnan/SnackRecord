import { createRequire } from 'node:module';
import { Prisma, Role, TeamStatus } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/errors.js';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs') as {
  hash: (value: string, salt: number) => Promise<string>;
  compare: (value: string, hash: string) => Promise<boolean>;
};
const jwt = require('jsonwebtoken') as {
  sign: (payload: Record<string, unknown>, secret: string, options: { expiresIn?: string | number }) => string;
};

const BCRYPT_ROUNDS = 10;

export interface RegisterTeamInput {
  teamName: string;
  adminName: string;
  adminEmail: string;
  adminPhone?: string;
  password: string;
  confirmPassword: string;
}

const makeSlug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'team';

export const authService = {
  async registerTeam(input: RegisterTeamInput) {
    const teamName = input.teamName.trim();
    const adminName = input.adminName.trim();
    const adminEmail = input.adminEmail.trim().toLowerCase();

    if (!teamName || !adminName || !adminEmail) {
      throw new ApiError('Team name, admin name and admin email are required', 400);
    }

    if (input.password !== input.confirmPassword) {
      throw new ApiError('Passwords do not match', 400);
    }

    if (input.password.length < 8) {
      throw new ApiError('Password must be at least 8 characters', 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(adminEmail)) {
      throw new ApiError('A valid admin email is required', 400);
    }

    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingUser) {
      throw new ApiError('An account already exists with that email', 409);
    }

    let slug = makeSlug(teamName);
    let suffix = 1;
    while (await prisma.team.findUnique({ where: { slug } })) {
      slug = `${makeSlug(teamName)}-${suffix}`;
      suffix += 1;
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const result = await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name: teamName,
          slug,
          status: TeamStatus.ACTIVE
        }
      });

      const user = await tx.user.create({
        data: {
          teamId: team.id,
          name: adminName,
          email: adminEmail,
          phone: input.adminPhone?.trim() || null,
          passwordHash,
          role: Role.TEAM_ADMIN
        }
      });

      await tx.member.create({
        data: {
          teamId: team.id,
          userId: user.id,
          name: adminName,
          email: adminEmail,
          phone: input.adminPhone?.trim() || null,
          status: 'active'
        }
      });

      return { team, user };
    });

    return {
      message: 'Your team record is ready. Sign in to start tracking.'
    };
  },

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      throw new ApiError('Invalid email or password', 401);
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new ApiError('Invalid email or password', 401);
    }

    if (user.role === Role.SUPER_ADMIN && !user.teamId) {
      return this.signToken(user, null);
    }

    if (!user.teamId) {
      throw new ApiError('User is not assigned to a team', 403);
    }

    const team = await prisma.team.findUnique({ where: { id: user.teamId } });
    if (!team) {
      throw new ApiError('Team not found', 403);
    }
    if (team.status === TeamStatus.PENDING) {
      throw new ApiError('Your account is pending approval. Please wait for a super admin to approve your registration.', 403);
    }
    if (team.status === TeamStatus.REJECTED) {
      throw new ApiError('Your registration request was rejected by a super admin.', 403);
    }
    if (team.status !== TeamStatus.ACTIVE) {
      throw new ApiError('This team is currently suspended', 403);
    }

    return this.signToken(user, user.teamId);
  },

  async updatePassword(userId: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new ApiError('New password must be at least 6 characters', 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError('User not found', 404);

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { message: 'Password updated successfully' };
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        teamId: true,
        createdAt: true,
        updatedAt: true,
        team: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true
          }
        }
      }
    });

    if (!user) throw new ApiError('User not found', 404);
    if (user.teamId) {
      const team = await prisma.team.findUnique({ where: { id: user.teamId } });
      if (team && team.status !== TeamStatus.ACTIVE) {
        throw new ApiError(
          team.status === TeamStatus.PENDING
            ? 'Your account is pending approval.'
            : team.status === TeamStatus.REJECTED
              ? 'Your registration request was rejected by a super admin.'
              : 'This team is currently suspended',
          403
        );
      }
    }
    return user;
  },

  signToken(user: { id: string; email: string; name: string; role: Role; teamId: string | null }, teamId: string | null) {
    return {
      token: jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          teamId
        },
        env.jwtSecret,
        {
          expiresIn: env.jwtExpiresIn
        }
      ),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        teamId
      }
    };
  }
};
