import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { App, AppDetail } from '@rig/shared/client';
import { api, type ActivityEntry, type AppTraffic, type ServerInfo } from './api.js';

export const keys = {
  me: ['me'] as const,
  serverInfo: ['server-info'] as const,
  apps: ['apps'] as const,
  app: (id: string) => ['apps', id] as const,
  progress: (id: string) => ['apps', id, 'progress'] as const,
  stats: (id: string) => ['apps', id, 'stats'] as const,
  traffic: (id: string) => ['apps', id, 'traffic'] as const,
  activity: ['activity'] as const,
  health: ['health'] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: api.me, retry: false, staleTime: 60_000 });
}

export function useServerInfo(): UseQueryResult<ServerInfo> {
  return useQuery({ queryKey: keys.serverInfo, queryFn: api.serverInfo, staleTime: 5 * 60_000 });
}

/** While anything is deploying the list refreshes quickly, then settles down. */
export function useApps() {
  return useQuery({
    queryKey: keys.apps,
    queryFn: api.apps,
    refetchInterval: (query) => {
      const apps = query.state.data as App[] | undefined;
      return apps?.some((app) => app.status === 'deploying') ? 1500 : 10_000;
    },
  });
}

export function useApp(id: string) {
  return useQuery({
    queryKey: keys.app(id),
    queryFn: () => api.app(id),
    refetchInterval: (query) => {
      const app = query.state.data as AppDetail | undefined;
      return app?.status === 'deploying' ? 1200 : 8000;
    },
  });
}

export function useDeployProgress(id: string, active: boolean) {
  return useQuery({
    queryKey: keys.progress(id),
    queryFn: () => api.progress(id),
    refetchInterval: active ? 900 : false,
    enabled: active,
  });
}

export function useStats(id: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.stats(id),
    queryFn: () => api.stats(id),
    refetchInterval: enabled ? 3000 : false,
    enabled,
    retry: false,
  });
}

/** Traefik is sampled every 30 seconds, so refreshing faster shows nothing new. */
export function useTraffic(id: string, enabled: boolean) {
  return useQuery<AppTraffic>({
    queryKey: keys.traffic(id),
    queryFn: () => api.traffic(id),
    refetchInterval: enabled ? 15_000 : false,
    enabled,
  });
}

export function useActivity() {
  return useQuery<ActivityEntry[]>({ queryKey: keys.activity, queryFn: api.activity, refetchInterval: 15_000 });
}

export function useHealth() {
  return useQuery({ queryKey: keys.health, queryFn: api.health, refetchInterval: 30_000, retry: false });
}

/** Any change to an app can change the list, the detail and the activity feed. */
export function useAppAction(id: string) {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.apps });
    void client.invalidateQueries({ queryKey: keys.app(id) });
    void client.invalidateQueries({ queryKey: keys.activity });
  };

  return {
    start: useMutation({ mutationFn: () => api.start(id), onSuccess: refresh }),
    stop: useMutation({ mutationFn: () => api.stop(id), onSuccess: refresh }),
    restart: useMutation({ mutationFn: () => api.restart(id), onSuccess: refresh }),
    redeploy: useMutation({ mutationFn: () => api.redeploy(id), onSuccess: refresh }),
    remove: useMutation({
      mutationFn: () => api.deleteApp(id),
      onSuccess: () => {
        client.removeQueries({ queryKey: keys.app(id) });
        void client.invalidateQueries({ queryKey: keys.apps });
        void client.invalidateQueries({ queryKey: keys.activity });
      },
    }),
    update: useMutation({
      mutationFn: (input: Parameters<typeof api.updateApp>[1]) => api.updateApp(id, input),
      onSuccess: refresh,
    }),
  };
}

export function useListAction() {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.apps });
    void client.invalidateQueries({ queryKey: keys.activity });
  };
  return {
    start: useMutation({ mutationFn: (id: string) => api.start(id), onSuccess: refresh }),
    stop: useMutation({ mutationFn: (id: string) => api.stop(id), onSuccess: refresh }),
  };
}
