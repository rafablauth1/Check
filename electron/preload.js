const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // PDF
  salvarPDF:       (filename)  => ipcRenderer.invoke('pdf:save',              { filename }),
  salvarPDFNaEut:  (filename, folderPath) => ipcRenderer.invoke('pdf:save-eut', { filename, folderPath }),
  deletePdfCopy:   (pdfPath)   => ipcRenderer.invoke('pdf:delete-copy',       { pdfPath }),
  findPdfCopy:     (query)     => ipcRenderer.invoke('pdf:find-in-copy-folder', { query }),

  // Excel
  checkProtocolo:  (protocolo) => ipcRenderer.invoke('excel:check-protocolo', { protocolo }),
  proximoNumero:   ()          => ipcRenderer.invoke('excel:proximo-numero'),
  registrarExcel:  (dados)     => ipcRenderer.invoke('excel:registrar',       dados),

  // Docx
  parseDocx:       (arr)       => ipcRenderer.invoke('docx:parse',            { buffer: arr }),

  // Pasta EUT
  abrirPastaEut:   ()          => ipcRenderer.invoke('eut:open-folder'),
  getEutFolder:    ()          => ipcRenderer.invoke('eut:get-folder'),
  limparPastaEut:  ()          => ipcRenderer.invoke('eut:clear-folder'),

  // Configurações
  getSettings:     ()          => ipcRenderer.invoke('settings:get'),
  setSettings:     (partial)   => ipcRenderer.invoke('settings:set',          partial),
  browseExcel:     ()          => ipcRenderer.invoke('settings:browse-excel'),
  browseFolder:    (title)     => ipcRenderer.invoke('settings:browse-folder', { title }),
  getLocalDataDir: ()          => ipcRenderer.invoke('settings:get-local-data-dir'),

  // Backup do banco de dados
  backupNow:       (destBase)        => ipcRenderer.invoke('backup:run',        { destBase }),
  listBackups:     (destBase)        => ipcRenderer.invoke('backup:list',       { destBase }),
  restoreBackup:   (destBase, which) => ipcRenderer.invoke('backup:restore',    { destBase, which }),
  openBackupFolder:(destBase)        => ipcRenderer.invoke('backup:open-folder',{ destBase }),

  // Dados de rede (clientes / relatórios / agenda)
  getClientes:     ()          => ipcRenderer.invoke('data:get-clientes'),
  saveClientes:    (clientes)  => ipcRenderer.invoke('data:save-clientes',    { clientes }),
  getRelatorios:   ()          => ipcRenderer.invoke('data:get-relatorios'),
  saveRelatorios:  (relatorios) => ipcRenderer.invoke('data:save-relatorios', { relatorios }),
  saveRelatorioAssets: (id, photos, docxHtml) => ipcRenderer.invoke('data:save-relatorio-assets', { id, photos, docxHtml }),
  getRelatorioAssets:  (id)    => ipcRenderer.invoke('data:get-relatorio-assets',    { id }),
  deleteRelatorioAssets: (id)  => ipcRenderer.invoke('data:delete-relatorio-assets', { id }),
  exportRelatorioFiles: (folderPath, numRelatorio, photos, docxHtml, docxName) => ipcRenderer.invoke('relatorio:export-files', { folderPath, numRelatorio, photos, docxHtml, docxName }),
  getAgenda:       ()          => ipcRenderer.invoke('data:get-agenda'),
  saveAgenda:      (agenda)    => ipcRenderer.invoke('data:save-agenda',      { agenda }),

  // Lote em andamento (arquivo local) + baixar PDFs do lote
  getLote:         ()          => ipcRenderer.invoke('lote:get'),
  saveLoteFile:    (lote)      => ipcRenderer.invoke('lote:save',  { lote }),
  clearLoteFile:   ()          => ipcRenderer.invoke('lote:clear'),
  saveLotePdf:     (args)      => ipcRenderer.invoke('lote:save-pdf', args),
  // OCR local (Windows.Media.Ocr)
  recognizeOcr:    (images)  => ipcRenderer.invoke('ocr:recognize', { images }),
  // Extração de texto de PDF (pdf-parse via main process)
  extractPdfText:  (base64)  => ipcRenderer.invoke('pdf:extract-text', { base64 }),
  extractPdfLayout:(base64)  => ipcRenderer.invoke('pdf:extract-layout', { base64 }),
  scanCertificados:(pastaMae)=> ipcRenderer.invoke('equip:scan-certificados', { pastaMae }),
  // Scan rápido (sem OCR) — lista subpastas e encontra PDFs sem ler conteúdo
  scanRapido:      (pastaMae)=> ipcRenderer.invoke('equip:scan-rapido',       { pastaMae }),
  // Lê e extrai texto de um único PDF (on demand, para processar após sync)
  lerPdf:          (certPath)=> ipcRenderer.invoke('equip:ler-pdf',           { certPath }),
  extractPdfPage1: (base64)  => ipcRenderer.invoke('pdf:extract-page1', { base64 }),

  // Follow-up PDF direto
  saveFollowupPdf: (html, filename, landscape) => ipcRenderer.invoke('pdf:followup', { html, filename, landscape }),

  // Shell / arquivos
  openPath:        (path)  => ipcRenderer.invoke('shell:open-path',       { path }),
  browsePDF:       ()      => ipcRenderer.invoke('settings:browse-pdf'),
  focusWindow:     ()      => ipcRenderer.invoke('window:focus'),

  // Eventos do menu
  onMenuSalvarPDF:    (cb) => ipcRenderer.on('menu:salvar-pdf',     () => cb()),
  onMenuSalvarPDFEut: (cb) => ipcRenderer.on('menu:salvar-pdf-eut', () => cb()),

  // Cancelar PDF
  cancelPdf:      (eutFolderPath, pdfFilename, ano) => ipcRenderer.invoke('relatorio:cancel-pdf', { eutFolderPath, pdfFilename, ano }),

  // Publicar PDF assinado para pasta da agenda
  publishPdf:     (eutFolderPath, pdfFilename, ano) => ipcRenderer.invoke('pdf:publish', { eutFolderPath, pdfFilename, ano }),

  // Auto-update
  checkUpdate:    ()          => ipcRenderer.invoke('update:check'),
  installUpdate:  (installer) => ipcRenderer.invoke('update:install', { installer }),

  // Assinatura digital (Windows Certificate Store)
  listCerts:      ()                             => ipcRenderer.invoke('pdf:list-certs'),
  signPdf:        (eutFolderPath, pdfFilename)   => ipcRenderer.invoke('pdf:sign-file', { eutFolderPath, pdfFilename }),
  // Assinatura digital via arquivo .pfx (sem importar no Windows)
  pickPfx:        ()                             => ipcRenderer.invoke('pdf:pick-pfx'),
  validatePfx:    (pfxPath, password)            => ipcRenderer.invoke('pdf:validate-pfx', { pfxPath, password }),

})
