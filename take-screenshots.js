const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = __dirname;
const SCREENS = path.join(BASE, 'screens');
const OUT = path.join(BASE, 'screenshots');
const W = 390, H = 844;
fs.mkdirSync(OUT, { recursive: true });

const shots = [
  // Вход и онбординг
  { file: '00-splash.html', name: '00-splash' },
  { file: '01-welcome.html', name: '01-welcome' },
  { file: '02-auth.html', name: '02-auth-login' },
  { file: '02-auth.html?tab=reg', name: '02-auth-register' },
  { file: '02-forgot.html', name: '02-forgot' },
  { file: '02-pin.html', name: '02-pin' },
  { file: '03-role.html', name: '03-role' },
  { file: '04-onboarding.html', name: '04-onboarding' },
  { file: '05-questionnaire.html', name: '05-questionnaire' },
  { file: '05-questionnaire.html', name: '05-questionnaire-done',
    act: async (p) => {
      await p.evaluate(() => {
        const d = document.getElementById('q-done');
        const w = document.getElementById('q-form-wrap');
        if (d) { d.hidden = false; d.style.display = ''; d.classList.add('is-show'); }
        if (w) w.style.display = 'none';
      });
      await p.waitForTimeout(300);
    }},

  // Главная
  { file: '06-home.html', name: '06-home' },

  // Расписание и запись
  { file: '07-calendar.html', name: '07-calendar' },
  { file: '07-add-event.html', name: '07-add-event' },
  { file: '07-add-event.html', name: '07-add-event-facility',
    act: async (p) => {
      await p.evaluate(() => {
        const chips = document.querySelectorAll('.step-chip, [data-step]');
        for (const c of chips) { if (c.textContent.includes('Площадк') || c.dataset.step === 'facility') { c.click(); break; } }
      });
      await p.waitForTimeout(400);
    }},
  { file: '07-add-event.html', name: '07-add-event-confirm',
    act: async (p) => {
      await p.evaluate(() => {
        const chips = document.querySelectorAll('.step-chip, [data-step]');
        for (const c of chips) { if (c.textContent.includes('Подтвер') || c.dataset.step === 'confirm') { c.click(); break; } }
      });
      await p.waitForTimeout(400);
    }},
  { file: '16-rental-detail.html', name: '16-rental' },

  // Уведомления и поиск
  { file: '07-notifications.html', name: '07-notifications' },
  { file: '07-search.html', name: '07-search' },

  // Активности
  { file: 'activities.html', name: 'activities' },

  // Конструктор
  { file: '13-training-constructor.html', name: '13-constructor' },

  // События
  { file: '15-event-marathon.html', name: '15-event-marathon' },
  { file: '15-event-marathon.html', name: '15-event-results',
    act: async (p) => {
      await p.evaluate(() => {
        const t = document.querySelector('.evd-tab[data-tab="res"]');
        if (t) t.click();
      });
      await p.waitForTimeout(300);
    }},
  { file: '15-event-marathon.html?ev=cup', name: '15-event-cup-bracket',
    act: async (p) => {
      await p.evaluate(() => {
        const t = document.querySelector('.evd-tab[data-tab="setka"]');
        if (t) t.click();
      });
      await p.waitForTimeout(300);
    }},

  // Цель и ГТО
  { file: 'goal.html', name: 'goal' },
  { file: '23-gto-plan.html', name: '23-gto-plan' },
  { file: '24-gto-workout.html', name: '24-gto-workout' },
  { file: '25-gto-test.html', name: '25-gto-test' },
  { file: '26-gto-result.html', name: '26-gto-result' },

  // QR
  { file: '22-qr-scanner.html', name: '22-qr-scanner' },
  { file: '22-qr-scanner.html', name: '22-qr-mycode',
    act: async (p) => {
      await p.evaluate(() => {
        const btn = document.getElementById('seg-mine');
        if (btn) btn.click();
      });
      await p.waitForTimeout(500);
    }},

  // Сообщество
  { file: 'community.html', name: 'community' },
  { file: 'news.html?id=n1', name: 'news' },
  { file: 'club.html?id=c4', name: 'club' },
  { file: 'complex.html', name: 'complex' },

  // Профиль и сервис
  { file: 'profile.html', name: 'profile' },
  { file: 'profile-edit.html', name: 'profile-edit' },
  { file: 'profile-view.html?id=p1', name: 'profile-view' },
  { file: 'friends.html', name: 'friends' },
  { file: 'chat.html', name: 'chat' },
  { file: 'challenge.html', name: 'challenge' },
  { file: '17-achievements.html', name: 'achievements' },
  { file: 'rating-details.html', name: 'rating-points' },
  { file: 'rating-details.html', name: 'rating-attendance',
    act: async (p) => {
      await p.evaluate(() => {
        const b = document.querySelector('.seg-btn[data-panel="attendance"]');
        if (b) b.click();
      });
      await p.waitForTimeout(300);
    }},

  // Опрос
  { file: 'survey.html', name: 'survey' },
  // Состояния
  { file: 'states/empty.html', name: 'state-empty' },
  { file: 'states/error.html', name: 'state-error' },
  { file: 'states/loading.html', name: 'state-loading' },
  { file: 'states/offline.html', name: 'state-offline' },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  let ok = 0, fail = 0;
  for (const shot of shots) {
    const url = 'file:///' + path.join(SCREENS, shot.file).replace(/\\/g, '/');
    const outPath = path.join(OUT, shot.name + '.png');
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(500);
      if (shot.act) await shot.act(page);
      await page.waitForTimeout(200);
      await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: W, height: H } });
      console.log('✓ ' + shot.name);
      ok++;
    } catch (e) {
      console.error('✗ ' + shot.name + ': ' + e.message);
      fail++;
    }
  }
  await browser.close();
  console.log('\nDone: ' + ok + ' ok, ' + fail + ' failed, ' + shots.length + ' total');
}
run();
