/* Abertura da tela do relatório (a "Ver PDF").
 *
 * Por que não usa router.push: essa tela lê TODO o seu conteúdo de fora do
 * React — cfg e rascunho da emenda no localStorage, DOCX no sessionStorage,
 * fotos no IndexedDB — e faz isso num useEffect de montagem. Navegando pelo
 * router do Next, ao voltar pra uma rota já visitada o segmento vem do cache do
 * cliente e o componente não remonta: o efeito não roda, e a tela mostra o
 * conteúdo de antes. Era por isso que, depois de mexer numa emenda, só fechando
 * e reabrindo o app o PDF aparecia atualizado.
 *
 * Numa tela de relatório de ensaio, mostrar conteúdo velho é pior que demorar
 * 300ms: dá pra exportar e assinar um PDF com os dados errados. Então aqui a
 * navegação é de documento mesmo — recarrega e relê tudo do zero, que é o mesmo
 * efeito de reiniciar o app.
 *
 * localStorage, sessionStorage e IndexedDB sobrevivem a essa navegação; o
 * caminho relativo preserva a origem (3000 no dev, 3721 no empacotado).
 */
const VOLTAR_KEY = 'relatorioVoltarPara'

export function abrirRelatorio(query = ''): void {
  // guarda a tela de origem (com a query: ?id= do lote, ?num= da emenda) para o "Voltar"
  try { sessionStorage.setItem(VOLTAR_KEY, window.location.pathname + window.location.search) } catch {}
  window.location.assign('/cispr15/relatorio' + query)
}

/* "Voltar" do relatório: vai para a tela que o abriu, pelo endereço — não pelo
 * histórico. O history.back() voltava para o que estivesse antes no histórico
 * da janela, e num PC do laboratório essa entrada dava "Bad Gateway". */
export function voltarDoRelatorio(padrao: string): void {
  let url: string | null = null
  try { url = sessionStorage.getItem(VOLTAR_KEY) } catch {}
  window.location.assign(url && url.startsWith('/') && !url.startsWith('/cispr15/relatorio') ? url : padrao)
}
