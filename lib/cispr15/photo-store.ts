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

/* ── valores grandes que não são "fotos soltas" ──────────────────────────────
 *
 * Mesmo cofre, para qualquer objeto que não caiba no localStorage. Nasceu do
 * lote: um lote é várias amostras e CADA amostra carrega suas fotos em base64,
 * então o objeto inteiro passa fácil dos ~5 MB do localStorage — era ele que
 * disparava "Armazenamento cheio — reduza o número de fotos". A saída não é
 * guardar menos fotos, é parar de guardá-las no lugar apertado.
 *
 * Nenhuma das três funções rejeita: armazenamento é sempre best-effort aqui,
 * porque em toda chamada existe uma cópia melhor (a da rede) por trás. */
export async function salvarValor(key: string, valor: unknown): Promise<void> {
  try { await idbSet(key, valor) }
  catch (e) { console.error('[photo-store] falha ao salvar', key, 'no IndexedDB:', e) }
}

export async function lerValor<T>(key: string): Promise<T | null> {
  try {
    const v = await idbGet(key)
    return (v === undefined || v === null) ? null : (v as T)
  } catch { return null }
}

export async function apagarValor(key: string): Promise<void> {
  try { await idbDel(key) } catch {}
}

/* ── anexos de um relatório (fotos + HTML do .docx), por id ───────────────────
 *
 * O HTML do .docx do Radimation vinha para o localStorage, uma chave por
 * relatório. Cada um pesa de 5 a 10 MB (as imagens vão embutidas em base64), e
 * em 11/09/2026 havia 13 dessas chaves ocupando 97 MB num cofre de ~5 MB. Com a
 * cota estourada TODA escrita local passa a falhar em silêncio (é sempre
 * `try {} catch {}`), o cache da lista congela truncado — e uma tela que monte
 * a gravação a partir dele manda para a rede uma lista menor do que a real.
 *
 * Por isso os anexos moram no IndexedDB, num único registro por id, e o
 * localStorage guarda apenas o índice leve.
 */
export const ASSETS_IDB_PFX = 'cispr15_assets_idb:'

/** Chave antiga, só de leitura/migração. Nada grava mais aqui. */
const DOCX_LEGADO_PFX = 'cispr15_docx_v1_'

export type AssetsLocais = { photos: PhotoEntry[]; docxHtml: string | null }

/** Anexos deste PC. Ainda lê a chave legada, para o que foi gravado antes. */
export async function lerAssetsLocais(id: string): Promise<AssetsLocais> {
  let photos: PhotoEntry[] = []
  let docxHtml: string | null = null
  try {
    const v = await idbGet(ASSETS_IDB_PFX + id) as AssetsLocais | undefined
    if (v) {
      if (Array.isArray(v.photos)) photos = v.photos
      if (typeof v.docxHtml === 'string') docxHtml = v.docxHtml
    }
  } catch {}
  if (!docxHtml) {
    try { docxHtml = localStorage.getItem(DOCX_LEGADO_PFX + id) } catch {}
  }
  return { photos, docxHtml }
}

/** Grava só os campos informados, preservando o resto do registro. */
export async function salvarAssetsLocais(id: string, patch: Partial<AssetsLocais>): Promise<void> {
  try {
    const atual = await lerAssetsLocais(id)
    await idbSet(ASSETS_IDB_PFX + id, {
      photos:   patch.photos   !== undefined ? patch.photos.map(({ name, base64 }) => ({ name, base64 })) : atual.photos,
      docxHtml: patch.docxHtml !== undefined ? patch.docxHtml : atual.docxHtml,
    })
  } catch (e) {
    console.error('[photo-store] falha ao salvar anexos de', id, e)
  }
}

/** Apaga os anexos deste PC (IndexedDB + chave legada do localStorage). */
export async function apagarAssetsLocais(id: string): Promise<void> {
  try { await idbDel(ASSETS_IDB_PFX + id) } catch {}
  try { localStorage.removeItem(DOCX_LEGADO_PFX + id) } catch {}
}

/**
 * Esvazia as chaves `cispr15_docx_v1_*` que sobraram no localStorage, passando
 * o conteúdo para o IndexedDB. Roda na abertura do app: é o que faz a cota se
 * resolver sozinha nas máquinas que já estão entupidas, sem ninguém limpar nada
 * na mão. Como nenhum código grava mais nessas chaves, não volta a encher.
 *
 * Só apaga a chave DEPOIS de o IndexedDB confirmar a gravação — se o IDB falhar,
 * o conteúdo antigo fica onde está, porque perder o .docx é pior do que seguir
 * apertado por mais uma sessão.
 */
export async function migrarDocxLegado(): Promise<{ migrados: number; bytes: number }> {
  let migrados = 0, bytes = 0
  let chaves: string[] = []
  try {
    // Coleta antes de mexer: remover durante o laço embaralha os índices.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(DOCX_LEGADO_PFX)) chaves.push(k)
    }
  } catch { return { migrados: 0, bytes: 0 } }

  for (const chave of chaves) {
    const id = chave.slice(DOCX_LEGADO_PFX.length)
    try {
      const html = localStorage.getItem(chave)
      if (!html) { localStorage.removeItem(chave); continue }
      const atual = await lerAssetsLocais(id)
      await idbSet(ASSETS_IDB_PFX + id, { photos: atual.photos, docxHtml: html })
      localStorage.removeItem(chave)
      migrados++
      bytes += (chave.length + html.length) * 2
    } catch (e) {
      console.error('[photo-store] não consegui migrar', chave, e)
    }
  }
  if (migrados) console.info('[photo-store] docx movidos para o IndexedDB:', migrados,
                             '(' + (bytes / 1048576).toFixed(1) + ' MB liberados)')
  return { migrados, bytes }
}
