import { useQuery } from "@tanstack/react-query";
import type { ChatList, Sermon } from "@shared/schemas";
import { api } from "./api";

export const useSermons = () =>
  useQuery({
    queryKey: ["sermons"],
    queryFn: () => api.get<{ sermons: Sermon[]; stale: boolean }>("/app/sermons"),
    staleTime: 10 * 60_000,
  });

/** My group and team chats. */
export const useChats = (refetchInterval = 30_000) =>
  useQuery({ queryKey: ["chats"], queryFn: () => api.get<ChatList>("/app/chats"), refetchInterval });

export const unreadCount = (chats: ChatList | undefined) =>
  [...(chats?.groups ?? []), ...(chats?.teams ?? [])].reduce((n, c) => n + c.unread, 0);
