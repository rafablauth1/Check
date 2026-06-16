import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE   = 'http://localhost:3000';
const OUTDIR = path.join(process.cwd(), 'screenshots_manual');

if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

async function shot(page, name, title) {
  const file = path.join(OUTDIR, name + '.png');
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ✓ ${title} → ${name}.png`);
  return file;
}

async function clickText(page, text, wait = 1200) {
  const handles = await page.$$('button');
  for (const h of handles) {
    const t = await h.evaluate(el => el.textContent?.trim());
    if (t?.includes(text)) { await h.click(); break; }
  }
  await new Promise(r => setTimeout(r, wait));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1400, height: 900 },
  });

  const page = await browser.newPage();

  // ── 1. Formulário principal (aguarda mais tempo)
  console.log('Navegando para /cispr15...');
  await page.goto(BASE + '/cispr15', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 4000));
  await shot(page, '01_formulario_principal', 'Formulário CISPR 15 — aba Formulário');

  // ── Scroll para mostrar o formulário completo (parte inferior)
  await page.evaluate(() => window.scrollTo(0, 600));
  await new Promise(r => setTimeout(r, 500));
  await shot(page, '01b_formulario_inferior', 'Formulário CISPR 15 — parte inferior (anexos/botões)');
  await page.evaluate(() => window.scrollTo(0, 0));

  // ── 2. Aba Clientes
  await page.goto(BASE + '/cispr15', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2500));
  await clickText(page, 'Clientes');
  await shot(page, '02_aba_clientes', 'Aba Clientes');

  // ── 3. Aba Emendas
  await clickText(page, 'Emendas');
  await shot(page, '03_aba_emendas', 'Aba Emendas');

  // ── 4. Aba Relatórios
  await clickText(page, 'Relatórios');
  await shot(page, '04_aba_relatorios', 'Aba Relatórios');

  // ── 5. Configurações
  await page.goto(BASE + '/configuracoes', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2500));
  await shot(page, '05_configuracoes', 'Configurações');

  // ── Scroll configurações (parte de baixo: senha / botões)
  await page.evaluate(() => window.scrollTo(0, 600));
  await new Promise(r => setTimeout(r, 500));
  await shot(page, '05b_configuracoes_inferior', 'Configurações — parte inferior (senha/salvar)');

  // ── 6. Agenda
  await page.goto(BASE + '/agenda', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2500));
  await shot(page, '06_agenda', 'Agenda de Execução — aba Agenda');

  // ── 7. Agenda — modal Novo Item
  const handles = await page.$$('button');
  for (const h of handles) {
    const t = await h.evaluate(el => el.textContent?.trim());
    if (t?.includes('Novo')) { await h.click(); break; }
  }
  await new Promise(r => setTimeout(r, 1200));
  await shot(page, '07_agenda_novo_item', 'Agenda — Modal Novo Item');
  // fechar modal
  const closeHandles = await page.$$('button');
  for (const h of closeHandles) {
    const t = await h.evaluate(el => el.textContent?.trim());
    if (t === 'Cancelar') { await h.click(); break; }
  }

  // ── 8. Agenda — aba Análise
  await clickText(page, 'Análise');
  await shot(page, '08_agenda_analise', 'Agenda — aba Análise');

  // ── 9. Relatório PDF
  await page.goto(BASE + '/cispr15/relatorio', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3500));
  await shot(page, '09_relatorio_pdf', 'Visualização do Relatório (PDF)');

  // ── 10. Modal gate de senha (simulado injetando via evaluate)
  await page.goto(BASE + '/cispr15', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2500));
  // Injeta o modal de senha visualmente para screenshot
  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,0.8);backdrop-filter:blur(4px);
    `;
    overlay.innerHTML = `
      <div style="background:#141B28;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px;width:360px;display:flex;flex-direction:column;gap:20px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:44px;height:44px;border-radius:12px;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.25);display:flex;align-items:center;justify-content:center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div>
            <p style="font-weight:700;color:#fff;margin:0;font-size:15px;">Área de Emissão</p>
            <p style="font-size:11px;color:rgba(255,255,255,0.4);margin:4px 0 0">Informe a senha para acessar</p>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:10px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.1em;font-family:monospace;">Senha</label>
          <input type="password" placeholder="••••••" value="••••••" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 12px;color:#fff;font-size:14px;width:100%;box-sizing:border-box;" />
        </div>
        <button style="background:#D4AF37;color:#000;border:none;border-radius:10px;padding:12px;font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          Entrar
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
  });
  await new Promise(r => setTimeout(r, 600));
  await shot(page, '10_modal_senha', 'Modal de Senha — Acesso à Emissão');

  await browser.close();
  console.log('\n✅ Todos os screenshots salvos em:', OUTDIR);
  const files = fs.readdirSync(OUTDIR).filter(f => f.endsWith('.png'));
  console.log('Arquivos:', files.join(', '));
})();
