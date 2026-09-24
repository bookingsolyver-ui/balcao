const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isValidEmail = (v: string): boolean => EMAIL_RE.test(v.trim()) && v.trim().length <= 160;
