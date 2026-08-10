import bcrypt from "bcryptjs";
import { UserRepository } from "../repositories/UserRepository";
import type { AppUser } from "../types";

export interface AuthResult {
  fpsId: string;
  distCode: string;
  role: "dealer" | "admin";
  displayName: string;
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
