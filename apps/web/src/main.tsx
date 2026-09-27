import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter, Navigate } from 'react-router-dom';
import './styles/global.css';
import { ToastHost } from './ui/kit.js';
import { RequireSession } from './pages/RequireSession.js';
import { Shell } from './layout/Shell.js';
import { LoginPage } from './pages/Login.js';
import { AppsPage } from './pages/Apps.js';
import { NewAppPage } from './pages/NewApp.js';
import { AppDetailPage } from './pages/AppDetail.js';
import { ActivityPage } from './pages/Activity.js';
import { SettingsPage } from './pages/Settings.js';
import { NotFoundPage } from './pages/NotFound.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The dashboard is for one person on a home server, so a short stale time
      // and refetch on focus keep it honest without hammering the Pi.
      staleTime: 3000,
      refetchOnWindowFocus: true,
      retry: (count, error) => {
        const status = (error as { status?: number }).status;
        if (status === 401 || status === 404) return false;
        return count < 2;
      },
    },
  },
});

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireSession />,
    children: [
      {
        element: <Shell />,
        children: [
          { index: true, element: <Navigate to="/apps" replace /> },
          { path: 'apps', element: <AppsPage /> },
          { path: 'apps/new', element: <NewAppPage /> },
          { path: 'apps/:id', element: <AppDetailPage /> },
          { path: 'activity', element: <ActivityPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

const root = document.getElementById('root');
if (!root) throw new Error('The page is missing its root element.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastHost>
        <RouterProvider router={router} />
      </ToastHost>
    </QueryClientProvider>
  </StrictMode>,
);
