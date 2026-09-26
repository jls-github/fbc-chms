import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttendanceEventType, MemberStatus, UserRole } from "@shared/constants";
import type {
  AttendanceInput,
  AttendanceReport,
  Dashboard,
  Family,
  Group,
  MemberDetail,
  MemberInput,
  MemberSummary,
  SearchResult,
  Team,
} from "@shared/schemas";
import { api } from "./api";

export type User = { id: number; email: string; name: string | null; role: UserRole; createdAt: string };

/** Anything that changes people or memberships can affect most screens; keep it simple and refetch them. */
const PEOPLE_KEYS = [["members"], ["member"], ["families"], ["family"], ["groups"], ["group"], ["teams"], ["team"], ["dashboard"]];

function useInvalidate() {
  const qc = useQueryClient();
  return (keys: unknown[][] = PEOPLE_KEYS) => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

// ------------------------------------------------------------------- auth

export const useMe = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ user: User }>("/auth/me").then((r) => r.user),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => api.post<{ user: User }>("/auth/login", input),
    onSuccess: ({ user }) => qc.setQueryData(["me"], user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(["me"], null);
    },
  });
}

// ------------------------------------------------------------------ people

export const useDashboard = () => useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/dashboard") });

export const useMembers = (params: { q?: string; status?: MemberStatus } = {}) => {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  const qs = search.toString();
  return useQuery({
    queryKey: ["members", params],
    queryFn: () => api.get<{ members: MemberSummary[] }>(`/members${qs ? `?${qs}` : ""}`).then((r) => r.members),
    placeholderData: keepPreviousData,
  });
};

export const useMember = (id: number) =>
  useQuery({
    queryKey: ["member", id],
    queryFn: () => api.get<{ member: MemberDetail }>(`/members/${id}`).then((r) => r.member),
    enabled: id > 0,
  });

export function useSaveMember(id?: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: Partial<MemberInput>) =>
      (id ? api.patch<{ member: MemberDetail }>(`/members/${id}`, input) : api.post<{ member: MemberDetail }>("/members", input)).then(
        (r) => r.member,
      ),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteMember() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: number) => api.delete(`/members/${id}`), onSuccess: () => invalidate() });
}

export const useFamilies = () =>
  useQuery({ queryKey: ["families"], queryFn: () => api.get<{ families: Family[] }>("/families").then((r) => r.families) });

export const useFamily = (id: number) =>
  useQuery({ queryKey: ["family", id], queryFn: () => api.get<{ family: Family }>(`/families/${id}`).then((r) => r.family) });

export function useSaveFamily(id?: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { name?: string; memberIds?: number[] }) =>
      (id ? api.patch<{ family: Family }>(`/families/${id}`, input) : api.post<{ family: Family }>("/families", input)).then(
        (r) => r.family,
      ),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteFamily() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: number) => api.delete(`/families/${id}`), onSuccess: () => invalidate() });
}

// ---------------------------------------------------------- groups & teams

export const useGroups = () =>
  useQuery({ queryKey: ["groups"], queryFn: () => api.get<{ groups: Group[] }>("/groups").then((r) => r.groups) });

export const useGroup = (id: number) =>
  useQuery({ queryKey: ["group", id], queryFn: () => api.get<{ group: Group }>(`/groups/${id}`).then((r) => r.group) });

type GroupFields = { name?: string; meetingTime?: string | null; meetingLocation?: string | null; description?: string | null };

export function useSaveGroup(id?: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: GroupFields) =>
      (id ? api.patch<{ group: Group }>(`/groups/${id}`, input) : api.post<{ group: Group }>("/groups", input)).then((r) => r.group),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteGroup() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: number) => api.delete(`/groups/${id}`), onSuccess: () => invalidate() });
}

export function useGroupMembership(groupId: number) {
  const invalidate = useInvalidate();
  return {
    add: useMutation({
      mutationFn: (memberId: number) => api.post(`/groups/${groupId}/members`, { memberId }),
      onSuccess: () => invalidate(),
    }),
    remove: useMutation({
      mutationFn: (memberId: number) => api.delete(`/groups/${groupId}/members/${memberId}`),
      onSuccess: () => invalidate(),
    }),
  };
}

export const useTeams = () =>
  useQuery({ queryKey: ["teams"], queryFn: () => api.get<{ teams: Team[] }>("/teams").then((r) => r.teams) });

export const useTeam = (id: number) =>
  useQuery({ queryKey: ["team", id], queryFn: () => api.get<{ team: Team }>(`/teams/${id}`).then((r) => r.team) });

type TeamFields = { name?: string; description?: string | null; leaderId?: number | null };

export function useSaveTeam(id?: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: TeamFields) =>
      (id ? api.patch<{ team: Team }>(`/teams/${id}`, input) : api.post<{ team: Team }>("/teams", input)).then((r) => r.team),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTeam() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: number) => api.delete(`/teams/${id}`), onSuccess: () => invalidate() });
}

export function useTeamMembership(teamId: number) {
  const invalidate = useInvalidate();
  return {
    add: useMutation({
      mutationFn: (input: { memberId: number; role?: string | null }) => api.post(`/teams/${teamId}/members`, input),
      onSuccess: () => invalidate(),
    }),
    setRole: useMutation({
      mutationFn: ({ memberId, role }: { memberId: number; role: string | null }) =>
        api.patch(`/teams/${teamId}/members/${memberId}`, { role }),
      onSuccess: () => invalidate(),
    }),
    remove: useMutation({
      mutationFn: (memberId: number) => api.delete(`/teams/${teamId}/members/${memberId}`),
      onSuccess: () => invalidate(),
    }),
  };
}

// -------------------------------------------------------------- attendance

export const useAttendance = (eventType?: AttendanceEventType) =>
  useQuery({
    queryKey: ["attendance", eventType ?? "all"],
    queryFn: () =>
      api.get<{ reports: AttendanceReport[] }>(`/attendance${eventType ? `?eventType=${eventType}` : ""}`).then((r) => r.reports),
    placeholderData: keepPreviousData,
  });

export function useSaveAttendance(id?: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: AttendanceInput) =>
      id ? api.patch<{ report: AttendanceReport }>(`/attendance/${id}`, input) : api.post<{ report: AttendanceReport }>("/attendance", input),
    onSuccess: () => invalidate([["attendance"], ["dashboard"]]),
  });
}

export function useDeleteAttendance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/attendance/${id}`),
    onSuccess: () => invalidate([["attendance"], ["dashboard"]]),
  });
}

// ------------------------------------------------------ search & settings

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ["search", q],
    queryFn: () => api.get<SearchResult>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
  });

export const useUsers = (enabled: boolean) =>
  useQuery({ queryKey: ["users"], queryFn: () => api.get<{ users: User[] }>("/users").then((r) => r.users), enabled });

export function useCreateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { email: string; name: string; role: UserRole; password: string }) => api.post("/users", input),
    onSuccess: () => invalidate([["users"]]),
  });
}

export function useUpdateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number; role?: UserRole; name?: string | null }) => api.patch(`/users/${id}`, input),
    onSuccess: () => invalidate([["users"], ["me"]]),
  });
}

export function useDeleteUser() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: number) => api.delete(`/users/${id}`), onSuccess: () => invalidate([["users"]]) });
}
