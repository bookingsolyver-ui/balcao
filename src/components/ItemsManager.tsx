'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, moneyLocale } from '@/lib/money';
import { buildItemPayload, EMOJIS, minorToInput, type ItemForm } from '@/lib/items';
import { resizeToJpeg } from '@/lib/image';
import { imageUrl, ITEM_BUCKET } from '@/lib/storage';
import { dbErrorKey } from '@/lib/errors';
import type { Category, Item } from '@/lib/types';

interface Props {
  tenant: { id: string; currency: string; decimals: number; country: string; lowStock: number };
  module: 'menu' | 'catalog';
  initialCategories: Category[];
  initialItems: Item[];
  canEdit: boolean;
}
type Dialog = { kind: 'item'; item?: Item } | { kind: 'cat'; cat?: Category } | null;
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };

export function ItemsManager({ tenant, module: mod, initialCategories, initialItems, canEdit }: Props) {
  const t = useTranslations('items');
  const locale = useLocale();
  const [cats, setCats] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const money = (n: number) => formatMoney(n, tenant.currency, moneyLocale(locale, tenant.country), tenant.decimals);

  const reload = useCallback(async () => {
    const sb = createClient();
    const [c, i] = await Promise.all([
      sb.from('categories').select('*').eq('tenant_id', tenant.id).eq('module', mod).order('position').order('name'),
      sb.from('items').select('*').eq('tenant_id', tenant.id).eq('module', mod).order('position').order('name'),
    ]);
    if (c.data) setCats(c.data as Category[]);
    if (i.data) setItems(i.data as Item[]);
  }, [tenant.id, mod]);

  async function run(fn: () => PromiseLike<{ error: { code?: string; message?: string } | null }>) {
    setNotice(null);
    const { error } = await fn();
    if (error) { const k = dbErrorKey(error); setNotice(t(`errors.${['forbidden', 'invalid_data'].includes(k) ? k : 'generic'}` as never)); }
    await reload();
  }
  const toggleActive = (i: Item) => run(() => createClient().from('items').update({ active: !i.active }).eq('id', i.id));
  const bumpStock = (i: Item, d: number) => run(() => createClient().from('items').update({ stock: Math.max(0, (i.stock ?? 0) + d) }).eq('id', i.id));
  async function removeItem(i: Item) {
    if (!window.confirm(t('confirmDelete', { name: i.name }))) return;
    await run(() => createClient().from('items').delete().eq('id', i.id));
    if (i.image_path) await createClient().storage.from(ITEM_BUCKET).remove([i.image_path]);
  }
  async function removeCat(c: Category) {
    if (!window.confirm(t('confirmDeleteCategory', { name: c.name }))) return;
    await run(() => createClient().from('categories').delete().eq('id', c.id));
  }

  const groups = useMemo(() => {
    const g = cats.map((c) => ({ cat: c as Category | null, list: items.filter((i) => i.category_id === c.id) }));
    const orphan = items.filter((i) => !cats.some((c) => c.id === i.category_id));
    if (orphan.length) g.push({ cat: null, list: orphan });
    return g;
  }, [cats, items]);

  return (
    <>
      {!canEdit && <p className="card sm muted" style={{ marginBottom: 18 }}>{t('viewOnly')}</p>}
      {canEdit && (
        <div className="toolbar">
          <button className="btn" onClick={() => setDialog({ kind: 'item' })}>+ {t(`newItem.${mod}`)}</button>
          <button className="btn gray" onClick={() => setDialog({ kind: 'cat' })}>+ {t('newCategory')}</button>
        </div>
      )}
      {notice && <p className="err" role="alert" style={{ marginBottom: 12 }}>{notice}</p>}

      {items.length === 0 && cats.length === 0 && <div className="card muted">{t(`empty.${mod}`)}</div>}

      {groups.map((g) => (
        <section key={g.cat?.id ?? 'none'}>
          <div className="group-t">
            <span>{g.cat ? g.cat.name : t('noCategory')} · {g.list.length}</span>
            {canEdit && g.cat && (
              <span>
                <button className="iconbtn" onClick={() => setDialog({ kind: 'cat', cat: g.cat! })}>{t('edit')}</button>
                <button className="iconbtn bad" onClick={() => removeCat(g.cat!)}>{t('delete')}</button>
              </span>
            )}
          </div>
          {g.list.length === 0 ? <p className="muted small" style={{ padding: '0 4px' }}>{t('emptyCategory')}</p> : (
            <div className="list">
              {g.list.map((i) => (
                <div className="row" key={i.id} style={{ opacity: i.active ? 1 : 0.6 }}>
                  <span className="th" style={{ ['--h' as string]: hue(i.name) }}>
                    {i.image_path ? <img src={imageUrl(i.image_path)} alt="" loading="lazy" /> : (i.emoji ?? '•')}
                  </span>
                  <div className="g">
                    <strong>{i.name}</strong>
                    <small>
                      {i.promo_minor != null && i.promo_minor < i.price_minor ? <><s>{money(i.price_minor)}</s> {money(i.promo_minor)}</> : money(i.price_minor)}
                      {i.description ? ` · ${i.description}` : ''}
                    </small>
                  </div>
                  <div className="r">
                    {mod === 'catalog' && (i.stock == null
                      ? <span className="badge">{t('noStock')}</span>
                      : <>
                          {i.stock === 0 ? <span className="badge bad">{t('soldOut')}</span> : i.stock <= tenant.lowStock ? <span className="badge warn">{t('lowStock')}</span> : null}
                          {canEdit ? (
                            <span className="stepper">
                              <button aria-label="−" onClick={() => bumpStock(i, -1)}>−</button><b>{i.stock}</b><button aria-label="+" onClick={() => bumpStock(i, 1)}>+</button>
                            </span>
                          ) : <b>{i.stock}</b>}
                        </>)}
                    {canEdit && (
                      <>
                        <label className="sw" title={t('available')}><input type="checkbox" checked={i.active} onChange={() => toggleActive(i)} aria-label={t('available')} /><i /></label>
                        <button className="iconbtn" onClick={() => setDialog({ kind: 'item', item: i })}>{t('edit')}</button>
                        <button className="iconbtn bad" onClick={() => removeItem(i)}>{t('delete')}</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      {dialog?.kind === 'item' && (
        <ItemDialog tenant={tenant} mod={mod} cats={cats} item={dialog.item} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await reload(); }} />
      )}
      {dialog?.kind === 'cat' && (
        <CategoryDialog tenantId={tenant.id} mod={mod} cat={dialog.cat} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await reload(); }} />
      )}
    </>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

function ItemDialog({ tenant, mod, cats, item, onClose, onSaved }: {
  tenant: Props['tenant']; mod: 'menu' | 'catalog'; cats: Category[]; item?: Item; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations('items');
  useEscape(onClose);
  const [f, setF] = useState<ItemForm>({
    name: item?.name ?? '', description: item?.description ?? '', price: minorToInput(item?.price_minor ?? null, tenant.decimals),
    promo: minorToInput(item?.promo_minor ?? null, tenant.decimals), stock: item?.stock == null ? (item ? '' : mod === 'catalog' ? '10' : '') : String(item.stock),
    emoji: item?.emoji ?? EMOJIS[mod][0], categoryId: item?.category_id ?? cats[0]?.id ?? '', active: item?.active ?? true,
  });
  const [newCat, setNewCat] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [removeImg, setRemoveImg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const preview = file ? URL.createObjectURL(file) : !removeImg && item?.image_path ? imageUrl(item.image_path) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const built = buildItemPayload(f, { currency: tenant.currency, decimals: tenant.decimals, module: mod });
    if (!built.ok) return setErr(built.error);
    setBusy(true); setErr(null);
    const sb = createClient();
    let uploaded: string | null = null;
    try {
      let categoryId = f.categoryId || null;
      if (newCat.trim()) {
        const { data, error } = await sb.from('categories').insert({ tenant_id: tenant.id, module: mod, name: newCat.trim() }).select('id').single();
        if (error) throw error;
        categoryId = data.id as string;
      }
      let imagePath = removeImg ? null : item?.image_path ?? null;
      if (file) {
        let blob: Blob;
        try { blob = await resizeToJpeg(file); } catch { setErr('upload'); return; }
        const path = `${tenant.id}/${crypto.randomUUID()}.jpg`;
        const up = await sb.storage.from(ITEM_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
        if (up.error) { setErr('upload'); return; }
        uploaded = imagePath = path;
      }
      const row = { ...built.payload, category_id: categoryId, image_path: imagePath };
      const { error } = item
        ? await sb.from('items').update(row).eq('id', item.id)
        : await sb.from('items').insert({ ...row, tenant_id: tenant.id, module: mod });
      if (error) throw error;
      if (item?.image_path && item.image_path !== imagePath) await sb.storage.from(ITEM_BUCKET).remove([item.image_path]);
      onSaved();
    } catch (ex) {
      if (uploaded) await sb.storage.from(ITEM_BUCKET).remove([uploaded]); // não deixa fotos órfãs se o guardar falhar
      const k = dbErrorKey(ex as { code?: string; message?: string });
      setErr(['forbidden', 'invalid_data'].includes(k) ? k : 'generic');
    } finally { setBusy(false); }
  }

  return (
    <div className="mbg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal form" role="dialog" aria-modal="true" aria-labelledby="item-title" onSubmit={save}>
        <h2 id="item-title">{item ? t(`editTitle.${mod}`) : t(`newItem.${mod}`)}</h2>
        <div className="field"><label htmlFor="i-name">{t('fName')}</label>
          <input id="i-name" className="input" required maxLength={120} value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></div>
        <div className="frow">
          <div className="field"><label htmlFor="i-cat">{t('fCategory')}</label>
            <select id="i-cat" className="input" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">{t('noCategory')}</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="field"><label htmlFor="i-newcat">{t('fNewCategory')}</label>
            <input id="i-newcat" className="input" value={newCat} maxLength={60} onChange={(e) => setNewCat(e.target.value)} /></div>
        </div>
        <div className="frow">
          <div className="field"><label htmlFor="i-price">{t('fPrice', { currency: tenant.currency })}</label>
            <input id="i-price" className="input" inputMode="decimal" required value={f.price} onChange={(e) => set('price', e.target.value)} /></div>
          <div className="field"><label htmlFor="i-promo">{t('fPromo')}</label>
            <input id="i-promo" className="input" inputMode="decimal" value={f.promo} onChange={(e) => set('promo', e.target.value)} /></div>
          {mod === 'catalog' && (
            <div className="field"><label htmlFor="i-stock">{t('fStock')}</label>
              <input id="i-stock" className="input" inputMode="numeric" value={f.stock} onChange={(e) => set('stock', e.target.value)} /></div>
          )}
        </div>
        <div className="field"><label htmlFor="i-desc">{t('fDescription')}</label>
          <textarea id="i-desc" className="input" maxLength={500} value={f.description} onChange={(e) => set('description', e.target.value)} /></div>
        <div className="field"><span className="lbl">{t('fIcon')}</span>
          <div className="emojis">{EMOJIS[mod].map((e) => <button type="button" key={e} aria-pressed={f.emoji === e} onClick={() => set('emoji', e)}>{e}</button>)}</div></div>
        <div className="field"><span className="lbl">{t('fPhoto')}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {preview && <span className="th"><img src={preview} alt="" /></span>}
            <label className="btn sm gray" style={{ cursor: 'pointer' }}>{t('choosePhoto')}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRemoveImg(false); }} /></label>
            {preview && <button type="button" className="link small" onClick={() => { setFile(null); setRemoveImg(true); }}>{t('removePhoto')}</button>}
          </div></div>
        <div className="row" style={{ padding: 0, minHeight: 0 }}><div className="g"><strong>{t('available')}</strong></div>
          <label className="sw"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /><i /></label></div>
        {err && <p className="err" role="alert">{t(`errors.${err}` as never)}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn gray" onClick={onClose}>{t('cancel')}</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? t('saving') : t('save')}</button>
        </div>
      </form>
    </div>
  );
}

function CategoryDialog({ tenantId, mod, cat, onClose, onSaved }: { tenantId: string; mod: 'menu' | 'catalog'; cat?: Category; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('items');
  useEscape(onClose);
  const [name, setName] = useState(cat?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr('name');
    setBusy(true); setErr(null);
    const sb = createClient();
    const { error } = cat
      ? await sb.from('categories').update({ name: name.trim() }).eq('id', cat.id)
      : await sb.from('categories').insert({ tenant_id: tenantId, module: mod, name: name.trim() });
    setBusy(false);
    if (error) { const k = dbErrorKey(error); return setErr(['forbidden', 'invalid_data'].includes(k) ? k : 'generic'); }
    onSaved();
  }
  return (
    <div className="mbg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal form" style={{ maxWidth: 440 }} role="dialog" aria-modal="true" aria-labelledby="cat-title" onSubmit={save}>
        <h2 id="cat-title">{cat ? t('renameCategory') : t('newCategory')}</h2>
        <div className="field"><label htmlFor="c-name">{t('fName')}</label>
          <input id="c-name" className="input" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        {err && <p className="err" role="alert">{t(`errors.${err}` as never)}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn gray" onClick={onClose}>{t('cancel')}</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? t('saving') : t('save')}</button>
        </div>
      </form>
    </div>
  );
}
