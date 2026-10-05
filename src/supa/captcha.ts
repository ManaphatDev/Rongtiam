// Cloudflare Turnstile token for anonymous sign-in (only when VITE_TURNSTILE_SITEKEY is set).

const siteKey = import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined;

interface Turnstile {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}

let loading: Promise<Turnstile> | null = null;

function load(): Promise<Turnstile> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve((window as unknown as { turnstile: Turnstile }).turnstile);
    s.onerror = () => reject(new Error('โหลดระบบยืนยันตัวตนไม่ได้'));
    document.head.appendChild(s);
  });
  return loading;
}

/** Resolves with a token, or undefined when Turnstile is not configured. */
export async function captchaToken(host: HTMLElement): Promise<string | undefined> {
  if (!siteKey) return undefined;
  const ts = await load();
  return new Promise((resolve, reject) => {
    const id = ts.render(host, {
      sitekey: siteKey,
      callback: (token: string) => {
        resolve(token);
        setTimeout(() => ts.remove(id));
      },
      'error-callback': () => reject(new Error('ยืนยันตัวตนไม่สำเร็จ ลองรีเฟรชหน้า')),
    });
  });
}
