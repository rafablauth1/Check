'use client'

/* Persistência das fotos do CISPR15 em IndexedDB.
 *
 * Antes as fotos (base64) eram guardadas em localStorage, que tem teto fixo de
 * ~5 MB por app — poucas fotos já estouravam ("Armazenamento cheio, reduza o
 * número de fotos"). IndexedDB tem cota na casa de centenas de MB / GB, então
 * o problema deixa de existir.
 *
 * As telas (page, lote, emenda) trocam as fotos entre si escrevendo/lendo a
 * mesma chave (PHOTOS_KEY) e navegando para /cispr15/relatorio. Como o IDB é
 * assíncrono, ao passar as fotos numa navegação é preciso AGUARDAR o savePhotos
 * antes do router.push (ver usos com await). Dentro da mesma tela pode chamar
 * sem await (persistência em background — as fotos já estão no estado React).
 *
 * Migração: na primeira leitura, o que ainda estiver no localStorage antigo é
 * importado para o IDB e removido de lá, sem o usuário perder nada.
 */

export type PhotoEntry = { name: string; base64: string }

const DB_NAME = 'cispr15'
const STORE   = 'kv'
const DB_VER  = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

function idbGet(key: string): Promise<unknown> {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const rq = tx.objectStore(STORE).get(key)
    rq.onsuccess = () => resolve(rq.result)
    rq.onerror   = () => reject(rq.error)
  }))
}

function idbSet(key: string, val: unknown): Promise<void> {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(val, key)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  }))
}

function idbDel(key: string): Promise<void> {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  }))
}

/* Lê as fotos salvas. Migra 1× o que ainda houver no localStorage antigo. */
export async function loadPhotos(key: string): Promise<PhotoEntry[]> {
  try {
    const fromIdb = await idbGet(key)
    if (Array.isArray(fromIdb)) return fromIdb as PhotoEntry[]
  } catch {}
  // migração localStorage → IDB (uma vez)
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        try { await idbSet(key, arr); localStorage.removeItem(key) } catch {}
        return arr as PhotoEntry[]
      }
    }
  } catch {}
  return []
}

/* Salva as fotos. AGUARDÁVEL — dê await antes de navegar entre telas para
 * garantir que a próxima tela leia o valor já gravado. Nunca rejeita (loga o
 * erro internamente), então pode ser chamado sem await dentro da mesma tela. */
export async function savePhotos(key: string, photos: PhotoEntry[]): Promise<void> {
  try {
    await idbSet(key, photos.map(({ name, base64 }) => ({ name, base64 })))
    try { localStorage.removeItem(key) } catch {}
  } catch (e) {
    console.error('[photo-store] falha ao salvar fotos no IndexedDB:', e)
  }
}

/* Apaga as fotos salvas (IDB + qualquer resquício no localStorage). */
export async function clearPhotos(key: string): Promise<void> {
  try { await idbDel(key) } catch {}
  try { localStorage.removeItem(key) } catch {}
}
