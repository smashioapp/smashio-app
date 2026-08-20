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
      game_players: {
        Row: {
          chat_muted_at: string | null
          decided_at: string | null
          game_id: string
          profile_id: string
          requested_at: string
          status: string
        }
        Insert: {
          chat_muted_at?: string | null
          decided_at?: string | null
          game_id: string
          profile_id: string
          requested_at?: string
          status?: string
        }
        Update: {
          chat_muted_at?: string | null
          decided_at?: string | null
          game_id?: string
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
      games: {
        Row: {
          chat_closed_at: string | null
          chat_mode: string
          cost_per_player_cents: number
          court_label: string | null
          courts_booked: number
          created_at: string
          duration_hours: number
          ends_at: string
          id: string
          max_players: number
          organizer_id: string
          reminded_24h_at: string | null
          rate_prompted_at: string | null
          reminded_at: string | null
          reserved_spots: number
          skill_tier_id: string
          sport_id: string
          starts_at: string
          status: string
          venue_id: string
          verification_status: string
        }
        Insert: {
          chat_closed_at?: string | null
          chat_mode?: string
          cost_per_player_cents?: number
          court_label?: string | null
          courts_booked?: number
          created_at?: string
          duration_hours?: number
          ends_at: string
          id?: string
          max_players: number
          organizer_id: string
          reminded_24h_at?: string | null
          rate_prompted_at?: string | null
          reminded_at?: string | null
          reserved_spots?: number
          skill_tier_id: string
          sport_id: string
          starts_at: string
          status?: string
          venue_id: string
          verification_status?: string
        }
        Update: {
          chat_closed_at?: string | null
          chat_mode?: string
          cost_per_player_cents?: number
          court_label?: string | null
          courts_booked?: number
          created_at?: string
          duration_hours?: number
          ends_at?: string
          id?: string
          max_players?: number
          organizer_id?: string
          reminded_24h_at?: string | null
          rate_prompted_at?: string | null
          reminded_at?: string | null
          reserved_spots?: number
          skill_tier_id?: string
          sport_id?: string
          starts_at?: string
          status?: string
          venue_id?: string
          verification_status?: string
        }
        Relationships: [
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
          body: string
          client_id: string | null
          created_at: string
          deleted_at: string | null
          game_id: string
          id: string
          image_path: string | null
          kind: string
          mentions: string[]
          sender_id: string | null
          system_event: string | null
        }
        Insert: {
          body?: string
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          game_id: string
          id?: string
          image_path?: string | null
          kind?: string
          mentions?: string[]
          sender_id?: string | null
          system_event?: string | null
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          game_id?: string
          id?: string
          image_path?: string | null
          kind?: string
          mentions?: string[]
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
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
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
          created_at: string
          deleted_at: string | null
          display_name: string
          home_point: unknown
          home_suburb: string | null
          id: string
          photo_path: string | null
          referred_by: string | null
          reliability_score: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          home_point?: unknown
          home_suburb?: string | null
          id: string
          photo_path?: string | null
          referred_by?: string | null
          reliability_score?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          home_point?: unknown
          home_suburb?: string | null
          id?: string
          photo_path?: string | null
          referred_by?: string | null
          reliability_score?: number
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
          game_id: string
          ratee_id: string
          rater_id: string
          tag: string
        }
        Insert: {
          created_at?: string
          game_id: string
          ratee_id: string
          rater_id: string
          tag: string
        }
        Update: {
          created_at?: string
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
          game_id: string
          ratee_id: string
          rater_id: string
          stars: number
        }
        Insert: {
          created_at?: string
          game_id: string
          ratee_id: string
          rater_id: string
          stars: number
        }
        Update: {
          created_at?: string
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
          cost_per_player_cents: number | null
          court_label: string | null
          courts_booked: number | null
          created_at: string | null
          duration_hours: number | null
          ends_at: string | null
          id: string | null
          max_players: number | null
          organizer_display_name: string | null
          organizer_hosted_count: number | null
          organizer_id: string | null
          organizer_photo_path: string | null
          organizer_reliability_score: number | null
          reserved_spots: number | null
          skill_tier_id: string | null
          skill_tier_label: string | null
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
        }
        Relationships: [
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
    }
    Functions: {
      approved_player_count: { Args: { p_game_id: string }; Returns: number }
      auto_close_stale_chats: { Args: never; Returns: undefined }
      can_post_in_chat: {
        Args: { p_game_id: string; p_profile_id: string }
        Returns: boolean
      }
      chat_push_recipients: {
        Args: { p_message_id: string }
        Returns: {
          expo_token: string
          profile_id: string
        }[]
      }
      chat_threads: {
        Args: never
        Returns: {
          chat_closed_at: string
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
      close_chat: { Args: { p_game_id: string }; Returns: undefined }
      complete_past_games: { Args: never; Returns: undefined }
      decide_join_request: {
        Args: { approve: boolean; p_game_id: string; p_profile_id: string }
        Returns: undefined
      }
      delete_account: { Args: { p_profile_id: string }; Returns: Json }
      delete_message: { Args: { p_message_id: string }; Returns: undefined }
      dispatch_game_reminders: { Args: never; Returns: undefined }
      is_approved_player: {
        Args: { p_game_id: string; p_profile_id: string }
        Returns: boolean
      }
      leave_game: { Args: { p_game_id: string }; Returns: undefined }
      nearby_games: {
        Args: {
          from_ts?: string
          has_spots_only?: boolean
          lat: number
          lng: number
          max_cost_per_player_cents?: number
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
          distance_m: number
          duration_hours: number
          ends_at: string
          id: string
          max_players: number
          organizer_display_name: string
          organizer_hosted_count: number
          organizer_id: string
          organizer_photo_path: string
          organizer_reliability_score: number
          reserved_spots: number
          skill_tier_label: string
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
      notify_push: { Args: { p_payload: Json }; Returns: undefined }
      player_card: {
        Args: { target_id: string }
        Returns: {
          badge_counts: Json
          display_name: string
          games_hosted: number
          games_played: number
          games_together: number
          home_suburb: string
          id: string
          member_since: string
          photo_path: string
          rating_avg: number
          rating_count: number
          reliability_band: string
          reliability_score: number
          sports: Json
        }[]
      }
      push_game_summary: {
        Args: { p_game_id: string }
        Returns: {
          sport_name: string
          starts_at: string
          venue_name: string
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
          venue_name: string
        }[]
      }
      push_recipients_for_game: {
        Args: { p_exclude_profile?: string; p_game_id: string }
        Returns: {
          expo_token: string
          profile_id: string
        }[]
      }
      recompute_reliability_scores: { Args: never; Returns: undefined }
      remove_player: {
        Args: { p_game_id: string; p_profile_id: string }
        Returns: undefined
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
      venues_directory: {
        Args: {
          p_amenity_slug?: string
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
          state: string
          suburb: string
        }[]
      }
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

