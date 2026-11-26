import { supabase } from "../lib/supabase";

/**
 * Failed login attempts, kept in the database (not memory) so the limit
 * holds across serverless instances.
 */
export class LoginAttemptRepository {
  async recentFailures(identifier: string, since: Date): Promise<Date[]> {
    const { data, error } = await supabase
      .from("login_attempts")
      .select("attempted_at")
      .eq("identifier", identifier)
      .gt("attempted_at", since.toISOString());
    if (error) throw new Error(`LoginAttemptRepository.recentFailures: ${error.message}`);
    return ((data as { attempted_at: string }[]) || []).map((r) => new Date(r.attempted_at));
  }

  async recordFailure(identifier: string): Promise<void> {
    const { error } = await supabase.from("login_attempts").insert({ identifier });
    if (error) throw new Error(`LoginAttemptRepository.recordFailure: ${error.message}`);
  }

  async clear(identifier: string): Promise<void> {
    const { error } = await supabase.from("login_attempts").delete().eq("identifier", identifier);
    if (error) throw new Error(`LoginAttemptRepository.clear: ${error.message}`);
  }
}
