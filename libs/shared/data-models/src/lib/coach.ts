/**
 * Wire shapes for the conversational coach: profile + long-term memories.
 * Chat thread + tool definitions land in Phase 2.
 */

export type MemoryCategory = 'GOAL' | 'PREFERENCE' | 'FACT' | 'EVENT';

export interface UserProfile {
  birthdate?: string | null; // ISO date (YYYY-MM-DD)
  weightKg?: number | null;
  heightCm?: number | null;
  sportPrimary?: string | null;
  ftpW?: number | null;
  maxHrBpm?: number | null;
  restHrBpm?: number | null;
  weightGoalKg?: number | null;
  ftpGoalW?: number | null;
}

export type UserProfileUpdate = UserProfile;

export interface Memory {
  id: string;
  category: MemoryCategory;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCreate {
  category: MemoryCategory;
  content: string;
}

export interface MemoryUpdate {
  category?: MemoryCategory;
  content?: string;
}
