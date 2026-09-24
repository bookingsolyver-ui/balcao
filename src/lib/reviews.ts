export interface ReviewRow { id: string; rating: number; body: string; author_name: string; created_at: string }
export interface ReviewForm { rating: number; body: string; authorName: string }
export type ReviewError = 'rating' | 'body' | 'author_name';
export interface ReviewValue { rating: number; body: string; author_name: string }

export function buildReview(f: ReviewForm): { ok: true; value: ReviewValue } | { ok: false; error: ReviewError } {
  if (!Number.isInteger(f.rating) || f.rating < 1 || f.rating > 5) return { ok: false, error: 'rating' };
  const body = f.body.trim();
  if (body.length < 10 || body.length > 500) return { ok: false, error: 'body' };
  const authorName = f.authorName.trim();
  if (authorName.length < 2 || authorName.length > 80) return { ok: false, error: 'author_name' };
  return { ok: true, value: { rating: f.rating, body, author_name: authorName } };
}
export const emptyReviewForm = (suggestedName: string): ReviewForm => ({ rating: 5, body: '', authorName: suggestedName });
export const toReviewForm = (r: ReviewRow | null, suggestedName: string): ReviewForm =>
  r ? { rating: r.rating, body: r.body, authorName: r.author_name } : emptyReviewForm(suggestedName);
