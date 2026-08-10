import bcrypt from "bcryptjs";
import { UserRepository } from "../repositories/UserRepository";
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

  async verifyCredentials(identifier: string, password: string): Promise<AuthResult | null> {
    const user = await this.userRepo.findByFpsId(identifier.trim());
    if (!user || !user.active) return null;

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;

    return {
      fpsId: user.fpsId,
      distCode: user.distCode,
      role: user.role,
      displayName: user.displayName,
    };
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
