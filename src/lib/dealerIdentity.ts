/**
 * Why a dealer's FPS number / district code pair is unusable, or null.
 * Every portal call is made with these two (epos by FPS, the daily totals
 * and allotment by district), and the FPS number begins with its district
 * code (151209500212 → 1512), so a mismatch would fetch another district.
 * Admin accounts are not shops and are not checked.
 */
export function dealerIdentityError(fpsId: unknown, distCode: unknown, role: unknown): string | null {
  if (role === "admin") return null;
  const fps = String(fpsId ?? "").trim();
  const dist = String(distCode ?? "").trim();
  if (!/^\d{12}$/.test(fps)) return "FPS number must be 12 digits";
  if (!/^\d{4}$/.test(dist)) return "District code must be 4 digits";
  if (!fps.startsWith(dist)) return `FPS number ${fps} does not start with district code ${dist}`;
  return null;
}
