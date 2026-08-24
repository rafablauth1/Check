// Motor do corretor ortográfico (pt-BR), 100% client-side.
//
// Importante: NÃO usa o spellchecker nativo do Electron/Chromium
// (webPreferences.spellcheck) — esse recurso foi testado e revertido antes
// (ver commit "fix: desliga corretor ortografico") porque travava a digitação
// ao carregar o dicionário. Aqui o dicionário (hunspell pt-BR, via
// dictionary-pt) é servido como arquivo estático da própria aplicação
// (public/dicionario/) e a verificação roda via hunspell-asm (hunspell real
// compilado p/ WebAssembly), sempre depois de um debounce — nunca no caminho
// da tecla digitada.
//
// Por que não `nspell` (JS puro): a tabela de palavras do pt-BR expande cada
// verbo em centenas de formas conjugadas via regras de afixo, e o dicionário
// resultante estoura o limite de propriedades enumeráveis de objeto do V8
// ("RangeError: Too many properties to enumerate") ao carregar. O hunspell-asm
// roda o dicionário em memória WASM, sem essa limitação.
import type { Hunspell, HunspellFactory } from 'hunspell-asm'

const CHAVE_PALAVRAS_CUSTOM = 'check:corretor:palavras-adicionadas'

let instancia: Promise<Hunspell> | null = null

function carregarPalavrasCustom(): string[] {
  try {
    const raw = localStorage.getItem(CHAVE_PALAVRAS_CUSTOM)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function construir(): Promise<Hunspell> {
  const [{ loadModule }, affBuf, dicBuf] = await Promise.all([
    import('hunspell-asm'),
    fetch('/dicionario/pt-br.aff').then(r => r.arrayBuffer()),
    fetch('/dicionario/pt-br.dic').then(r => r.arrayBuffer()),
  ])
  const factory: HunspellFactory = await loadModule()
  const affPath = factory.mountBuffer(new Uint8Array(affBuf), 'pt-br.aff')
  const dicPath = factory.mountBuffer(new Uint8Array(dicBuf), 'pt-br.dic')
  const corretor = factory.create(affPath, dicPath)
  for (const p of carregarPalavrasCustom()) corretor.addWord(p)
  return corretor
}

// Singleton: o dicionário (~5 MB) só é buscado/parseado uma vez por sessão do app.
export function carregarCorretor(): Promise<Hunspell> {
  if (!instancia) instancia = construir()
  return instancia
}

export function adicionarAoDicionario(corretor: Hunspell, palavra: string) {
  corretor.addWord(palavra)
  const atuais = carregarPalavrasCustom()
  if (!atuais.includes(palavra)) {
    atuais.push(palavra)
    try { localStorage.setItem(CHAVE_PALAVRAS_CUSTOM, JSON.stringify(atuais)) } catch {}
  }
}
