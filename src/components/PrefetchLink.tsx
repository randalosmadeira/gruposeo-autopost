import { Link, LinkProps } from 'react-router-dom';
import { useCallback } from 'react';

// Map routes to their lazy-loaded modules
const routeModules: Record<string, () => Promise<unknown>> = {
  '/': () => import('@/pages/DashboardNew'),
  '/articles': () => import('@/pages/ArticlesList'),
  '/articles/new': () => import('@/pages/ArticleTypeSelection'),
  '/articles/bulk': () => import('@/pages/ArticleTypeSelection'),
  '/authority-planner': () => import('@/pages/AuthorityPlanner'),
  '/news-agents': () => import('@/pages/NewsAgents'),
  '/news-agents/new': () => import('@/pages/CreateNewsAgent'),
  '/projects': () => import('@/pages/ProjectsList'),
  '/settings': () => import('@/pages/SettingsPage'),
};

interface PrefetchLinkProps extends LinkProps {
  prefetchOnHover?: boolean;
}

export function PrefetchLink({ 
  to, 
  prefetchOnHover = true, 
  onMouseEnter,
  onFocus,
  ...props 
}: PrefetchLinkProps) {
  const prefetch = useCallback(() => {
    const path = typeof to === 'string' ? to : to.pathname;
    if (path && routeModules[path]) {
      // Trigger the module import to prefetch it
      routeModules[path]();
    }
  }, [to]);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (prefetchOnHover) {
        prefetch();
      }
      onMouseEnter?.(e);
    },
    [prefetch, prefetchOnHover, onMouseEnter]
  );

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLAnchorElement>) => {
      if (prefetchOnHover) {
        prefetch();
      }
      onFocus?.(e);
    },
    [prefetch, prefetchOnHover, onFocus]
  );

  return (
    <Link
      to={to}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      {...props}
    />
  );
}
