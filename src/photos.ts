// Photos des offres du marché : compression côté téléphone, envoi dans le bucket public « market-images »,
// enregistrement dans market_listing_images. Les droits (3 photos minimum, 6 maximum, dossier = id du vendeur)
// sont vérifiés côté serveur ; ici on ne fait que préparer et envoyer.

export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 6;
const BUCKET = 'market-images';

// Réduit l'image à 1280 px max (JPEG 80 %) pour économiser les données mobiles.
export async function compressImage(file: File, maxSide = 1280, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Fichier non image : ' + file.name);
  const url = URL.createObjectURL(file);
  try {
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image illisible : ' + file.name));
      i.src = url;
    });
    const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Compression impossible sur ce navigateur.');
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) throw new Error('Compression impossible : ' + file.name);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function photoUrl(db: any, path: string): string {
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl as string;
}

// Envoie les photos d'une offre. Retourne le nombre de photos réellement enregistrées et la première erreur éventuelle.
export async function uploadListingPhotos(db: any, sellerId: string, listingId: string, files: File[], startPosition = 0): Promise<{ saved: number; error: string }> {
  let saved = 0;
  for (let i = 0; i < files.length; i++) {
    try {
      const blob = await compressImage(files[i]);
      const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const path = `${sellerId}/${listingId}/${stamp}.jpg`;
      const up = await db.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) return { saved, error: up.error.message };
      const ins = await db.from('market_listing_images').insert({ listing_id: listingId, path, position: startPosition + i });
      if (ins.error) {
        await db.storage.from(BUCKET).remove([path]);
        return { saved, error: ins.error.message };
      }
      saved++;
    } catch (e: any) {
      return { saved, error: e?.message || 'Envoi impossible.' };
    }
  }
  return { saved, error: '' };
}

// Regroupe les photos par offre, dans l'ordre.
export async function loadPhotosByListing(db: any, listingIds: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  if (!listingIds.length) return out;
  const { data } = await db.from('market_listing_images').select('listing_id, path, position').in('listing_id', listingIds).order('position');
  (data || []).forEach((r: any) => { (out[r.listing_id] = out[r.listing_id] || []).push(r.path); });
  return out;
}
