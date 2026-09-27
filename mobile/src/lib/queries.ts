import { useQuery } from "@tanstack/react-query";
import type { ChatGroup, Sermon } from "@shared/schemas";
import { api } from "./api";

export const useSermons = () =>
  useQuery({
    queryKey: ["sermons"],
    queryFn: () => api.get<{ sermons: Sermon[]; stale: boolean }>("/app/sermons"),
    staleTime: 10 * 60_000,
  });

export const useGroups = (refetchInterval = 30_000) =>
  useQuery({ queryKey: ["groups"], queryFn: () => api.get<{ groups: ChatGroup[] }>("/app/groups"), refetchInterval });
