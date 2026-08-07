import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase";

export function useVenues() {
  return useQuery({
    queryKey: ["venues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("venues").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}
