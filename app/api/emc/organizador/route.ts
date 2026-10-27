import { NextRequest, NextResponse } from 'next/server'
import {
  lerConfigOrganizador, salvarConfigOrganizador, pastaAcessivel, lerEstrutura, organizar, enviar, lerDats,
  excluirPontos, pastaBackupAgora, finalizar, reabrir, listarFinalizados, dentroDe, mesmoCaminho, Log,
} from '@/lib/emc/organizador/server'
import { sincronizarAgenda } from '@/lib/emc/organizador/sincronizar'
import { AgendaEmcIlegivel } from '@/lib/emc/agenda-server'
import type { ConfigOrganizador } from '@/lib/emc/organizador/tipos'

// Organizador de ensaios EMC (aba "Radian" da agenda EMC).
// GET  ?acao=estrutura | finalizados
// POST { acao: 'config' | 'organizar' | 'enviar' | 'verificar' | 'excluir' | 'finalizar' | 'reabrir' | 'sincronizar', … }
// Só mexe em caminhos dentro da Origem configurada (e escreve no Destino).

export const dynamic = 'force-dynamic'

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

async function origemOk(cfg: ConfigOrganizador) {
  return (await pastaAcessivel(cfg.origem))
    ? null
    : erro(`Não encontrei "${cfg.origem}". O PC do Radian está ligado e a pasta compartilhada acessível?`, 503)
}

/** Caminhos vindos da tela: todos dentro da origem, senão recusa. */
function caminhos(cfg: ConfigOrganizador, lista: unknown): string[] | null {
  if (!Array.isArray(lista) || !lista.every(p => typeof p === 'string' && dentroDe(cfg.origem, p) && !mesmoCaminho(cfg.origem, p))) return null
  return lista as string[]
}

export async function GET(req: NextRequest) {
  const cfg = await lerConfigOrganizador()
  const acao = req.nextUrl.searchParams.get('acao') || 'estrutura'
  const [origemOnline, destinoOnline] = await Promise.all([pastaAcessivel(cfg.origem), pastaAcessivel(cfg.destino)])
  if (acao === 'finalizados') {
    return NextResponse.json({ itens: origemOnline ? await listarFinalizados(cfg.origem) : [], origemOnline })
  }
  const estrutura = origemOnline ? await lerEstrutura(cfg.origem, destinoOnline ? cfg.destino : '') : []
  return NextResponse.json({ config: cfg, origemOnline, destinoOnline, estrutura })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const cfg = await lerConfigOrganizador()
  try {
    switch (body.acao) {
      case 'config':
        return NextResponse.json(await salvarConfigOrganizador(body.config as Partial<ConfigOrganizador>))

      case 'sincronizar':
        return NextResponse.json(await sincronizarAgenda(!!body.forcar))

      case 'organizar': {
        const falha = await origemOk(cfg); if (falha) return falha
        const simular = body.simular !== false
        const log = new Log(simular ? undefined : 'organizar')
        log.add(`${simular ? 'SIMULAÇÃO' : 'ORGANIZANDO'} em ${cfg.origem}`, 'info')
        const resumo = await organizar(cfg.origem, simular, log)
        log.add(resumo, 'info'); await log.gravar()
        return NextResponse.json({ resumo, log: log.linhas })
      }

      case 'enviar': {
        const falha = await origemOk(cfg); if (falha) return falha
        const unidades = caminhos(cfg, body.unidades)
        if (!unidades?.length) return erro('Nenhum ensaio marcado (ou caminho fora da origem).')
        if (!(await pastaAcessivel(cfg.destino))) return erro(`Não encontrei a pasta de destino:\n${cfg.destino}\n\nA unidade T: está acessível?`, 503)
        if (mesmoCaminho(cfg.destino, cfg.origem)) return erro('Destino é a mesma pasta da origem.')
        const log = new Log('enviar')
        const resumo = await enviar(cfg.origem, cfg.destino, unidades, log)
        await log.gravar()
        // o que acabou de ir para a rede já conta na agenda
        const sinc = await sincronizarAgenda(true).catch(() => null)
        return NextResponse.json({ resumo, log: log.linhas, sincronizacao: sinc })
      }

      case 'verificar': {
        const falha = await origemOk(cfg); if (falha) return falha
        const pastas = caminhos(cfg, body.pastas)
        if (!pastas?.length) return erro('Marca na lista (ou clica) o ensaio que quer verificar.')
        const log = new Log()
        return NextResponse.json({ arquivos: await lerDats(pastas, log), log: log.linhas })
      }

      case 'excluir': {
        const falha = await origemOk(cfg); if (falha) return falha
        const lista = body.arquivos as { arquivo: string; pontos: { bloco: number; hash: string }[] }[]
        if (!Array.isArray(lista) || !caminhos(cfg, lista.map(x => x?.arquivo))) return erro('Arquivo fora da origem.')
        const backup = await pastaBackupAgora()
        const log = new Log('excluir')
        const novos: { arquivo: string; novo: string | null }[] = []
        for (const { arquivo, pontos } of lista) {
          try {
            const novo = await excluirPontos(arquivo, pontos, backup)
            log.add(`  excluído(s) ${pontos.length} ponto(s)  ${arquivo}`, 'ok')
            if (novo !== arquivo) log.add(`  ${arquivo}: tirei o _Enviado, precisa enviar de novo`, 'aviso')
            novos.push({ arquivo, novo })
          } catch (e) {
            log.add(`  ERRO  ${arquivo}: ${(e as Error).message}`, 'erro')
            novos.push({ arquivo, novo: null })
          }
        }
        log.add(`Originais guardados em ${backup}`, 'info')
        await log.gravar()
        return NextResponse.json({ novos, log: log.linhas })
      }

      case 'finalizar':
      case 'reabrir': {
        const falha = await origemOk(cfg); if (falha) return falha
        const pastas = caminhos(cfg, body.pastas)
        if (!pastas?.length) return erro('Nenhum protocolo marcado.')
        const log = new Log(body.acao)
        const resumo = body.acao === 'finalizar'
          ? await finalizar(cfg.origem, pastas, log)
          : await reabrir(cfg.origem, pastas, log)
        log.add(resumo, 'info'); await log.gravar()
        return NextResponse.json({ resumo, log: log.linhas })
      }

      default:
        return erro('Ação desconhecida.')
    }
  } catch (e) {
    return erro(e instanceof Error ? e.message : String(e), e instanceof AgendaEmcIlegivel ? 409 : 500)
  }
}
