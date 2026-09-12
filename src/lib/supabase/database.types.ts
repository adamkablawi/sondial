import type { Room, Version } from "@/lib/types";

/**
 * Hand-written schema type matching supabase/schema.sql.
 *
 * Typing the client this way means a column rename breaks the build instead of
 * silently returning undefined at runtime.
 */
export interface Database {
  public: {
    Tables: {
      rooms: {
        Row: Room;
        Insert: Partial<Room> & { code: string };
        Update: Partial<Room>;
        Relationships: [];
      };
      versions: {
        Row: Version;
        Insert: Partial<Version> & { room_id: string; instruction: string };
        Update: Partial<Version>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      claim_next_version: {
        Args: Record<never, never>;
        // SETOF: zero rows when the queue is empty.
        Returns: Version[];
      };
      requeue_stuck_versions: {
        Args: { max_age_minutes?: number };
        Returns: Version[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
