/**
 * Single documented public base URL for gallery links and QR codes, so printed QRs keep working
 * across deployments on the same production domain. Override at build time with VITE_PUBLIC_BASE_URL.
 */
export const PUBLIC_BASE_URL: string = import.meta.env.VITE_PUBLIC_BASE_URL || 'https://web-ar-gold.vercel.app/';

export function publicExperienceUrl(id: string): string {
  const url = new URL(PUBLIC_BASE_URL);
  url.search = '';
  url.hash = '';
  url.searchParams.set('exp', id);
  return url.toString();
}
