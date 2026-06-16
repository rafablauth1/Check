const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType } = require('docx')
const fs = require('fs')

const AZUL    = '1F3864'
const AZUL2   = '2E74B5'
const CINZA   = 'F2F2F2'
const BRANCO  = 'FFFFFF'

function titulo(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 200, after: 200 },
    children: [new TextRun({ text, bold: true, color: AZUL, size: 32 })],
  })
}

function secao(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: AZUL2 } },
    children: [new TextRun({ text, bold: true, color: AZUL2, size: 26 })],
  })
}

function tabela(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: ['Tecnologia', 'Categoria', 'Descrição'].map(h =>
          new TableCell({
            shading: { type: ShadingType.SOLID, color: AZUL, fill: AZUL },
            children: [new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [new TextRun({ text: h, bold: true, color: BRANCO, size: 22 })],
            })],
          })
        ),
      }),
      ...rows.map((r, i) =>
        new TableRow({
          children: r.map(cell =>
            new TableCell({
              shading: { type: ShadingType.SOLID, color: i % 2 === 0 ? BRANCO : CINZA, fill: i % 2 === 0 ? BRANCO : CINZA },
              children: [new Paragraph({
                children: [new TextRun({ text: cell, size: 20 })],
              })],
            })
          ),
        })
      ),
    ],
  })
}

function espaco() {
  return new Paragraph({ text: '', spacing: { before: 100, after: 100 } })
}

const doc = new Document({
  creator: 'LABELO/PUCRS',
  title: 'Stack Tecnológica — CISPR 15 LABELO',
  sections: [{
    children: [
      titulo('Stack Tecnológica — CISPR 15 LABELO'),
      new Paragraph({
        spacing: { after: 300 },
        children: [new TextRun({ text: 'Documento gerado automaticamente. Descreve todas as linguagens, frameworks e bibliotecas utilizados no sistema.', italics: true, color: '666666', size: 20 })],
      }),

      secao('Linguagens de Programação'),
      espaco(),
      tabela([
        ['TypeScript',   'Linguagem',  'Frontend e lógica da aplicação web (React/Next.js)'],
        ['JavaScript',  'Linguagem',  'Backend Electron, scripts Node.js e configurações'],
        ['PowerShell',  'Linguagem',  'Scripts de automação de build, instalação e deploy'],
        ['NSIS Script', 'Linguagem',  'Script do instalador Windows gerado pelo electron-builder'],
        ['Batch (.bat)','Linguagem',  'Script de instalação automatizada para usuário final'],
        ['CSS',         'Linguagem',  'Estilização via Tailwind CSS (gerado em build)'],
      ]),

      espaco(),
      secao('Frameworks e Plataformas'),
      espaco(),
      tabela([
        ['Next.js 14',      'Framework Web',     'Framework React para SSR/SSG — serve a interface da aplicação'],
        ['React 18',        'Framework UI',      'Biblioteca de componentes para construção da interface'],
        ['Electron 31',     'Plataforma Desktop','Empacota a aplicação web como app nativo Windows (.exe)'],
        ['Tailwind CSS 3',  'Framework CSS',     'Utilitário de classes para estilização responsiva'],
        ['Node.js',         'Runtime',           'Ambiente de execução JavaScript no processo Electron/main'],
      ]),

      espaco(),
      secao('Bibliotecas de Funcionalidade'),
      espaco(),
      tabela([
        ['xlsx',                  'Planilhas',        'Leitura de arquivos Excel (.xlsx/.xls) para integração com protocolo'],
        ['xlsx-populate',         'Planilhas',        'Escrita em Excel preservando formatação original do modelo'],
        ['mammoth',               'Documentos',       'Conversão e parse de arquivos DOCX para HTML'],
        ['@signpdf/signpdf',      'PDF',              'Assinatura digital de PDFs com certificado do Windows'],
        ['@signpdf/placeholder-plain', 'PDF',         'Inserção de placeholder de assinatura em PDFs gerados'],
        ['node-forge',            'Criptografia',     'Manipulação de certificados X.509 e operações criptográficas'],
        ['tesseract.js',          'OCR',              'Reconhecimento óptico de caracteres em imagens da EUT'],
        ['@anthropic-ai/sdk',     'IA',               'Integração com API Claude (Anthropic) para recursos de IA'],
        ['lucide-react',          'UI / Ícones',      'Biblioteca de ícones SVG para interface React'],
        ['date-fns',              'Utilitários',      'Manipulação e formatação de datas'],
        ['clsx',                  'Utilitários',      'Composição condicional de classes CSS'],
        ['cheerio',               'Utilitários',      'Parse e manipulação de HTML no servidor (Node.js)'],
        ['puppeteer-core',        'PDF/Browser',      'Automação de browser para geração de PDFs complexos'],
      ]),

      espaco(),
      secao('Ferramentas de Build e Empacotamento'),
      espaco(),
      tabela([
        ['electron-builder 24', 'Build',      'Gera instalador NSIS (.exe) para Windows x64'],
        ['TypeScript 5',        'Build',      'Compilador — transpila TS para JS em tempo de build'],
        ['PostCSS',             'Build',      'Processamento do CSS Tailwind'],
        ['Autoprefixer',        'Build',      'Adiciona prefixos CSS para compatibilidade entre browsers'],
        ['NSIS 3',              'Installer',  'Sistema de criação de instaladores Windows (via electron-builder)'],
      ]),

      espaco(),
      secao('Infraestrutura e Armazenamento'),
      espaco(),
      tabela([
        ['Sistema de arquivos local', 'Storage', 'Dados em %AppData%\\Roaming\\cispr15-labelo\\ (persiste entre updates)'],
        ['Pasta de rede (SMB)',       'Storage', 'Opcional — dados compartilhados via mapeamento de rede (T:, R:, S:)'],
        ['localStorage (Web)',        'Storage', 'Fallback para dados em contexto de browser/desenvolvimento'],
        ['Windows Certificate Store', 'Segurança','Armazenamento de certificados digitais para assinatura de PDF'],
        ['Windows Firewall (netsh)',  'Rede',    'Regras de firewall adicionadas automaticamente pelo instalador'],
        ['Windows OCR (PowerShell)',  'IA/OCR',  'Engine OCR nativa do Windows via Windows.Media.Ocr'],
      ]),

      espaco(),
      new Paragraph({
        spacing: { before: 400 },
        children: [new TextRun({ text: 'LABELO / PUCRS — Sistema CISPR 15', italics: true, color: '999999', size: 18 })],
      }),
    ],
  }],
})

Packer.toBuffer(doc).then(buffer => {
  const out = 'Stack_Tecnologica_CISPR15_LABELO.docx'
  fs.writeFileSync(out, buffer)
  console.log('✓ Gerado:', out)
}).catch(err => {
  console.error('Erro:', err.message)
})
