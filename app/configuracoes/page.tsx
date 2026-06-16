'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Settings, FolderOpen, FileSpreadsheet,
  CheckCircle2, AlertTriangle, Save, RotateCcw, Lock, ArrowRight,
  Shield, RefreshCw, BadgeCheck, Database, History, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { type AppSettings, SETTINGS_DEFAULTS, SETTINGS_KEY, AUTH_KEY } from '@/app/cispr15/types'

interface CertInfo {
  subject: string
  thumbprint: string
  notAfter: string
  issuer: string
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono">{children}</label>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 space-y-4">
      <p className="form-section">{title}</p>
      {children}
    </div>
  )
}

export default function ConfiguracoesPage() {
  const router = useRouter()
  const [settings,     setSettings]     = useState<AppSettings>(SETTINGS_DEFAULTS)
  const [saved,        setSaved]        = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [isElectron,   setIsElectron]   = useState(false)
  const [localDataDir, setLocalDataDir] = useState<string | null>(null)
  const [gateOpen,     setGateOpen]     = useState(false)
  const [gateInput,    setGateInput]    = useState('')
  const [gateError,    setGateError]    = useState(false)
  const [appPassword,  setAppPassword]  = useState('')
  const [capsLock,     setCapsLock]     = useState(false)
  const [certs,        setCerts]        = useState<CertInfo[]>([])
  const [certsLoading, setCertsLoading] = useState(false)
  const [certsError,   setCertsError]   = useState<string | null>(null)
  const [pfxInfo,      setPfxInfo]      = useState<{ subject: string; notAfter: string } | null>(null)
  const [pfxLoading,   setPfxLoading]   = useState(false)
  const [pfxError,     setPfxError]     = useState<string | null>(null)
  const [backupStatus, setBackupStatus] = useState<{ kind: 'idle' | 'running' | 'restoring' | 'ok' | 'error'; msg: string }>({ kind: 'idle', msg: '' })
  const [backups,      setBackups]      = useState<{ name: string; date: string | null; items: string[] }[]>([])
  const [backupRoot,   setBackupRoot]   = useState('')
  const gateInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const check = (e: KeyboardEvent) => setCapsLock(e.getModifierState('CapsLock'))
    window.addEventListener('keydown', check)
    window.addEventListener('keyup', check)
    return () => { window.removeEventListener('keydown', check); window.removeEventListener('keyup', check) }
  }, [])

  useEffect(() => {
    const api = (window as any).electronAPI
    if (api) {
      setIsElectron(true)
      api.getSettings().then((s: AppSettings) => {
        setSettings(s)
        const senha = s.senhaEmissao ?? ''
        setAppPassword(senha)
        if (senha) setGateOpen(true)
      })
      api.getLocalDataDir?.().then((d: string) => setLocalDataDir(d))
    } else {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY)
        if (raw) {
          const s = { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) }
          setSettings(s)
          const senha = s.senhaEmissao ?? ''
          setAppPassword(senha)
          if (senha) setGateOpen(true)
        }
      } catch {}
    }
  }, [])

  async function salvar() {
    setError(null)
    try {
      const api = (window as any).electronAPI
      if (api) {
        const res = await api.setSettings(settings)
        if (!res.ok) throw new Error(res.error)
      } else {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function browseExcel() {
    const api = (window as any).electronAPI
    if (!api) return
    const res = await api.browseExcel()
    if (!res.canceled) setSettings(s => ({ ...s, excelPath: res.filePath }))
  }

  async function browseDataFolder() {
    const api = (window as any).electronAPI
    if (!api) return
    const res = await api.browseFolder('Selecionar pasta de dados compartilhados (rede)')
    if (!res.canceled) setSettings(s => ({ ...s, dataFolder: res.folderPath }))
  }

  async function browseAgendaFolder() {
    const api = (window as any).electronAPI
    if (!api) return
    const res = await api.browseFolder('Selecionar pasta da Agenda de Execução')
    if (!res.canceled) setSettings(s => ({ ...s, agendaFolder: res.folderPath }))
  }

  async function browsePdfCopyFolder() {
    const api = (window as any).electronAPI
    if (!api) return
    const res = await api.browseFolder('Selecionar pasta de cópias de PDF')
    if (!res.canceled) setSettings(s => ({ ...s, pdfCopyFolder: res.folderPath }))
  }

  async function browseUpdateFolder() {
    const api = (window as any).electronAPI
    if (!api) return
    const res = await api.browseFolder('Selecionar pasta de atualização automática')
    if (!res.canceled) setSettings(s => ({ ...s, updateFolder: res.folderPath }))
  }

  async function browseBackupFolder() {
    const api = (window as any).electronAPI
    if (!api) return
    const res = await api.browseFolder('Selecionar diretório de backup do banco de dados')
    if (!res.canceled) setSettings(s => ({ ...s, backupFolder: res.folderPath }))
  }

  async function loadBackups() {
    const api = (window as any).electronAPI
    if (!api?.listBackups) return
    try {
      const res = await api.listBackups(settings.backupFolder || undefined)
      if (res?.ok) { setBackups(res.backups ?? []); setBackupRoot(res.root ?? '') }
    } catch {}
  }

  // Atualiza a lista de backups quando o diretório muda
  useEffect(() => { if (isElectron) loadBackups() }, [isElectron, settings.backupFolder])

  async function fazerBackup() {
    const api = (window as any).electronAPI
    if (!api?.backupNow) return
    setBackupStatus({ kind: 'running', msg: '' })
    try {
      const res = await api.backupNow(settings.backupFolder || undefined)
      if (res?.ok) {
        setBackupStatus({ kind: 'ok', msg: `Backup criado em ${res.dir}` })
        loadBackups()
      } else setBackupStatus({ kind: 'error', msg: res?.error || 'Erro ao fazer backup' })
    } catch (e: any) { setBackupStatus({ kind: 'error', msg: e.message }) }
  }

  async function restaurarBackup() {
    const api = (window as any).electronAPI
    if (!api?.restoreBackup) return
    if (!confirm(
      'Restaurar o backup MAIS RECENTE por cima dos dados atuais?\n\n' +
      'Os dados atuais (relatórios, agenda, equipamentos, fotos) serão sobrescritos pelos do backup. ' +
      'Use isto se os dados foram perdidos. Recomendado reabrir o app depois.'
    )) return
    setBackupStatus({ kind: 'restoring', msg: '' })
    try {
      const res = await api.restoreBackup(settings.backupFolder || undefined)
      if (res?.ok) setBackupStatus({ kind: 'ok', msg: `Restaurado de ${res.from} (${(res.restored ?? []).join(', ') || 'nada'}). Reabra o app.` })
      else setBackupStatus({ kind: 'error', msg: res?.error || 'Erro ao restaurar' })
    } catch (e: any) { setBackupStatus({ kind: 'error', msg: e.message }) }
  }

  async function abrirPastaBackup() {
    const api = (window as any).electronAPI
    if (!api?.openBackupFolder) return
    await api.openBackupFolder(settings.backupFolder || undefined)
  }

  async function listarCertificados() {
    const api = (window as any).electronAPI
    if (!api) return
    setCertsLoading(true)
    setCertsError(null)
    try {
      const res = await api.listCerts()
      if (res.ok) {
        setCerts(res.certs)
        if (res.certs.length === 0) setCertsError('Nenhum certificado com chave privada encontrado. Verifique se o software do token está ativo.')
      } else {
        setCertsError(res.error || 'Erro ao listar certificados')
      }
    } catch (e: any) {
      setCertsError(e.message)
    } finally {
      setCertsLoading(false)
    }
  }

  async function selecionarPfx() {
    const api = (window as any).electronAPI
    if (!api?.pickPfx) return
    const res = await api.pickPfx()
    if (res?.ok && res.path) {
      setSettings(s => ({ ...s, pfxPath: res.path, certThumbprint: '' }))
      setPfxInfo(null); setPfxError(null)
    }
  }

  async function validarPfx() {
    const api = (window as any).electronAPI
    if (!api?.validatePfx || !settings.pfxPath) return
    setPfxLoading(true); setPfxError(null); setPfxInfo(null)
    try {
      const res = await api.validatePfx(settings.pfxPath, settings.pfxPassword)
      if (res?.ok) setPfxInfo({ subject: res.subject, notAfter: res.notAfter })
      else setPfxError(res?.error || 'Não foi possível abrir o .pfx (senha incorreta?).')
    } catch (e: any) {
      setPfxError(e.message)
    } finally {
      setPfxLoading(false)
    }
  }

  function restaurarPadroes() {
    if (!confirm('Restaurar todas as configurações para os valores padrão?')) return
    setSettings(SETTINGS_DEFAULTS)
  }

  return (
    <>
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1.5 text-white/40 hover:text-white text-sm mb-8 transition-colors">
        <ArrowLeft size={14} /> Voltar
      </button>

      <div className="mb-8 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0 mt-0.5">
          <Settings size={18} className="text-gold" />
        </div>
        <div>
          <p className="text-[11px] text-white/30 font-mono uppercase tracking-widest mb-0.5">
            LABELO · PUCRS
          </p>
          <h1 className="text-2xl font-display font-bold text-white">Configurações</h1>
          <p className="text-white/40 text-sm mt-1">
            Caminhos de arquivos e preferências do aplicativo
          </p>
        </div>
      </div>

      <div className="space-y-4">

        {/* Planilha Excel */}
        <Section title="Planilha de Registro">
          <div className="space-y-2">
            <Label>Caminho da planilha Excel (certificados)</Label>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm font-mono"
                value={settings.excelPath}
                onChange={e => setSettings(s => ({ ...s, excelPath: e.target.value }))}
                placeholder="Ex: \\servidor\projetos\Compatibilidade eletromagnética_2026.xlsx"
              />
              {isElectron && (
                <button type="button" onClick={browseExcel}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-white/50 hover:text-gold hover:border-gold/30 transition-all text-xs shrink-0">
                  <FileSpreadsheet size={13} /> Procurar
                </button>
              )}
            </div>
            <p className="text-[10px] text-white/25 font-mono">
              Planilha onde os números de relatório são registrados automaticamente ao gerar.
              Pode estar em uma pasta de rede.
            </p>
          </div>
        </Section>

        {/* Pasta de dados compartilhados */}
        <Section title="Pasta de Dados Compartilhados">
          <div className="space-y-2">
            <Label>Pasta de rede (clientes e relatórios)</Label>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm font-mono"
                value={settings.dataFolder}
                onChange={e => setSettings(s => ({ ...s, dataFolder: e.target.value }))}
                placeholder={localDataDir ? `Padrão local: ${localDataDir}` : 'Ex: \\\\servidor\\projetos\\CISPR15\\dados'}
              />
              {isElectron && (
                <button type="button" onClick={browseDataFolder}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-white/50 hover:text-teal hover:border-teal/30 transition-all text-xs shrink-0">
                  <FolderOpen size={13} /> Procurar
                </button>
              )}
            </div>
            <p className="text-[10px] text-white/25 font-mono">
              Pasta onde <span className="text-white/40">cispr15_clientes.json</span> e{' '}
              <span className="text-white/40">cispr15_relatorios.json</span> são armazenados.
              Se vazio, usa a pasta local padrão indicada acima.
              Para compartilhar entre PCs, aponte para uma pasta de rede.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 text-[11px]">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal/6 border border-teal/15">
              <FolderOpen size={11} className="text-teal shrink-0" />
              <span className="text-teal/80 font-mono truncate">
                {settings.dataFolder || localDataDir || '—'}
              </span>
              {!settings.dataFolder && (
                <span className="ml-auto shrink-0 text-[9px] text-white/25 font-mono uppercase tracking-widest">local</span>
              )}
            </div>
            <div className="flex gap-4 text-white/30 font-mono px-1">
              <span>→ cispr15_clientes.json</span>
              <span>→ cispr15_relatorios.json</span>
            </div>
          </div>
        </Section>

        {/* Pasta da Agenda */}
        <Section title="Pasta da Agenda de Execução">
          <div className="space-y-2">
            <Label>Pasta da agenda <span className="normal-case text-white/20">(separada dos dados gerais)</span></Label>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm font-mono"
                value={settings.agendaFolder ?? ''}
                onChange={e => setSettings(s => ({ ...s, agendaFolder: e.target.value }))}
                placeholder={localDataDir ? `Padrão local: ${localDataDir}` : 'Ex: \\\\servidor\\projetos\\CISPR15\\agenda'}
              />
              {isElectron && (
                <button type="button" onClick={browseAgendaFolder}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-white/50 hover:text-teal hover:border-teal/30 transition-all text-xs shrink-0">
                  <FolderOpen size={13} /> Procurar
                </button>
              )}
            </div>
            <p className="text-[10px] text-white/25 font-mono">
              Pasta onde <span className="text-white/40">cispr15_agenda.json</span> será armazenado.
              Se vazio, usa a mesma pasta de dados compartilhados acima (ou a pasta local padrão).
              Técnicos que apenas consultam podem ter acesso somente a esta pasta.
            </p>
          </div>
          {!settings.agendaFolder && !settings.dataFolder && localDataDir && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/4 border border-white/8 text-[11px]">
              <FolderOpen size={11} className="text-white/30 shrink-0" />
              <span className="text-white/40 font-mono truncate">{localDataDir}</span>
              <span className="ml-auto shrink-0 text-[9px] text-white/25 font-mono uppercase tracking-widest">local</span>
            </div>
          )}
        </Section>

        {/* Pasta de cópias de PDF */}
        <Section title="Pasta de Cópias de PDF">
          <div className="space-y-2">
            <Label>Pasta de destino para cópias dos PDFs gerados</Label>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm font-mono"
                value={settings.pdfCopyFolder ?? ''}
                onChange={e => setSettings(s => ({ ...s, pdfCopyFolder: e.target.value }))}
                placeholder="Ex: \\servidor\projetos\CISPR15\relatorios_pdf"
              />
              {isElectron && (
                <button type="button" onClick={browsePdfCopyFolder}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-white/50 hover:text-teal hover:border-teal/30 transition-all text-xs shrink-0">
                  <FolderOpen size={13} /> Procurar
                </button>
              )}
            </div>
            <p className="text-[10px] text-white/25 font-mono">
              Toda vez que um PDF for gerado ou atualizado (inclusive com assinatura), uma cópia é salva aqui automaticamente.
              Ao excluir um item da agenda, a cópia correspondente também é removida.
              Ideal para acesso de consulta sem expor a pasta original da EUT.
            </p>
          </div>
        </Section>

        {/* Backup de Segurança */}
        {isElectron && (
          <Section title="Backup de Segurança">
            <div className="space-y-2">
              <Label>Diretório de backup</Label>
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-sm font-mono"
                  value={settings.backupFolder}
                  onChange={e => setSettings(s => ({ ...s, backupFolder: e.target.value }))}
                  placeholder="Padrão: Documentos\CISPR15-Backups (escolha uma pasta de rede p/ mais segurança)"
                />
                <button type="button" onClick={browseBackupFolder}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-white/50 hover:text-teal hover:border-teal/30 transition-all text-xs shrink-0">
                  <FolderOpen size={13} /> Procurar
                </button>
              </div>
              <p className="text-[10px] text-white/25 font-mono">
                Agrupa <span className="text-white/40">dados</span> (relatórios, equipamentos, checagens, fotos+DOCX),{' '}
                <span className="text-white/40">agenda</span>, <span className="text-white/40">pdfs</span> e as configurações
                numa cópia datada. Mantém os 20 backups mais recentes. Para sobreviver à perda do PC, aponte para uma pasta de rede ou pendrive.
              </p>
            </div>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={settings.autoBackup}
                onChange={e => setSettings(s => ({ ...s, autoBackup: e.target.checked }))}
                className="w-4 h-4 rounded accent-gold cursor-pointer"
              />
              <div>
                <p className="text-sm text-white/80 group-hover:text-white transition-colors">Backup automático ao abrir o app</p>
                <p className="text-[10px] text-white/30 font-mono mt-0.5">Cria um backup no máximo 1× por dia, automaticamente (salve as configurações para valer).</p>
              </div>
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" onClick={fazerBackup} disabled={backupStatus.kind === 'running' || backupStatus.kind === 'restoring'}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-teal/30 bg-teal/8 text-teal hover:bg-teal/14 transition-all text-sm font-semibold disabled:opacity-50">
                {backupStatus.kind === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
                {backupStatus.kind === 'running' ? 'Fazendo backup…' : 'Fazer backup agora'}
              </button>
              <button type="button" onClick={restaurarBackup} disabled={backupStatus.kind === 'running' || backupStatus.kind === 'restoring' || backups.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-500/30 bg-amber-500/8 text-amber-400 hover:bg-amber-500/14 transition-all text-sm font-semibold disabled:opacity-40">
                {backupStatus.kind === 'restoring' ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
                {backupStatus.kind === 'restoring' ? 'Restaurando…' : 'Restaurar último backup'}
              </button>
              <button type="button" onClick={abrirPastaBackup}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-white/50 hover:text-white/80 hover:border-white/25 transition-all text-xs">
                <FolderOpen size={13} /> Abrir pasta
              </button>
            </div>

            {/* Lista de backups recentes */}
            <div className="rounded-lg bg-white/3 border border-white/8 px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/35 font-mono uppercase tracking-wider">
                  {backups.length} backup(s) · {backupRoot || '—'}
                </span>
                <button type="button" onClick={loadBackups} className="text-[10px] text-white/30 hover:text-teal font-mono flex items-center gap-1">
                  <RefreshCw size={9} /> atualizar
                </button>
              </div>
              {backups.slice(0, 5).map(b => (
                <div key={b.name} className="flex items-center gap-2 text-[11px] text-white/45 font-mono">
                  <Database size={9} className="text-white/25 shrink-0" />
                  <span className="text-white/60">{b.date ? new Date(b.date).toLocaleString('pt-BR') : b.name}</span>
                  <span className="text-white/25 truncate">{b.items.join(', ')}</span>
                </div>
              ))}
              {backups.length === 0 && (
                <p className="text-[11px] text-white/25">Nenhum backup ainda — clique em "Fazer backup agora".</p>
              )}
            </div>

            {backupStatus.kind === 'ok' && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-green/10 border border-green/20 text-green-400 text-[12px]">
                <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> {backupStatus.msg}
              </div>
            )}
            {backupStatus.kind === 'error' && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[12px]">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {backupStatus.msg}
              </div>
            )}
          </Section>
        )}

        {/* PDF / HTML */}
        <Section title="Saída de PDF e HTML">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={settings.pdfAutoSaveToEut}
              onChange={e => setSettings(s => ({ ...s, pdfAutoSaveToEut: e.target.checked }))}
              className="w-4 h-4 rounded accent-gold cursor-pointer"
            />
            <div>
              <p className="text-sm text-white/80 group-hover:text-white transition-colors">
                Salvar PDF automaticamente na pasta da EUT
              </p>
              <p className="text-[10px] text-white/30 font-mono mt-0.5">
                Ao gerar o relatório, um PDF é salvo na mesma pasta do .docx e das fotos
              </p>
            </div>
          </label>
        </Section>

        {/* Atualização automática */}
        <Section title="Atualização Automática">
          <div className="space-y-2">
            <Label>Pasta de atualização (rede)</Label>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm font-mono"
                value={settings.updateFolder ?? ''}
                onChange={e => setSettings(s => ({ ...s, updateFolder: e.target.value }))}
                placeholder="Ex: \\servidor\projetos\CISPR15\updates"
              />
              {isElectron && (
                <button type="button" onClick={browseUpdateFolder}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-white/50 hover:text-teal hover:border-teal/30 transition-all text-xs shrink-0">
                  <FolderOpen size={13} /> Procurar
                </button>
              )}
            </div>
            <p className="text-[10px] text-white/25 font-mono">
              Pasta onde o instalador e o <span className="text-white/40">version.json</span> ficam disponíveis.
              Ao abrir o app, ele verifica se há versão mais nova e oferece atualização automática.
              Deixe vazio para desativar.
            </p>
          </div>
        </Section>

        {/* Segurança */}
        <Section title="Segurança — Emissão de Relatórios">
          <div className="space-y-2">
            <Label>Senha de acesso à emissão</Label>
            <div className="flex gap-2 items-center">
              <Lock size={13} className="text-white/25 shrink-0" />
              <input
                type="password"
                className="input flex-1"
                value={settings.senhaEmissao ?? ''}
                onChange={e => setSettings(s => ({ ...s, senhaEmissao: e.target.value }))}
                placeholder="Vazio = sem senha (livre para todos)"
                autoComplete="new-password"
              />
            </div>
            <p className="text-[10px] text-white/25 font-mono">
              Se preenchida, a área de emissão de relatórios exigirá esta senha a cada sessão.
              A Agenda de Execução é sempre acessível sem senha.
            </p>
          </div>
        </Section>

        {/* Assinatura Digital */}
        {isElectron && (
          <Section title="Assinatura Digital de PDF">
            <div className="space-y-3">
              {/* Opção recomendada: arquivo .pfx (não precisa importar no Windows) */}
              <div className="rounded-xl border border-teal/15 bg-teal/4 p-3 space-y-2.5">
                <p className="text-[11px] text-teal/90 font-semibold flex items-center gap-1.5">
                  <BadgeCheck size={12} /> Arquivo .pfx / .p12 (recomendado)
                </p>
                <p className="text-[10px] text-white/35">
                  Aponte o arquivo da sua assinatura e a senha. Não precisa importar no Windows — funciona em qualquer PC.
                </p>

                {settings.pfxPath && (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-teal/8 border border-teal/20">
                    <BadgeCheck size={12} className="text-teal shrink-0" />
                    <p className="flex-1 min-w-0 text-[10px] text-teal/90 font-mono truncate">
                      {pfxInfo?.subject || settings.pfxPath}
                    </p>
                    <button type="button"
                      onClick={() => { setSettings(s => ({ ...s, pfxPath: '', pfxPassword: '' })); setPfxInfo(null); setPfxError(null) }}
                      className="text-[10px] text-white/30 hover:text-red-400 transition-colors shrink-0">Remover</button>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={selecionarPfx}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-white/50 hover:text-teal hover:border-teal/30 transition-all text-xs">
                    <FolderOpen size={12} /> {settings.pfxPath ? 'Trocar arquivo' : 'Selecionar .pfx'}
                  </button>
                  {settings.pfxPath && (
                    <span className="text-[9px] text-white/30 font-mono truncate">{settings.pfxPath.split(/[\\/]/).pop()}</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input type="password" value={settings.pfxPassword ?? ''}
                    onChange={e => { setSettings(s => ({ ...s, pfxPassword: e.target.value })); setPfxInfo(null) }}
                    placeholder="Senha do .pfx"
                    className="input flex-1 text-xs" />
                  <button type="button" onClick={validarPfx} disabled={!settings.pfxPath || pfxLoading}
                    className="px-3 py-2 rounded-lg border border-teal/30 text-teal text-xs hover:bg-teal/10 transition-all disabled:opacity-40">
                    {pfxLoading ? 'Validando…' : 'Validar'}
                  </button>
                </div>

                {pfxInfo && (
                  <p className="text-[10px] text-teal/80 flex items-center gap-1">
                    <BadgeCheck size={9} /> OK — {pfxInfo.subject} · expira {pfxInfo.notAfter}
                  </p>
                )}
                {pfxError && (
                  <p className="text-[10px] text-amber-400/80 flex items-center gap-1">
                    <AlertTriangle size={9} /> {pfxError}
                  </p>
                )}
              </div>

              <p className="text-[10px] text-white/25 font-mono pt-1">
                Ou use um certificado A3 já instalado no Windows (token deve estar ativo):
              </p>

              {/* Certificado selecionado */}
              {settings.certThumbprint && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal/6 border border-teal/15">
                  <BadgeCheck size={13} className="text-teal shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-teal/90 font-mono truncate">
                      {certs.find(c => c.thumbprint === settings.certThumbprint)?.subject || 'Certificado configurado'}
                    </p>
                    <p className="text-[9px] text-white/30 font-mono truncate">{settings.certThumbprint}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, certThumbprint: '' }))}
                    className="text-[10px] text-white/30 hover:text-red-400 transition-colors shrink-0"
                  >
                    Remover
                  </button>
                </div>
              )}

              {/* Botão listar + lista */}
              <button
                type="button"
                onClick={listarCertificados}
                disabled={certsLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-white/50 hover:text-teal hover:border-teal/30 transition-all text-xs disabled:opacity-40"
              >
                {certsLoading
                  ? <RefreshCw size={12} className="animate-spin" />
                  : <Shield size={12} />
                }
                {certsLoading ? 'Buscando...' : 'Listar certificados disponíveis'}
              </button>

              {certsError && (
                <p className="text-[10px] text-amber-400/80 flex items-center gap-1">
                  <AlertTriangle size={9} /> {certsError}
                </p>
              )}

              {certs.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Selecione o certificado de assinatura</Label>
                  {certs.map(cert => (
                    <button
                      key={cert.thumbprint}
                      type="button"
                      onClick={() => setSettings(s => ({ ...s, certThumbprint: cert.thumbprint }))}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-lg border transition-all text-[11px]',
                        settings.certThumbprint === cert.thumbprint
                          ? 'border-teal/40 bg-teal/8 text-teal'
                          : 'border-white/8 bg-white/3 text-white/60 hover:border-white/20 hover:text-white/80'
                      )}
                    >
                      <p className="font-mono truncate">{cert.subject}</p>
                      <p className="text-[9px] text-white/30 font-mono mt-0.5">
                        Expira: {cert.notAfter} · {cert.thumbprint.slice(0, 16)}…
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        {!isElectron && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-amber-400 text-[11px]">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              Alguns recursos (selecionar arquivo, navegar em pastas de rede) só estão disponíveis
              no aplicativo Electron. No navegador, insira os caminhos manualmente.
            </span>
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center gap-3 pt-2">
          <button type="button" onClick={restaurarPadroes}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 text-white/40 hover:text-white/70 text-sm transition-all">
            <RotateCcw size={13} /> Restaurar padrões
          </button>
          <div className="flex-1" />
          <button type="button" onClick={salvar}
            className="btn-primary flex items-center gap-2 px-6 py-2.5 text-sm font-bold">
            <Save size={14} /> Salvar configurações
          </button>
        </div>

        {saved && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green/10 border border-green/20 text-green-400 text-sm animate-fade-in">
            <CheckCircle2 size={15} /> Configurações salvas com sucesso
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}

      </div>
    </div>

    {/* ── Gate de senha ── */}

    {gateOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="card w-full max-w-sm mx-4 p-7 space-y-5 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gold/12 border border-gold/25 flex items-center justify-center">
              <Lock size={20} className="text-gold" />
            </div>
            <div>
              <p className="font-bold text-white">Configurações</p>
              <p className="text-[11px] text-white/40">Informe a senha para acessar</p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono">Senha</label>
            <input
              ref={gateInputRef}
              type="password"
              className={cn('input', gateError && 'border-red-500/50')}
              placeholder="••••••"
              value={gateInput}
              autoFocus
              onChange={e => { setGateInput(e.target.value); setGateError(false) }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (gateInput === appPassword) {
                    setGateOpen(false); setGateInput('')
                  } else { setGateError(true); setGateInput(''); setTimeout(() => gateInputRef.current?.focus(), 0) }
                }
              }}
            />
            {capsLock && <p className="text-[10px] text-amber-400/80">⇪ Caps Lock ativo</p>}
            {gateError && <p className="text-[11px] text-red-400">Senha incorreta.</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.back()}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/40 hover:text-white/70 text-sm transition-all">
              Voltar
            </button>
            <button
              type="button"
              onClick={() => {
                if (gateInput === appPassword) {
                  setGateOpen(false); setGateInput('')
                } else { setGateError(true); setGateInput(''); setTimeout(() => gateInputRef.current?.focus(), 0) }
              }}
              className="btn-primary flex-1 py-2.5 text-sm font-bold flex items-center justify-center gap-2">
              <ArrowRight size={14} /> Entrar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
