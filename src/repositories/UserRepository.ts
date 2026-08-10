import { supabase } from "../lib/supabase";
import type { AppUser } from "../types";

interface UserRow {
  fps_id: string;
  dist_code: string;
  username: string;
  password_hash: string;
  display_name: string;
  role: string;
  created_at: string;
  active: boolean;
}

function rowToUser(row: UserRow): AppUser {
  return {
    fpsId: row.fps_id,
    distCode: row.dist_code,
    username: row.username,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    role: (row.role as AppUser["role"]) || "dealer",
    createdAt: row.created_at,
    active: row.active,
  };
}

export class UserRepository {
  async getAll(): Promise<AppUser[]> {
    const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(`UserRepository.getAll: ${error.message}`);
    return (data as UserRow[]).map(rowToUser);
  }

  async findByFpsId(fpsId: string): Promise<AppUser | null> {
    const trimmed = fpsId.trim();
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .or(`fps_id.eq.${trimmed},username.eq.${trimmed}`)
      .maybeSingle();
    if (error) throw new Error(`UserRepository.findByFpsId: ${error.message}`);
    return data ? rowToUser(data as UserRow) : null;
  }

  async remove(fpsId: string): Promise<void> {
    const { error } = await supabase.from("users").delete().eq("fps_id", fpsId.trim());
    if (error) throw new Error(`UserRepository.remove: ${error.message}`);
  }

  async upsert(user: AppUser): Promise<void> {
    const { error } = await supabase.from("users").upsert(
      {
        fps_id: user.fpsId,
        dist_code: user.distCode,
        username: user.username,
        password_hash: user.passwordHash,
        display_name: user.displayName,
        role: user.role,
        created_at: user.createdAt,
        active: user.active,
      },
      { onConflict: "fps_id" }
    );
    if (error) throw new Error(`UserRepository.upsert: ${error.message}`);
  }
}
