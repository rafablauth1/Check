// VIGIA-7S no app — configuração (porte de CFG_PADRAO / _carregar_cfg de vigia7s/app.py).
import { campoDe, type CampoDisplay } from '@/lib/vigia/seg7'
import { mesclar } from '@/lib/vigia/util'

export interface Filtros {
  media_n: number; mediana: number; desfoque: number; contraste: number; brilho: number
  clahe: boolean; nitidez: number; perspectiva: number[][]
}

export interface ConfigCamera {
  fonte: string; largura: number; altura: number; autofoco: boolean; foco: number
  auto_exposicao: boolean; exposicao: number; zoom: number; zoom_digital: number; fps: number
  desloc_x: number; desloc_y: number
  filtros: Filtros
}

export interface ConfigEnsaio {
  intervalo_s: number; atraso_inicial_s: number; n_abastecimentos: number
  quadros: number; janela_s: number; concordancia: number; parar_ao_atingir: boolean
  pausar_leituras_aguardando: boolean; confirmar_falha: boolean; confirmar_apos_s: number
  modo_leitura: 'congelado' | 'tempo'; congelado_s: number; intervalo_min_s: number
  travado_s: number; parar_erros_n: number; parar_erro_pct: number
  limite_erro_pct: number; erro_grave_pct: number; disparo_saida: boolean
  ciclo_ref: string; ciclo_offset_s: number
}

export interface ConfigVigia {
  camera: ConfigCamera
  campos: CampoDisplay[]
  ensaio: ConfigEnsaio
  consistencia: { ativo: boolean; volume: string; preco: string; total: string; tol: number }
  alarme: {
    ativo: boolean; freq_hz: number; dur_ms: number; continuo: boolean; aviso_segmento: boolean
    modo_aviso: string; avisar_faltando: number; travado_aviso_s: number
  }
  imagens: { salvar_falhas: boolean; salvar_todas: boolean }
  totalizador: { campo: string; tol: number; pedir_inicial: boolean; pedir_final: boolean }
  perfil: string
  registro_arquivo: string
  layout?: Record<string, unknown>
}

export const FILTROS_PADRAO: Filtros = {
  media_n: 1, mediana: 0, desfoque: 0, contraste: 1.0, brilho: 0.0, clahe: false, nitidez: 0.0, perspectiva: [],
}

export const CFG_PADRAO: ConfigVigia = {
  camera: {
    fonte: 'auto', largura: 1280, altura: 720, autofoco: false, foco: 30,
    auto_exposicao: true, exposicao: -6, zoom: 100, zoom_digital: 1.0, fps: 60,
    desloc_x: 0.0, desloc_y: 0.0,
    // filtros p/ aquisição de imagem de TV / vídeo ruidoso
    filtros: { ...FILTROS_PADRAO },
  },
  campos: [
    campoDe({ nome: 'Total R$', roi: [100, 100, 420, 110], digitos: 6, decimais: 2 }),
    campoDe({ nome: 'Litros', roi: [100, 260, 420, 110], digitos: 6, decimais: 2 }),
    campoDe({ nome: 'Preço/L', roi: [100, 420, 300, 80], digitos: 4, decimais: 3 }),
  ],
  ensaio: {
    intervalo_s: 60.0, atraso_inicial_s: 60.0, n_abastecimentos: 100,
    quadros: 7, janela_s: 1.5, concordancia: 0.7, parar_ao_atingir: true,
    pausar_leituras_aguardando: false, confirmar_falha: true, confirmar_apos_s: 3.0,
    // "congelado": lê quando o valor para de mudar (fase de validação da bomba); "tempo": intervalo fixo
    // regra do ensaio: validar os litros sempre que o valor ficar congelado por 3 s ou mais
    modo_leitura: 'congelado', congelado_s: 3.0, intervalo_min_s: 5.0,
    // parada automática: display travado por mais de travado_s, ou N leituras seguidas com erro > X %
    travado_s: 60.0, parar_erros_n: 3, parar_erro_pct: 50.0,
    // critério de aprovação: |erro| do volume ≥ limite → FALHA (linha vermelha + alarme)
    limite_erro_pct: 1.0,
    // FALHA com |erro| até este valor = erro leve (3 bipes curtos); acima: alarme contínuo
    erro_grave_pct: 5.0,
    disparo_saida: true,  // perturbação começa a contar na 1ª saída do valor congelado
    ciclo_ref: 'auto',    // valor em que a bomba fica congelada (ex.: 4) p/ medir o ciclo
    // somado ao tempo médio medido do ciclo → dwell (o software da 4-3 só aceita segundos inteiros)
    ciclo_offset_s: 0.0,
  },
  consistencia: { ativo: false, volume: 'Litros', preco: 'Preço/L', total: 'Total R$', tol: 0.01 },
  alarme: {
    ativo: true, freq_hz: 2500, dur_ms: 400, continuo: true, aviso_segmento: true,
    // avisos: "bipe", "voz" (frases faladas) ou "bipe e voz"
    modo_aviso: 'bipe e voz',
    // aviso quando faltarem N pontos para terminar o segmento / o ensaio (0 = não avisa)
    avisar_faltando: 3,
    // aviso de mostrador parado (antes da parada automática por travamento); 0 = não avisa
    travado_aviso_s: 30.0,
  },
  imagens: { salvar_falhas: true, salvar_todas: false },
  // totalizador da bomba: inicial/parciais/final conferidos com a soma dos volumes lidos
  totalizador: { campo: 'Litros', tol: 0.05, pedir_inicial: true, pedir_final: true },
  perfil: 'IEC 61000-4-3 - Campo irradiado (câmara semianecoica)',
  registro_arquivo: '',  // registro FOR EMC38 aberto por último (.json)
}

/** _carregar_cfg(): padrão + salvo; "campos" do arquivo substitui a lista inteira. */
export function carregarConfig(dados: Partial<ConfigVigia> | null): ConfigVigia {
  const cfg = mesclar(CFG_PADRAO, dados ?? {})
  cfg.campos = (dados && 'campos' in dados && Array.isArray(dados.campos) ? dados.campos : CFG_PADRAO.campos).map(c => campoDe(c))
  return cfg
}
