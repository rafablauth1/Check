export interface AppSettings {
  excelPath: string
  dataFolder: string
  agendaFolder: string
  pdfCopyFolder: string
  pdfAutoSaveToEut: boolean
  senhaEmissao: string
  updateFolder: string
  certThumbprint: string
}

export const SETTINGS_DEFAULTS: AppSettings = {
  excelPath: '',
  dataFolder: '',
  agendaFolder: '',
  pdfCopyFolder: '',
  pdfAutoSaveToEut: true,
  senhaEmissao: '',
  updateFolder: '',
  certThumbprint: '',
}

export const AUTH_KEY     = 'checagens_authed_v1'
export const SETTINGS_KEY = 'checagens_app_settings_v1'
