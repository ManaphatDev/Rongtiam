// Minimal path router: /, /r/:slug, /local (dev only).
export type Route = { name: 'home' } | { name: 'room'; slug: string } | { name: 'local' } | { name: 'notfound' };

function parse(path: string): Route {
  if (path === '/' || path === '') return { name: 'home' };
  const m = path.match(/^\/r\/([1-9A-HJ-NP-Za-km-z]{10})\/?$/);
  if (m) return { name: 'room', slug: m[1] };
  if (path === '/local' && import.meta.env.DEV) return { name: 'local' };
  return { name: 'notfound' };
}

class Router {
  route = $state<Route>(parse(location.pathname));

  constructor() {
    window.addEventListener('popstate', () => (this.route = parse(location.pathname)));
  }

  go(path: string) {
    history.pushState(null, '', path);
    this.route = parse(path);
  }
}

export const router = new Router();
