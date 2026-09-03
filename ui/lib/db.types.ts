export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      achievement_awards: {
        Row: {
          achievement_id: string
          awarded_at: string
          profile_id: string
        }
        Insert: {
          achievement_id: string
          awarded_at?: string
          profile_id: string
        }
        Update: {
          achievement_id?: string
          awarded_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievement_awards_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      amenity_types: {
        Row: {
          category: string
          icon: string
          label: string
          ordinal: number
          slug: string
        }
        Insert: {
          category: string
          icon: string
          label: string
          ordinal: number
          slug: string
        }
        Update: {
          category?: string
          icon?: string
          label?: string
          ordinal?: number
          slug?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_prefs: {
        Row: {
          game_id: string
          level: string
          muted_until: string | null
          profile_id: string
        }
        Insert: {
          game_id: string
          level?: string
          muted_until?: string | null
          profile_id: string
        }
        Update: {
          game_id?: string
          level?: string
          muted_until?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_prefs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_prefs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string
          hall_name: string | null
          hall_suburb: string | null
          id: string
          last_checked_at: string
          name: string
          session_note: string | null
          slug: string
          source_note: string | null
          source_url: string
        }
        Insert: {
          created_at?: string
          hall_name?: string | null
          hall_suburb?: string | null
          id?: string
          last_checked_at?: string
          name: string
          session_note?: string | null
          slug: string
          source_note?: string | null
          source_url?: string
        }
        Update: {
          created_at?: string
          hall_name?: string | null
          hall_suburb?: string | null
          id?: string
          last_checked_at?: string
          name?: string
          session_note?: string | null
          slug?: string
          source_note?: string | null
          source_url?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followee_id_fkey"
            columns: ["followee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_alerts: {
        Row: {
          center_lat: number
          center_lng: number
          created_at: string
          id: string
          profile_id: string
          radius_m: number
          sport_id: string
          tier_slugs: string[] | null
        }
        Insert: {
          center_lat: number
          center_lng: number
          created_at?: string
          id?: string
          profile_id: string
          radius_m: number
          sport_id: string
          tier_slugs?: string[] | null
        }
        Update: {
          center_lat?: number
          center_lng?: number
          created_at?: string
          id?: string
          profile_id?: string
          radius_m?: number
          sport_id?: string
          tier_slugs?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "game_alerts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_alerts_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      game_confirmations: {
        Row: {
          claimed_at: string | null
          created_at: string
          game_id: string | null
          id: string
          parsed: Json | null
          review_status: string
          storage_path: string | null
          uploaded_by: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          game_id?: string | null
          id?: string
          parsed?: Json | null
          review_status?: string
          storage_path?: string | null
          uploaded_by: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          game_id?: string | null
          id?: string
          parsed?: Json | null
          review_status?: string
          storage_path?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_confirmations_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_confirmations_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_confirmations_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_formats: {
        Row: {
          id: string
          label: string
          ordinal: number
          slug: string
          sport_id: string
        }
        Insert: {
          id?: string
          label: string
          ordinal?: number
          slug: string
          sport_id: string
        }
        Update: {
          id?: string
          label?: string
          ordinal?: number
          slug?: string
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_formats_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          attended: boolean | null
          chat_muted_at: string | null
          decided_at: string | null
          game_id: string
          priority_waitlist: boolean
          profile_id: string
          requested_at: string
          status: string
        }
        Insert: {
          attended?: boolean | null
          chat_muted_at?: string | null
          decided_at?: string | null
          game_id: string
          priority_waitlist?: boolean
          profile_id: string
          requested_at?: string
          status?: string
        }
        Update: {
          attended?: boolean | null
          chat_muted_at?: string | null
          decided_at?: string | null
          game_id?: string
          priority_waitlist?: boolean
          profile_id?: string
          requested_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_reserved_spots: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          game_id: string
          id: string
          invite_token: string | null
          invited_profile_id: string | null
          label: string | null
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          game_id: string
          id?: string
          invite_token?: string | null
          invited_profile_id?: string | null
          label?: string | null
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          game_id?: string
          id?: string
          invite_token?: string | null
          invited_profile_id?: string | null
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_reserved_spots_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_reserved_spots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_reserved_spots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_reserved_spots_invited_profile_id_fkey"
            columns: ["invited_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          attendance_marked_at: string | null
          attendance_prompted_at: string | null
          auto_approve: boolean
          chat_closed_at: string | null
          chat_mode: string
          chat_pause_until: string | null
          chat_photo_approval: boolean
          cost_per_player_cents: number
          court_label: string | null
          courts_booked: number
          cover_key: string
          created_at: string
          duration_minutes: number
          ends_at: string
          format_id: string
          id: string
          max_players: number
          notes: string | null
          nudge_pending_at: string | null
          nudge_underfilled_at: string | null
          organizer_id: string
          rate_prompted_at: string | null
          reminded_24h_at: string | null
          reminded_at: string | null
          reserved_spots: number
          shuttles: string | null
          skill_tier_id: string
          skill_tier_max_id: string | null
          sport_id: string
          starts_at: string
          status: string
          venue_id: string
          verification_status: string
          visibility: string
        }
        Insert: {
          attendance_marked_at?: string | null
          attendance_prompted_at?: string | null
          auto_approve?: boolean
          chat_closed_at?: string | null
          chat_mode?: string
          chat_pause_until?: string | null
          chat_photo_approval?: boolean
          cost_per_player_cents?: number
          court_label?: string | null
          courts_booked?: number
          cover_key?: string
          created_at?: string
          duration_minutes?: number
          ends_at: string
          format_id: string
          id?: string
          max_players: number
          notes?: string | null
          nudge_pending_at?: string | null
          nudge_underfilled_at?: string | null
          organizer_id: string
          rate_prompted_at?: string | null
          reminded_24h_at?: string | null
          reminded_at?: string | null
          reserved_spots?: number
          shuttles?: string | null
          skill_tier_id: string
          skill_tier_max_id?: string | null
          sport_id: string
          starts_at: string
          status?: string
          venue_id: string
          verification_status?: string
          visibility?: string
        }
        Update: {
          attendance_marked_at?: string | null
          attendance_prompted_at?: string | null
          auto_approve?: boolean
          chat_closed_at?: string | null
          chat_mode?: string
          chat_pause_until?: string | null
          chat_photo_approval?: boolean
          cost_per_player_cents?: number
          court_label?: string | null
          courts_booked?: number
          cover_key?: string
          created_at?: string
          duration_minutes?: number
          ends_at?: string
          format_id?: string
          id?: string
          max_players?: number
          notes?: string | null
          nudge_pending_at?: string | null
          nudge_underfilled_at?: string | null
          organizer_id?: string
          rate_prompted_at?: string | null
          reminded_24h_at?: string | null
          reminded_at?: string | null
          reserved_spots?: number
          shuttles?: string | null
          skill_tier_id?: string
          skill_tier_max_id?: string | null
          sport_id?: string
          starts_at?: string
          status?: string
          venue_id?: string
          verification_status?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "game_formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_skill_tier_id_fkey"
            columns: ["skill_tier_id"]
            isOneToOne: false
            referencedRelation: "skill_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_skill_tier_max_id_fkey"
            columns: ["skill_tier_max_id"]
            isOneToOne: false
            referencedRelation: "skill_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          game_id: string
          last_read_at: string
          profile_id: string
        }
        Insert: {
          game_id: string
          last_read_at?: string
          profile_id: string
        }
        Update: {
          game_id?: string
          last_read_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          approval_status: string
          body: string
          client_id: string | null
          created_at: string
          deleted_at: string | null
          game_id: string
          game_share_id: string | null
          id: string
          image_path: string | null
          kind: string
          mentions: string[]
          reply_to_body: string | null
          reply_to_kind: string | null
          reply_to_message_id: string | null
          reply_to_sender_id: string | null
          sender_id: string | null
          system_event: string | null
        }
        Insert: {
          approval_status?: string
          body?: string
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          game_id: string
          game_share_id?: string | null
          id?: string
          image_path?: string | null
          kind?: string
          mentions?: string[]
          reply_to_body?: string | null
          reply_to_kind?: string | null
          reply_to_message_id?: string | null
          reply_to_sender_id?: string | null
          sender_id?: string | null
          system_event?: string | null
        }
        Update: {
          approval_status?: string
          body?: string
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          game_id?: string
          game_share_id?: string | null
          id?: string
          image_path?: string | null
          kind?: string
          mentions?: string[]
          reply_to_body?: string | null
          reply_to_kind?: string | null
          reply_to_message_id?: string | null
          reply_to_sender_id?: string | null
          sender_id?: string | null
          system_event?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_game_share_id_fkey"
            columns: ["game_share_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_game_share_id_fkey"
            columns: ["game_share_id"]
            isOneToOne: false
            referencedRelation: "games_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_flags: {
        Row: {
          author_id: string
          category: string | null
          created_at: string
          id: string
          reason: string | null
          status: string
          text: string
        }
        Insert: {
          author_id: string
          category?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          status?: string
          text: string
        }
        Update: {
          author_id?: string
          category?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          status?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_flags_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          alerts: boolean
          chat: boolean
          created_at: string
          game_changes: boolean
          join_requests: boolean
          marketing: boolean
          nudges: boolean
          profile_id: string
          quiet_end: string
          quiet_hours_enabled: boolean
          quiet_start: string
          reminders: boolean
          roster_changes: boolean
          updated_at: string
        }
        Insert: {
          alerts?: boolean
          chat?: boolean
          created_at?: string
          game_changes?: boolean
          join_requests?: boolean
          marketing?: boolean
          nudges?: boolean
          profile_id: string
          quiet_end?: string
          quiet_hours_enabled?: boolean
          quiet_start?: string
          reminders?: boolean
          roster_changes?: boolean
          updated_at?: string
        }
        Update: {
          alerts?: boolean
          chat?: boolean
          created_at?: string
          game_changes?: boolean
          join_requests?: boolean
          marketing?: boolean
          nudges?: boolean
          profile_id?: string
          quiet_end?: string
          quiet_hours_enabled?: boolean
          quiet_start?: string
          reminders?: boolean
          roster_changes?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          collapse_key: string | null
          created_at: string
          game_id: string | null
          id: string
          params: Json
          priority: string
          profile_id: string
          read_at: string | null
          sent_at: string | null
          title: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          collapse_key?: string | null
          created_at?: string
          game_id?: string | null
          id?: string
          params?: Json
          priority?: string
          profile_id: string
          read_at?: string | null
          sent_at?: string | null
          title?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          collapse_key?: string | null
          created_at?: string
          game_id?: string | null
          id?: string
          params?: Json
          priority?: string
          profile_id?: string
          read_at?: string | null
          sent_at?: string | null
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_replies: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          post_id: string
          status: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          post_id: string
          status?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_replies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_replies_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          accepted_answer_id: string | null
          author_id: string | null
          body: string | null
          club_id: string | null
          created_at: string
          edited_at: string | null
          game_id: string | null
          id: string
          kind: string
          payload: Json | null
          point: unknown
          reaction_count: number
          reply_count: number
          sport_id: string | null
          status: string
          venue_id: string | null
        }
        Insert: {
          accepted_answer_id?: string | null
          author_id?: string | null
          body?: string | null
          club_id?: string | null
          created_at?: string
          edited_at?: string | null
          game_id?: string | null
          id?: string
          kind: string
          payload?: Json | null
          point?: unknown
          reaction_count?: number
          reply_count?: number
          sport_id?: string | null
          status?: string
          venue_id?: string | null
        }
        Update: {
          accepted_answer_id?: string | null
          author_id?: string | null
          body?: string | null
          club_id?: string | null
          created_at?: string
          edited_at?: string | null
          game_id?: string | null
          id?: string
          kind?: string
          payload?: Json | null
          point?: unknown
          reaction_count?: number
          reply_count?: number
          sport_id?: string | null
          status?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_accepted_answer_fk"
            columns: ["accepted_answer_id"]
            isOneToOne: false
            referencedRelation: "post_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          phone: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          phone?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          phone?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_private_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_sports: {
        Row: {
          profile_id: string
          skill_tier_id: string
          sport_id: string
        }
        Insert: {
          profile_id: string
          skill_tier_id: string
          sport_id: string
        }
        Update: {
          profile_id?: string
          skill_tier_id?: string
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_sports_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_sports_skill_tier_id_fkey"
            columns: ["skill_tier_id"]
            isOneToOne: false
            referencedRelation: "skill_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_sports_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_key: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          distance_units: string
          follower_count: number
          following_count: number
          home_point: unknown
          home_suburb: string | null
          id: string
          photo_path: string | null
          profile_visibility: string
          referral_priority_credits: number
          referred_by: string | null
          reliability_score: number
          show_suburb: boolean
          timezone: string
        }
        Insert: {
          avatar_key?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          distance_units?: string
          follower_count?: number
          following_count?: number
          home_point?: unknown
          home_suburb?: string | null
          id: string
          photo_path?: string | null
          profile_visibility?: string
          referral_priority_credits?: number
          referred_by?: string | null
          reliability_score?: number
          show_suburb?: boolean
          timezone?: string
        }
        Update: {
          avatar_key?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          distance_units?: string
          follower_count?: number
          following_count?: number
          home_point?: unknown
          home_suburb?: string | null
          id?: string
          photo_path?: string | null
          profile_visibility?: string
          referral_priority_credits?: number
          referred_by?: string | null
          reliability_score?: number
          show_suburb?: boolean
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_receipts: {
        Row: {
          created_at: string
          expo_token: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          expo_token: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          expo_token?: string
          ticket_id?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          expo_token: string
          id: string
          platform: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          expo_token: string
          id?: string
          platform: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          expo_token?: string
          id?: string
          platform?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_tags: {
        Row: {
          created_at: string
          dimension: string
          game_id: string
          ratee_id: string
          rater_id: string
          tag: string
        }
        Insert: {
          created_at?: string
          dimension?: string
          game_id: string
          ratee_id: string
          rater_id: string
          tag: string
        }
        Update: {
          created_at?: string
          dimension?: string
          game_id?: string
          ratee_id?: string
          rater_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "rating_tags_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_tags_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_tags_ratee_id_fkey"
            columns: ["ratee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_tags_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          created_at: string
          dimension: string
          game_id: string
          ratee_id: string
          rater_id: string
          stars: number
        }
        Insert: {
          created_at?: string
          dimension?: string
          game_id: string
          ratee_id: string
          rater_id: string
          stars: number
        }
        Update: {
          created_at?: string
          dimension?: string
          game_id?: string
          ratee_id?: string
          rater_id?: string
          stars?: number
        }
        Relationships: [
          {
            foreignKeyName: "ratings_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_ratee_id_fkey"
            columns: ["ratee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_tiers: {
        Row: {
          id: string
          label: string
          ordinal: number
          slug: string
          sport_id: string
        }
        Insert: {
          id?: string
          label: string
          ordinal: number
          slug: string
          sport_id: string
        }
        Update: {
          id?: string
          label?: string
          ordinal?: number
          slug?: string
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_tiers_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_votes: {
        Row: {
          created_at: string
          game_id: string
          ratee_id: string
          rater_id: string
          skill_tier_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          ratee_id: string
          rater_id: string
          skill_tier_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          ratee_id?: string
          rater_id?: string
          skill_tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_votes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_votes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_votes_ratee_id_fkey"
            columns: ["ratee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_votes_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_votes_skill_tier_id_fkey"
            columns: ["skill_tier_id"]
            isOneToOne: false
            referencedRelation: "skill_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      sports: {
        Row: {
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          context_game_id: string | null
          created_at: string
          detail: string | null
          id: string
          reason: string
          reported_id: string | null
          reporter_id: string
          status: string
          subject_id: string | null
          subject_type: string
        }
        Insert: {
          context_game_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          reason: string
          reported_id?: string | null
          reporter_id: string
          status?: string
          subject_id?: string | null
          subject_type?: string
        }
        Update: {
          context_game_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          reason?: string
          reported_id?: string | null
          reporter_id?: string
          status?: string
          subject_id?: string | null
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_context_game_id_fkey"
            columns: ["context_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_context_game_id_fkey"
            columns: ["context_game_id"]
            isOneToOne: false
            referencedRelation: "games_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_amenities: {
        Row: {
          amenity_slug: string
          availability: string
          note: string | null
          venue_id: string
        }
        Insert: {
          amenity_slug: string
          availability: string
          note?: string | null
          venue_id: string
        }
        Update: {
          amenity_slug?: string
          availability?: string
          note?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_amenities_amenity_slug_fkey"
            columns: ["amenity_slug"]
            isOneToOne: false
            referencedRelation: "amenity_types"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "venue_amenities_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_corrections: {
        Row: {
          created_at: string
          field: string
          id: string
          note: string | null
          reporter_id: string
          status: string
          suggested_value: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          field: string
          id?: string
          note?: string | null
          reporter_id: string
          status?: string
          suggested_value?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          field?: string
          id?: string
          note?: string | null
          reporter_id?: string
          status?: string
          suggested_value?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_corrections_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_corrections_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_photos: {
        Row: {
          created_at: string
          credit: string | null
          id: string
          ordinal: number
          status: string
          storage_path: string
          uploader_id: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          credit?: string | null
          id?: string
          ordinal?: number
          status?: string
          storage_path: string
          uploader_id?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          credit?: string | null
          id?: string
          ordinal?: number
          status?: string
          storage_path?: string
          uploader_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_photos_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_photos_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_pricing_bands: {
        Row: {
          cents: number
          days: number[]
          ends_time: string | null
          id: string
          label: string
          notes: string | null
          starts_time: string | null
          unit: string
          venue_id: string
        }
        Insert: {
          cents: number
          days: number[]
          ends_time?: string | null
          id?: string
          label: string
          notes?: string | null
          starts_time?: string | null
          unit: string
          venue_id: string
        }
        Update: {
          cents?: number
          days?: number[]
          ends_time?: string | null
          id?: string
          label?: string
          notes?: string | null
          starts_time?: string | null
          unit?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_pricing_bands_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_profiles: {
        Row: {
          access_notes: string | null
          bookability: string
          booking_platform: string | null
          booking_url: string | null
          club_contact: string | null
          confidence: string
          courts_badminton: number | null
          courts_total: number | null
          data_source: string
          dedicated: boolean
          opening_hours: Json | null
          phone: string | null
          source_url: string | null
          summary: string | null
          surface: string | null
          updated_at: string
          venue_id: string
          verified_at: string | null
          website_url: string | null
        }
        Insert: {
          access_notes?: string | null
          bookability?: string
          booking_platform?: string | null
          booking_url?: string | null
          club_contact?: string | null
          confidence?: string
          courts_badminton?: number | null
          courts_total?: number | null
          data_source: string
          dedicated?: boolean
          opening_hours?: Json | null
          phone?: string | null
          source_url?: string | null
          summary?: string | null
          surface?: string | null
          updated_at?: string
          venue_id: string
          verified_at?: string | null
          website_url?: string | null
        }
        Update: {
          access_notes?: string | null
          bookability?: string
          booking_platform?: string | null
          booking_url?: string | null
          club_contact?: string | null
          confidence?: string
          courts_badminton?: number | null
          courts_total?: number | null
          data_source?: string
          dedicated?: boolean
          opening_hours?: Json | null
          phone?: string | null
          source_url?: string | null
          summary?: string | null
          surface?: string | null
          updated_at?: string
          venue_id?: string
          verified_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_profiles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          created_at: string
          google_place_id: string | null
          id: string
          location: unknown
          name: string
          region: string | null
          slug: string | null
          source: string
          state: string
          suburb: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          location: unknown
          name: string
          region?: string | null
          slug?: string | null
          source?: string
          state: string
          suburb: string
        }
        Update: {
          address?: string | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          location?: unknown
          name?: string
          region?: string | null
          slug?: string | null
          source?: string
          state?: string
          suburb?: string
        }
        Relationships: []
      }
    }
    Views: {
      games_public: {
        Row: {
          approved_count: number | null
          auto_approve: boolean | null
          cost_per_player_cents: number | null
          court_label: string | null
          courts_booked: number | null
          cover_key: string | null
          created_at: string | null
          duration_minutes: number | null
          ends_at: string | null
          format_id: string | null
          format_label: string | null
          format_slug: string | null
          id: string | null
          max_players: number | null
          notes: string | null
          open_spots: number | null
          organizer_avatar_key: string | null
          organizer_display_name: string | null
          organizer_hosted_count: number | null
          organizer_id: string | null
          organizer_photo_path: string | null
          organizer_reliability_score: number | null
          reserved_claimed: number | null
          reserved_spots: number | null
          shuttles: string | null
          skill_tier_id: string | null
          skill_tier_label: string | null
          skill_tier_max_id: string | null
          skill_tier_max_label: string | null
          skill_tier_ordinal: number | null
          skill_tier_slug: string | null
          sport_id: string | null
          starts_at: string | null
          status: string | null
          venue_address: string | null
          venue_id: string | null
          venue_lat: number | null
          venue_lng: number | null
          venue_location: unknown
          venue_name: string | null
          venue_suburb: string | null
          verification_status: string | null
          visibility: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "game_formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_skill_tier_id_fkey"
            columns: ["skill_tier_id"]
            isOneToOne: false
            referencedRelation: "skill_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_queue: {
        Row: {
          author_id: string | null
          created_at: string | null
          detail: string | null
          id: string | null
          reason: string | null
          source: string | null
          status: string | null
          subject_id: string | null
          subject_type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_reply: {
        Args: { p_post_id: string; p_reply_id: string }
        Returns: undefined
      }
      achievement_week_streak: {
        Args: { p_profile_id: string }
        Returns: number
      }
      add_reserved_spot: {
        Args: { p_game_id: string; p_label?: string }
        Returns: string
      }
      approve_chat_photo: { Args: { p_message_id: string }; Returns: undefined }
      approve_join_action: {
        Args: { p_game_id: string; p_notification_id: string }
        Returns: undefined
      }
      approved_player_count: { Args: { p_game_id: string }; Returns: number }
      assert_is_organizer: { Args: { p_game_id: string }; Returns: undefined }
      auto_close_stale_chats: { Args: never; Returns: undefined }
      blocked_between: { Args: { a: string; b: string }; Returns: boolean }
      can_post_in_chat: {
        Args: { p_game_id: string; p_profile_id: string }
        Returns: boolean
      }
      can_rate_in_game: {
        Args: { p_game_id: string; p_profile_id: string }
        Returns: boolean
      }
      chat_push_recipients: {
        Args: { p_message_id: string }
        Returns: {
          profile_id: string
        }[]
      }
      chat_threads: {
        Args: never
        Returns: {
          chat_closed_at: string
          cover_key: string
          game_id: string
          game_status: string
          last_message_at: string
          last_message_body: string
          last_message_kind: string
          last_message_sender_is_me: boolean
          last_message_sender_name: string
          starts_at: string
          unread_count: number
          venue_name: string
        }[]
      }
      claim_reserved_spot: { Args: { p_token: string }; Returns: string }
      claimed_reserved_count: { Args: { p_game_id: string }; Returns: number }
      classify_post_text: {
        Args: { p_author_id: string; p_text: string }
        Returns: boolean
      }
      close_chat: { Args: { p_game_id: string }; Returns: undefined }
      club_seo_detail: { Args: { p_slug: string }; Returns: Json }
      club_seo_directory: {
        Args: never
        Returns: {
          hall_suburb: string
          indexable: boolean
          name: string
          slug: string
        }[]
      }
      complete_past_games: { Args: never; Returns: undefined }
      create_game_with_spots: {
        Args: {
          p_auto_approve?: boolean
          p_cost_per_player_cents: number
          p_court_label?: string
          p_courts_booked: number
          p_cover_key?: string
          p_duration_minutes: number
          p_format_id?: string
          p_max_players: number
          p_notes?: string
          p_shuttles?: string
          p_skill_tier_id: string
          p_skill_tier_max_id?: string
          p_sport_id: string
          p_spots?: Json
          p_starts_at: string
          p_venue_id: string
          p_visibility?: string
        }
        Returns: string
      }
      create_post: {
        Args: {
          p_body?: string
          p_kind: string
          p_max_players?: number
          p_skill_tier_label?: string
          p_starts_at?: string
          p_venue_id?: string
        }
        Returns: string
      }
      create_reply: {
        Args: { p_body: string; p_post_id: string }
        Returns: string
      }
      create_reserved_spot_invite: {
        Args: { p_spot_id: string }
        Returns: string
      }
      decide_join_request: {
        Args: { approve: boolean; p_game_id: string; p_profile_id: string }
        Returns: undefined
      }
      decline_join_action: {
        Args: { p_game_id: string; p_notification_id: string }
        Returns: undefined
      }
      decline_reserved_spot: { Args: { p_token: string }; Returns: undefined }
      delete_account: { Args: { p_profile_id: string }; Returns: Json }
      delete_message: { Args: { p_message_id: string }; Returns: undefined }
      delete_push_receipts: {
        Args: { p_ticket_ids: string[] }
        Returns: undefined
      }
      delete_push_token: { Args: { p_expo_token: string }; Returns: undefined }
      dispatch_attendance_prompts: { Args: never; Returns: undefined }
      dispatch_game_reminders: { Args: never; Returns: undefined }
      dispatch_notification_retries: { Args: never; Returns: undefined }
      dispatch_nudge_pending_requests: { Args: never; Returns: undefined }
      dispatch_nudge_underfilled: { Args: never; Returns: undefined }
      dispatch_post_game_prompts: { Args: never; Returns: undefined }
      enqueue_notifications: {
        Args: {
          p_actor_id: string
          p_collapse_key?: string
          p_game_id: string
          p_params?: Json
          p_priority?: string
          p_recipient_ids: string[]
          p_type: string
        }
        Returns: undefined
      }
      enqueue_post_game_rate: {
        Args: { p_game_id: string }
        Returns: undefined
      }
      feed_home:
        | {
            Args: {
              p_cursor_created_at?: string
              p_cursor_id?: string
              p_lat: number
              p_limit?: number
              p_lng: number
              p_radius_m: number
              p_sport_slug: string
            }
            Returns: {
              author_avatar_key: string
              author_display_name: string
              author_id: string
              author_photo_path: string
              body: string
              club_id: string
              created_at: string
              distance_bucket: string
              game_id: string
              id: string
              is_followed_author: boolean
              kind: string
              payload: Json
              reaction_count: number
              reply_count: number
              venue_id: string
              venue_name: string
            }[]
          }
        | {
            Args: {
              p_cursor_created_at?: string
              p_cursor_id?: string
              p_kind?: string[]
              p_lat: number
              p_limit?: number
              p_lng: number
              p_mode?: string
              p_radius_m: number
              p_sport_slug: string
            }
            Returns: {
              author_avatar_key: string
              author_display_name: string
              author_id: string
              author_photo_path: string
              body: string
              club_id: string
              created_at: string
              distance_bucket: string
              game_id: string
              id: string
              is_followed_author: boolean
              kind: string
              payload: Json
              reaction_count: number
              reply_count: number
              venue_id: string
              venue_name: string
            }[]
          }
      filter_quiet_recipients: {
        Args: { p_profile_ids: string[] }
        Returns: string[]
      }
      followers_of: {
        Args: { target_id: string }
        Returns: {
          avatar_key: string
          display_name: string
          home_suburb: string
          id: string
          is_following: boolean
          photo_path: string
        }[]
      }
      following_of: {
        Args: { target_id: string }
        Returns: {
          avatar_key: string
          display_name: string
          home_suburb: string
          id: string
          is_following: boolean
          photo_path: string
        }[]
      }
      game_preview: {
        Args: { p_game_id: string }
        Returns: {
          cost_per_player_cents: number
          ends_at: string
          id: string
          max_players: number
          skill_tier_label: string
          sport_slug: string
          starts_at: string
          status: string
          venue_name: string
          venue_suburb: string
        }[]
      }
      invite_to_reserved_spot: {
        Args: { p_profile_id: string; p_spot_id: string }
        Returns: undefined
      }
      is_approved_player: {
        Args: { p_game_id: string; p_profile_id: string }
        Returns: boolean
      }
      leave_game: { Args: { p_game_id: string }; Returns: undefined }
      list_replies: {
        Args: { p_post_id: string }
        Returns: {
          author_avatar_key: string
          author_display_name: string
          author_id: string
          author_photo_path: string
          body: string
          created_at: string
          id: string
          is_accepted: boolean
          post_id: string
        }[]
      }
      mark_attendance: {
        Args: { p_game_id: string; p_no_shows?: string[] }
        Returns: undefined
      }
      my_reacted_post_ids: { Args: { p_post_ids: string[] }; Returns: string[] }
      nearby_games: {
        Args: {
          from_ts?: string
          has_spots_only?: boolean
          lat: number
          lng: number
          max_cost_per_player_cents?: number
          p_amenity_slugs?: string[]
          p_exclude_mine?: boolean
          radius_m: number
          sort_by?: string
          sport_slug: string
          tier_slugs?: string[]
          to_ts?: string
          verified_only?: boolean
        }
        Returns: {
          approved_count: number
          cost_per_player_cents: number
          court_label: string
          courts_booked: number
          cover_key: string
          distance_m: number
          duration_minutes: number
          ends_at: string
          format_label: string
          id: string
          max_players: number
          notes: string
          open_spots: number
          organizer_avatar_key: string
          organizer_display_name: string
          organizer_hosted_count: number
          organizer_id: string
          organizer_photo_path: string
          organizer_reliability_score: number
          reserved_claimed: number
          reserved_spots: number
          skill_tier_label: string
          skill_tier_max_label: string
          skill_tier_ordinal: number
          skill_tier_slug: string
          starts_at: string
          status: string
          venue_address: string
          venue_lat: number
          venue_lng: number
          venue_name: string
          venue_suburb: string
          verification_status: string
        }[]
      }
      nearby_games_public: {
        Args: {
          from_ts?: string
          has_spots_only?: boolean
          lat: number
          lng: number
          max_cost_per_player_cents?: number
          p_amenity_slugs?: string[]
          radius_m: number
          sort_by?: string
          sport_slug: string
          tier_slugs?: string[]
          to_ts?: string
          verified_only?: boolean
        }
        Returns: {
          approved_count: number
          cost_per_player_cents: number
          court_label: string
          courts_booked: number
          cover_key: string
          distance_m: number
          duration_minutes: number
          ends_at: string
          id: string
          max_players: number
          open_spots: number
          reserved_claimed: number
          reserved_spots: number
          skill_tier_label: string
          skill_tier_ordinal: number
          skill_tier_slug: string
          starts_at: string
          status: string
          venue_lat: number
          venue_lng: number
          venue_name: string
          venue_suburb: string
          verification_status: string
        }[]
      }
      notification_pref_enabled: {
        Args: { p_pref_key: string; p_profile_id: string }
        Returns: boolean
      }
      notification_unread_count: {
        Args: { p_profile_id: string }
        Returns: number
      }
      notify_push: { Args: { p_payload: Json }; Returns: undefined }
      open_rateable_count: { Args: { p_game_id: string }; Returns: number }
      open_spots: { Args: { p_game_id: string }; Returns: number }
      peer_skill_vote: {
        Args: { p_profile_id: string; p_sport_slug?: string }
        Returns: {
          tier_label: string
          tier_ordinal: number
          tier_slug: string
          vote_count: number
        }[]
      }
      player_card: {
        Args: { target_id: string }
        Returns: {
          avatar_key: string
          badge_counts: Json
          display_name: string
          follower_count: number
          following_count: number
          games_hosted: number
          games_played: number
          games_together: number
          home_suburb: string
          host_badge_counts: Json
          host_rating_avg: number
          host_rating_count: number
          id: string
          is_following: boolean
          member_since: string
          peer_skill_label: string
          peer_skill_votes: number
          photo_path: string
          rating_avg: number
          rating_count: number
          reliability_band: string
          reliability_score: number
          restricted: boolean
          sports: Json
        }[]
      }
      post_game_roster: {
        Args: { p_game_id: string }
        Returns: {
          attended: boolean
          avatar_key: string
          declared_tier_label: string
          display_name: string
          is_host: boolean
          photo_path: string
          profile_id: string
          rated_host: boolean
          rated_player: boolean
          skill_voted: boolean
        }[]
      }
      preview_reserved_spot_invite: {
        Args: { p_token: string }
        Returns: {
          cost_per_player_cents: number
          game_id: string
          game_status: string
          host_name: string
          sport_name: string
          spot_label: string
          starts_at: string
          venue_name: string
          venue_suburb: string
        }[]
      }
      prune_ready_receipt_batch: {
        Args: { p_limit?: number }
        Returns: {
          expo_token: string
          ticket_id: string
        }[]
      }
      push_actor_name: { Args: { p_profile_id: string }; Returns: string }
      push_game_summary: {
        Args: { p_game_id: string }
        Returns: {
          approved_count: number
          court_label: string
          ends_at: string
          game_id: string
          host_id: string
          host_name: string
          max_players: number
          per_player_cents: number
          reserved_spots: number
          sport_name: string
          spots_left: number
          starts_at: string
          tier_name: string
          venue_name: string
          venue_suburb: string
          verification_status: string
        }[]
      }
      push_message_summary: {
        Args: { p_message_id: string }
        Returns: {
          body: string
          chat_mode: string
          is_host: boolean
          kind: string
          sender_name: string
          sport_name: string
          venue_name: string
        }[]
      }
      push_post_game_recipients: {
        Args: { p_game_id: string }
        Returns: {
          profile_id: string
        }[]
      }
      push_recipients_for_game: {
        Args: {
          p_exclude_profile?: string
          p_game_id: string
          p_include_requested?: boolean
          p_pref_key?: string
        }
        Returns: {
          profile_id: string
        }[]
      }
      push_recipients_for_host: {
        Args: { p_game_id: string; p_pref_key?: string }
        Returns: {
          profile_id: string
        }[]
      }
      rating_summary: {
        Args: { p_dimension?: string; p_profile_id: string }
        Returns: {
          badge_counts: Json
          distribution: Json
          rating_avg: number
          rating_count: number
        }[]
      }
      recompute_achievements: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      recompute_reliability_scores: { Args: never; Returns: undefined }
      remove_player: {
        Args: { p_game_id: string; p_profile_id: string }
        Returns: undefined
      }
      remove_reserved_spot: { Args: { p_spot_id: string }; Returns: undefined }
      rename_reserved_spot: {
        Args: { p_label: string; p_spot_id: string }
        Returns: undefined
      }
      report_content: {
        Args: {
          p_detail?: string
          p_reason: string
          p_reported_id: string
          p_subject_id: string
          p_subject_type: string
        }
        Returns: string
      }
      report_user: {
        Args: {
          p_context_game_id?: string
          p_detail?: string
          p_reason: string
          p_reported_id: string
        }
        Returns: string
      }
      report_venue_correction: {
        Args: {
          p_field: string
          p_note?: string
          p_suggested_value?: string
          p_venue_id: string
        }
        Returns: string
      }
      request_to_join: { Args: { p_game_id: string }; Returns: undefined }
      respond_to_game_invite: {
        Args: { p_accept: boolean; p_game_id: string }
        Returns: undefined
      }
      send_chat_reply: {
        Args: { p_game_id: string; p_notification_id: string; p_text: string }
        Returns: undefined
      }
      set_chat_broadcast_settings: {
        Args: {
          p_game_id: string
          p_pause_until: string
          p_photo_approval: boolean
        }
        Returns: undefined
      }
      set_chat_mode: {
        Args: { p_game_id: string; p_mode: string }
        Returns: undefined
      }
      set_home_point: {
        Args: { p_lat: number; p_lng: number }
        Returns: undefined
      }
      set_player_chat_mute: {
        Args: { p_game_id: string; p_muted: boolean; p_profile_id: string }
        Returns: undefined
      }
      suggested_players_to_follow: {
        Args: {
          p_lat: number
          p_limit?: number
          p_lng: number
          p_radius_m?: number
        }
        Returns: {
          avatar_key: string
          display_name: string
          home_suburb: string
          id: string
          photo_path: string
          skill_tier_label: string
        }[]
      }
      system_close_chat: {
        Args: { p_actor_id: string; p_game_id: string }
        Returns: undefined
      }
      time_in_window: {
        Args: { p_end: string; p_start: string; p_t: string }
        Returns: boolean
      }
      toggle_message_reaction: {
        Args: { p_emoji: string; p_message_id: string }
        Returns: boolean
      }
      toggle_reaction: { Args: { p_post_id: string }; Returns: boolean }
      trigger_purge_confirmations: {
        Args: { p_type: string }
        Returns: undefined
      }
      upsert_places_venue: {
        Args: {
          p_address: string
          p_google_place_id: string
          p_lat: number
          p_lng: number
          p_name: string
          p_state: string
          p_suburb: string
        }
        Returns: string
      }
      venue_detail: { Args: { p_venue_id: string }; Returns: Json }
      venue_seo_detail: { Args: { p_identifier: string }; Returns: Json }
      venue_seo_directory: {
        Args: never
        Returns: {
          courts_total: number
          dedicated: boolean
          name: string
          region: string
          slug: string
          suburb: string
        }[]
      }
      venues_directory: {
        Args: {
          p_amenity_slugs?: string[]
          p_bookable_now?: boolean
          p_dedicated?: boolean
          p_limit?: number
          p_min_courts?: number
          p_offset?: number
          p_search?: string
          p_state?: string
        }
        Returns: {
          bookability: string
          cheapest_cents: number
          cheapest_unit: string
          confidence: string
          courts_badminton: number
          dedicated: boolean
          has_profile: boolean
          id: string
          lat: number
          lng: number
          name: string
          photo_path: string
          state: string
          suburb: string
          surface: string
          total_count: number
          verified_at: string
        }[]
      }
      venues_near: {
        Args: { lat: number; lng: number; radius_m: number }
        Returns: {
          address: string
          amenity_flags: string[]
          bookability: string
          courts_badminton: number
          dedicated: boolean
          has_profile: boolean
          id: string
          lat: number
          lng: number
          name: string
          opening_hours: Json
          state: string
          suburb: string
        }[]
      }
      waitlist_count: { Args: { p_game_id: string }; Returns: number }
      waitlist_position: { Args: { p_game_id: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

