'use client'

import { useEffect } from 'react'
import { Printer } from 'lucide-react'

const today = new Date().toLocaleDateString('pt-BR')

export default function InstrucaoPage() {
  useEffect(() => {
    document.title = 'IT-EMC-CISPR15-001 — Formulário CISPR 15'
  }, [])

  return (
    <>
      <style>{`
        @page { size: A4; margin: 20mm 20mm 20mm 25mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .it-page { box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
        }
        .it-page { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; line-height: 1.5; }
        .it-h1 { font-size: 13pt; font-weight: 700; color: #003366; margin: 14px 0 4px; }
        .it-h2 { font-size: 11pt; font-weight: 700; background: #C8C8C8; padding: 3px 8px; margin: 12px 0 6px; }
        .it-h3 { font-size: 11pt; font-weight: 700; background: #E5E5E5; padding: 2px 8px; margin: 10px 0 4px; }
        .it-p  { margin: 4px 0; font-size: 11pt; }
        .it-li { margin: 3px 0 3px 18px; font-size: 11pt; }
        .it-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10pt; }
        .it-table th { background: #C8C8C8; font-weight: 700; border: 1px solid #aaa; padding: 3px 6px; }
        .it-table td { border: 1px solid #ccc; padding: 3px 6px; }
        .it-table tr:nth-child(even) td { background: #f5f5f5; }
        .it-note { background: #fff8e1; border-left: 3px solid #f59e0b; padding: 6px 10px; margin: 8px 0; font-size: 10pt; }
        .it-info { background: #e8f4f8; border-left: 3px solid #3b82f6; padding: 6px 10px; margin: 8px 0; font-size: 10pt; }
        .it-code { font-family: 'Courier New', monospace; background: #f0f0f0; padding: 1px 4px; border-radius: 2px; font-size: 10pt; }
      `}</style>

      {/* Barra de controle */}
      <div className="no-print flex items-center gap-3 mb-6">
        <h2 className="text-white/70 font-semibold">IT-EMC-CISPR15-001 — Instrução de Trabalho</h2>
        <div className="flex-1" />
        <button onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/15 border border-gold/30 text-gold text-sm font-semibold hover:bg-gold/25 transition-all">
          <Printer size={14} /> Imprimir / Salvar PDF
        </button>
      </div>

      <div className="it-page max-w-[794px] mx-auto bg-white shadow-lg p-10 rounded">

        {/* Cabeçalho */}
        <table className="it-table" style={{ marginBottom: 16 }}>
          <tbody>
            <tr>
              <td rowSpan={3} style={{ width: '20%', textAlign: 'center', fontWeight: 700, fontSize: '9pt', color: '#003366', verticalAlign: 'middle' }}>
                LABELO<br/>PUCRS
              </td>
              <td colSpan={3} style={{ textAlign: 'center', fontWeight: 700, fontSize: '12pt', background: '#E5E5E5' }}>
                INSTRUÇÃO DE TRABALHO
              </td>
            </tr>
            <tr>
              <td style={{ width: '30%' }}><b>Título:</b> Formulário CISPR 15 – LABELO</td>
              <td style={{ width: '20%' }}><b>Código:</b> IT-EMC-CISPR15-001</td>
              <td style={{ width: '30%' }}><b>Revisão:</b> 1 &nbsp;|&nbsp; <b>Data:</b> {today}</td>
            </tr>
            <tr>
              <td><b>Elaborado por:</b> Rafael</td>
              <td><b>Aprovado por:</b> —</td>
              <td><b>Folhas:</b> 1</td>
            </tr>
          </tbody>
        </table>

        {/* 1. Objetivo */}
        <p className="it-h2">1. OBJETIVO</p>
        <p className="it-p">Descrever o procedimento para uso do aplicativo <b>CISPR 15 LABELO</b> — sistema desktop de emissão de Relatórios de Ensaio de compatibilidade eletromagnética, conforme a norma ABNT NBR IEC/CISPR 15/2014, incluindo o módulo de Agenda de Execução para acompanhamento de protocolos.</p>

        {/* 2. Escopo */}
        <p className="it-h2">2. ESCOPO</p>
        <p className="it-p">Aplicável a todos os ensaios de emissões eletromagnéticas conduzidas e radiadas em equipamentos de iluminação elétrica (lâmpadas e luminárias) realizados no LABELO-PUCRS. A Agenda de Execução é acessível a toda a equipe; a emissão de relatórios é restrita a usuários com senha.</p>

        {/* 3. Responsabilidades */}
        <p className="it-h2">3. RESPONSABILIDADES</p>
        <p className="it-li">• <b>Técnico de ensaio:</b> preenchimento da agenda, execução dos ensaios e registro de status.</p>
        <p className="it-li">• <b>Responsável pela emissão:</b> geração e revisão do relatório final (requer senha de acesso).</p>

        {/* 4. Procedimento */}
        <p className="it-h2">4. PROCEDIMENTO</p>

        <p className="it-h3">4.1 Acesso ao aplicativo</p>
        <p className="it-li">1. Abrir o <b>CISPR 15 LABELO</b> pelo atalho na área de trabalho ou no menu Iniciar.</p>
        <p className="it-li">2. O aplicativo abre diretamente na tela principal de emissão (CISPR 15).</p>
        <p className="it-li">3. Para acessar a <b>Agenda de Execução</b>, clicar no botão <b>"Agenda"</b> na tela principal ou usar o menu <b>Agenda → Agenda de Execução</b> (atalho <span className="it-code">Ctrl+A</span>).</p>
        <div className="it-info">
          <b>Rede compartilhada:</b> Para que os dados (clientes, relatórios e agenda) fiquem acessíveis a todos os computadores da rede, configurar a <b>Pasta de Dados Compartilhados</b> em <b>Configurações</b> (<span className="it-code">Ctrl+,</span>), apontando para uma pasta na rede local (ex.: <span className="it-code">\\servidor\projetos\CISPR15\dados</span>).
        </div>

        <p className="it-h3">4.2 Senha de acesso à emissão</p>
        <p className="it-p">A área de emissão de relatórios pode ser protegida por senha. Se configurada:</p>
        <p className="it-li">• O sistema solicitará a senha uma vez por sessão ao abrir o aplicativo.</p>
        <p className="it-li">• A <b>Agenda de Execução</b> é sempre acessível sem senha.</p>
        <p className="it-li">• A senha é definida em <b>Configurações → Segurança → Senha de acesso à emissão</b>.</p>
        <div className="it-note">
          <b>Atenção:</b> Deixar o campo em branco em Configurações remove a proteção por senha (acesso livre para todos).
        </div>

        <p className="it-h3">4.3 Tipo de DUT e Tensão de Ensaio</p>
        <p className="it-li">• Selecionar <b>Lâmpada</b> ou <b>Luminária</b>.</p>
        <p className="it-li">• Para <b>Lâmpada</b>, selecionar a(s) tensão(ões) de ensaio:</p>
        <table className="it-table" style={{ marginLeft: 18, width: 'calc(100% - 18px)' }}>
          <thead><tr><th>Opção</th><th>Tensões</th><th>Uso típico</th></tr></thead>
          <tbody>
            <tr><td>127 V</td><td>Apenas 127 V</td><td>Produto exclusivo para rede 127 V</td></tr>
            <tr><td>127 V + 220 V</td><td>127 V e 220 V</td><td>Padrão Brasil (bivolt)</td></tr>
            <tr><td>127 V + 220 V + 277 V</td><td>127 V, 220 V e 277 V</td><td>Produto para exportação (EUA/CA)</td></tr>
          </tbody>
        </table>
        <p className="it-li">• Para <b>Luminária</b>: tensão fixada em 220 V (conforme norma).</p>

        <p className="it-h3">4.4 Dados do Cliente</p>
        <p className="it-li">• <b>Nome do Cliente:</b> razão social completa.</p>
        <p className="it-li">• <b>Rua:</b> logradouro, número e bairro.</p>
        <p className="it-li">• <b>CEP:</b> digitar apenas os 8 números (ex.: <span className="it-code">70830010</span>). O sistema preenche a cidade automaticamente via ViaCEP.</p>
        <p className="it-li">• Clientes frequentes podem ser salvos com <b>"Salvar no banco"</b> e recuperados na aba <b>"Clientes"</b>.</p>

        <p className="it-h3">4.5 Objeto Ensaiado (DUT)</p>
        <table className="it-table">
          <thead><tr><th>Campo</th><th>Descrição / Exemplo</th></tr></thead>
          <tbody>
            <tr><td>Produto / Descrição</td><td>Nome comercial ou técnico (ex.: Luminária LED Industrial)</td></tr>
            <tr><td>Fabricante</td><td>Nome do fabricante (ex.: Tradetek)</td></tr>
            <tr><td>Modelo</td><td>Código ou referência do modelo (ex.: AGN7120D4)</td></tr>
            <tr><td>Número de série</td><td>Identificador único da amostra recebida <i>(apenas Lâmpada)</i></td></tr>
            <tr><td>Código de barras</td><td>Identificador único da amostra recebida <i>(apenas Luminária)</i></td></tr>
            <tr><td>Lacre</td><td>Número do lacre aplicado à amostra <i>(apenas Lâmpada)</i></td></tr>
            <tr><td>Potência Nominal</td><td>Em watts com unidade (ex.: 120W)</td></tr>
            <tr><td>Tensão de Alimentação</td><td>Faixa declarada no produto (ex.: 90 a 305 VAC)</td></tr>
            <tr><td>Frequência de Rede</td><td>Padrão: 50/60 Hz</td></tr>
            <tr><td>Documentação que acompanha</td><td>Padrão: <i>embalagem com especificações</i></td></tr>
          </tbody>
        </table>

        <p className="it-h3">4.6 Dados do Relatório</p>
        <table className="it-table">
          <thead><tr><th>Campo</th><th>Observação</th></tr></thead>
          <tbody>
            <tr><td>N° do Relatório</td><td>Gerado automaticamente ao clicar em <b>"Gerar Relatório"</b> (registra na planilha Excel)</td></tr>
            <tr><td>Protocolo LABELO</td><td>Número do protocolo interno de recebimento da amostra</td></tr>
            <tr><td>Orçamento LABELO</td><td>Número do orçamento aprovado pelo cliente</td></tr>
            <tr><td>Responsável Técnico</td><td>Nome completo do responsável pela emissão</td></tr>
            <tr><td>Período – Início / Fim</td><td>Datas de realização dos ensaios</td></tr>
            <tr><td>Data de Emissão</td><td>Data de emissão do relatório (geralmente a data atual)</td></tr>
          </tbody>
        </table>

        <p className="it-h3">4.7 Carregar arquivos do ensaio</p>
        <p className="it-p"><b>Opção A — Pasta completa (recomendado):</b></p>
        <p className="it-li">1. Clicar em <b>"Carregar Pasta do Ensaio"</b>.</p>
        <p className="it-li">2. Selecionar a pasta que contém o arquivo <span className="it-code">.docx</span> do Radimation e as fotos numeradas.</p>
        <p className="it-li">3. O sistema carrega automaticamente o DOCX e as fotos em ordem numérica.</p>

        <p className="it-p" style={{ marginTop: 8 }}><b>Estrutura de pasta recomendada:</b></p>
        <div style={{ fontFamily: 'Courier New, monospace', fontSize: '9.5pt', background: '#f4f4f4', padding: '8px 12px', borderRadius: 4, margin: '4px 0 8px 18px' }}>
          📁 Pasta_Ensaio/<br/>
          &nbsp;&nbsp;&nbsp;📄 Resultados_Radimation.docx<br/>
          &nbsp;&nbsp;&nbsp;🖼 1.jpg&nbsp;&nbsp;← Foto da amostra (frente)<br/>
          &nbsp;&nbsp;&nbsp;🖼 2.jpg&nbsp;&nbsp;← Foto da amostra (trás)<br/>
          &nbsp;&nbsp;&nbsp;🖼 3.jpg&nbsp;&nbsp;← Foto adicional<br/>
          &nbsp;&nbsp;&nbsp;🖼 4.jpg&nbsp;&nbsp;← Foto adicional
        </div>

        <div className="it-note">
          <b>⚠ Atenção:</b> Nomear as fotos com números (1, 2, 3…) para ordenação automática. Formatos aceitos: JPG, PNG, WEBP.
        </div>

        <p className="it-p"><b>Opção B — Carregamento individual:</b></p>
        <p className="it-li">• Usar os botões individuais <b>".docx"</b> e <b>"fotos"</b> separadamente.</p>

        <p className="it-h3">4.8 Gerar o Relatório</p>
        <p className="it-li">1. Clicar em <b>"Gerar Relatório"</b> — registra na planilha Excel e abre a visualização do PDF.</p>
        <p className="it-li">2. Verificar o conteúdo na tela (conferir dados, fotos e resultados).</p>
        <p className="it-li">3. Clicar em <b>"Baixar PDF"</b> — aguardar a geração (pode levar até 30 s) e salvar o arquivo.</p>
        <p className="it-li">4. Se a opção <b>"Salvar PDF automaticamente na pasta da EUT"</b> estiver ativada em Configurações, o PDF é salvo automaticamente na pasta selecionada.</p>
        <div className="it-note">
          <b>Atenção:</b> O nome do arquivo PDF é gerado automaticamente no formato:<br/>
          <span className="it-code">NúmRelatorio_Protocolo_Cliente_Tipo.pdf</span>
        </div>

        <p className="it-h3">4.9 Novo Relatório</p>
        <p className="it-p">Ao concluir um relatório e iniciar um novo:</p>
        <p className="it-li">• Clicar em <b>"Novo Relatório"</b> (botão no topo do formulário) para limpar todos os campos e começar em branco.</p>
        <p className="it-li">• Se o formulário estiver bloqueado (relatório já emitido), clicar em <b>"Novo"</b> no banner amarelo.</p>
        <div className="it-info">
          <b>Comportamento ao reiniciar o app:</b> Ao fechar e reabrir o aplicativo, o formulário é sempre apresentado em branco, independentemente do último relatório preenchido.
        </div>

        <p className="it-h3">4.10 Emenda de Relatório</p>
        <p className="it-p">Quando for necessário corrigir informações de um relatório já emitido:</p>
        <p className="it-li">1. Na tela CISPR 15, clicar em <b>"Gerar Emenda"</b>.</p>
        <p className="it-li">2. Selecionar o relatório original na lista.</p>
        <p className="it-li">3. Editar os campos que sofreram alteração — campos modificados ficam destacados em âmbar.</p>
        <p className="it-li">4. Marcar as fotos ou resultados substituídos (quando aplicável).</p>
        <p className="it-li">5. Clicar em <b>"Gerar Emenda N"</b> — o relatório exibirá marcadores <b>¹ ² ³</b> nas seções alteradas e uma <b>Seção 6 – Histórico de Alterações</b>.</p>
        <p className="it-li">6. Baixar o PDF da emenda normalmente.</p>

        <p className="it-h3">4.11 Agenda de Execução</p>
        <p className="it-p">A Agenda permite o acompanhamento de todos os protocolos em andamento e concluídos. Acesso via botão <b>"Agenda"</b> ou menu <b>Agenda → Agenda de Execução</b>. <b>Não requer senha.</b></p>

        <p className="it-p"><b>Cadastro individual:</b></p>
        <p className="it-li">• Clicar em <b>"Novo"</b>, preencher protocolo, orçamento, cliente, produto, datas e responsável.</p>
        <p className="it-li">• A <b>Previsão de Saída</b> é calculada automaticamente como +10 dias úteis a partir da entrada. Pode ser ajustada manualmente ou recalculada com o botão ↺.</p>

        <p className="it-p"><b>Cadastro em lote:</b></p>
        <p className="it-li">• Clicar em <b>"Lote"</b> e inserir vários protocolos de uma vez (um por linha ou separados por vírgula).</p>
        <p className="it-li">• Campos comuns (cliente, produto, datas) são aplicados a todos os itens do lote.</p>

        <p className="it-p"><b>Marcadores (tags):</b></p>
        <table className="it-table">
          <thead><tr><th>Marcador</th><th>Uso</th></tr></thead>
          <tbody>
            <tr><td>Urgente</td><td>Protocolo com prioridade máxima</td></tr>
            <tr><td>Reensaio</td><td>Ensaio que precisa ser repetido</td></tr>
            <tr><td>Reprov. Conduzida</td><td>Amostra reprovada no ensaio de emissão conduzida</td></tr>
            <tr><td>Reprov. Loop</td><td>Amostra reprovada no ensaio de antena loop</td></tr>
            <tr><td>Reprov. Anexo B</td><td>Amostra reprovada nos critérios do Anexo B</td></tr>
          </tbody>
        </table>

        <p className="it-p"><b>Status dos ensaios:</b> Os badges <b>C</b> (Conduzida), <b>L</b> (Loop) e <b>B</b> (Anexo B) são clicáveis diretamente na lista para alternar entre pendente e realizado.</p>

        <p className="it-p"><b>Concluídos:</b> Ao preencher o <b>N° do Relatório</b> no item e salvar, ele é automaticamente movido para a aba <b>"Concluídos"</b>. Se o PDF for vinculado ao item, o número do relatório vira um link que abre o arquivo diretamente.</p>

        <p className="it-p"><b>Código de cores na lista:</b></p>
        <table className="it-table">
          <thead><tr><th>Cor da borda</th><th>Significado</th></tr></thead>
          <tbody>
            <tr><td style={{ borderLeft: '4px solid rgba(34,197,94,0.7)' }}>Verde</td><td>Prazo em dia (mais de 3 dias úteis restantes)</td></tr>
            <tr><td style={{ borderLeft: '4px solid rgba(251,191,36,0.8)' }}>Âmbar</td><td>Vence em 3 dias ou menos</td></tr>
            <tr><td style={{ borderLeft: '4px solid rgba(239,68,68,0.8)' }}>Vermelho</td><td>Prazo vencido</td></tr>
          </tbody>
        </table>

        <p className="it-p"><b>Aba Análise:</b> Exibe gráficos de distribuição de status, entradas por mês, top clientes e itens vencidos/urgentes. Clicando em um item da lista de atenção, abre o modal de edição diretamente.</p>

        <p className="it-h3">4.12 Configurações</p>
        <p className="it-p">Acessar em <b>Arquivo → Configurações</b> (<span className="it-code">Ctrl+,</span>) ou pelo botão de engrenagem na Agenda.</p>
        <table className="it-table">
          <thead><tr><th>Configuração</th><th>Descrição</th></tr></thead>
          <tbody>
            <tr><td>Planilha Excel</td><td>Caminho da planilha onde os números de relatório são registrados automaticamente</td></tr>
            <tr><td>Pasta de Dados Compartilhados</td><td>Pasta de rede onde <span className="it-code">cispr15_clientes.json</span>, <span className="it-code">cispr15_relatorios.json</span> e <span className="it-code">cispr15_agenda.json</span> são armazenados. Todos os PCs com acesso à pasta veem os mesmos dados.</td></tr>
            <tr><td>Salvar PDF na pasta da EUT</td><td>Se ativado, o PDF é salvo automaticamente na pasta do ensaio ao gerar</td></tr>
            <tr><td>Senha de acesso à emissão</td><td>Protege a área de emissão. Vazio = sem senha</td></tr>
          </tbody>
        </table>

        {/* 5. Documentos relacionados */}
        <p className="it-h2">5. DOCUMENTOS RELACIONADOS</p>
        <p className="it-li">• ABNT NBR IEC/CISPR 15/2014 — Limites e métodos de medição das radioperturbações de equipamentos de iluminação</p>
        <p className="it-li">• Portaria INMETRO n°62, de 17 de fevereiro de 2022 — RTQ e RAC para Luminárias para iluminação pública viária</p>
        <p className="it-li">• CISPR 16-4-2 Segunda Edição/2011 — Incertezas em medições EMC</p>
        <p className="it-li">• Planilha de controle: <span className="it-code">Compatibilidade eletromagnética_2026.xlsx</span></p>

        {/* 6. Histórico de revisões */}
        <p className="it-h2">6. HISTÓRICO DE REVISÕES</p>
        <table className="it-table">
          <thead><tr><th>Rev.</th><th>Data</th><th>Descrição</th><th>Elaborado por</th></tr></thead>
          <tbody>
            <tr><td>0</td><td>—</td><td>Emissão inicial</td><td>Rafael</td></tr>
            <tr><td>1</td><td>{today}</td><td>Atualização para app standalone: senha de acesso, Agenda de Execução (lote, marcadores, análise), campo Lacre, novo relatório, configurações de rede</td><td>Rafael</td></tr>
          </tbody>
        </table>

      </div>
    </>
  )
}
