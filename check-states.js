const { chromium } = require('playwright');
const path = require('path');

async function check() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // Check QR scanner URL params
  const qrUrl = 'file:///' + path.join(__dirname, 'screens', '22-qr-scanner.html').replace(/\\/g, '/');
  await page.goto(qrUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(500);
  const hasQS = await page.evaluate(() => {
    const s = document.querySelector('script');
    return s ? (s.textContent.includes('URLSearchParams') || s.textContent.includes('location.search')) : false;
  });
  console.log('QR scanner parses URL params:', hasQS);

  // Check 07-add-event setStep
  const addUrl = 'file:///' + path.join(__dirname, 'screens', '07-add-event.html').replace(/\\/g, '/');
  await page.goto(addUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(500);
  const hasSetStep = await page.evaluate(() => typeof window.setStep === 'function');
  console.log('07-add-event setStep:', hasSetStep);
  if (hasSetStep) {
    await page.evaluate(() => setStep('facility'));
    await page.waitForTimeout(300);
    const now = await page.evaluate(() => {
      const el = document.querySelector('.is-now');
      return el ? el.id || el.className : 'none';
    });
    console.log('After setStep(facility), active:', now);
  }

  // Check 15-event-marathon tab parsing
  const evUrl = 'file:///' + path.join(__dirname, 'screens', '15-event-marathon.html').replace(/\\/g, '/');
  await page.goto(evUrl + '?tab=res', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(500);
  const activeTab = await page.evaluate(() => {
    const t = document.querySelector('.evd-tab.is-on, .evd-tab[aria-selected="true"]');
    return t ? t.textContent.trim() : 'none';
  });
  console.log('Marathon ?tab=res, active tab:', activeTab);

  // Check activities seg-btn
  const actUrl = 'file:///' + path.join(__dirname, 'screens', 'activities.html').replace(/\\/g, '/');
  await page.goto(actUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(500);
  const hasSegBtn = await page.evaluate(() => {
    const btn = document.querySelector('.seg-btn[data-period="month"]');
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log('Activities seg-btn month clicked:', hasSegBtn);
  if (hasSegBtn) {
    await page.waitForTimeout(300);
    const active = await page.evaluate(() => {
      const b = document.querySelector('.seg-btn.is-active, .seg-btn[data-period].is-active');
      return b ? b.dataset.period : 'none';
    });
    console.log('Active period:', active);
  }

  // Check rating-details panel switching
  const ratingUrl = 'file:///' + path.join(__dirname, 'screens', 'rating-details.html').replace(/\\/g, '/');
  await page.goto(ratingUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(500);
  const panels = await page.evaluate(() => {
    const ps = document.querySelectorAll('.rd-panel, [data-panel]');
    return Array.from(ps).map(p => ({ id: p.id || p.dataset.panel, hidden: p.hidden || p.style.display === 'none' }));
  });
  console.log('Rating panels:', JSON.stringify(panels));

  await browser.close();
}
check();
