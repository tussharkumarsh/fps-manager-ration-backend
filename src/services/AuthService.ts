import bcrypt from "bcryptjs";
import { UserRepository } from "../repositories/UserRepository";
import { LoginAttemptRepository } from "../repositories/LoginAttemptRepository";
import { attemptKey, isLockedOut, LOCKOUT_WINDOW_MS } from "../lib/loginLimit";
import type { AppUser } from "../types";

export interface AuthResult {
  fpsId: string;
  distCode: string;
  role: "dealer" | "admin";
  displayName: string;
}

export interface UserProfile {
  fpsId: string;
  distCode: string;
  username: string;
  displayName: string;
  role: "dealer" | "admin";
  createdAt: string;
  active: boolean;
}

export class AuthService {
  private userRepo = new UserRepository();
  private attemptRepo = new LoginAttemptRepository();

  /** Returns "locked" after MAX_FAILED_ATTEMPTS failures in LOCKOUT_WINDOW_MS for this identifier. */
  async verifyCredentials(identifier: string, password: string): Promise<AuthResult | null | "locked"> {
    const key = attemptKey(identifier);
    const now = new Date();
    const failures = await this.attemptRepo.recentFailures(key, new Date(now.getTime() - LOCKOUT_WINDOW_MS));
    if (isLockedOut(failures, now)) return "locked";

    const user = await this.userRepo.findByFpsId(identifier.trim());
    const ok = !!user && user.active && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !ok) {
      await this.attemptRepo.recordFailure(key);
      return null;
    }
    await this.attemptRepo.clear(key);

    return {
      fpsId: user.fpsId,
      distCode: user.distCode,
      role: user.role,
      displayName: user.displayName,
    };
  }

  async listUsers(): Promise<UserProfile[]> {
    const users = await this.userRepo.getAll();
    return users.map(({ passwordHash: _passwordHash, ...profile }) => profile);
  }

  async getProfile(fpsId: string): Promise<UserProfile | null> {
    const user = await this.userRepo.findByFpsId(fpsId.trim());
    if (!user) return null;
    const { passwordHash: _passwordHash, ...profile } = user;
    return profile;
  }

  /**
   * Requires the caller to prove they know the current password before
   * setting a new one — never trusts the fpsId alone, since that's easy for
   * anyone to guess/enumerate.
   */
  async changePassword(fpsId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.userRepo.findByFpsId(fpsId.trim());
    if (!user || !user.active) return false;

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return false;

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.upsert({ ...user, passwordHash });
    return true;
  }

  async deleteUser(fpsId: string): Promise<void> {
    await this.userRepo.remove(fpsId);
  }

  /**
   * Edits an existing account's non-credential fields — never touches
   * passwordHash, so this can't be used to reset a password.
   */
  async updateProfile(
    fpsId: string,
    updates: Partial<{
      distCode: string;
      username: string;
      displayName: string;
      role: "dealer" | "admin";
      active: boolean;
    }>
  ): Promise<UserProfile | null> {
    const user = await this.userRepo.findByFpsId(fpsId.trim());
    if (!user) return null;
    const merged: AppUser = { ...user, ...updates };
    await this.userRepo.upsert(merged);
    const { passwordHash: _passwordHash, ...profile } = merged;
    return profile;
  }

  async createOrUpdateUser(params: {
    fpsId: string;
    distCode: string;
    username: string;
    password: string;
    displayName: string;
    role?: "dealer" | "admin";
  }): Promise<void> {
    const passwordHash = await bcrypt.hash(params.password, 10);
    const user: AppUser = {
      fpsId: params.fpsId,
      distCode: params.distCode,
      username: params.username,
      passwordHash,
      displayName: params.displayName,
      role: params.role || "dealer",
      createdAt: new Date().toISOString(),
      active: true,
    };
    await this.userRepo.upsert(user);
  }
}
