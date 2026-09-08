/* Walks every nav tab in the mounted app and reports what is actually on screen. */
export default async function run(t, { mount, tick, dom }) {
  const { window } = dom, document = window.document;
  const wait = async (fn, ms=9000) => { for(let w=0;w<ms;w+=50){ try{ if(fn()) return true; }catch{} await tick(50);} return false; };
  await mount();
  await wait(() => document.querySelectorAll('.sb .nav-i').length > 0 && document.querySelector('.body'));
  await tick(400);

  const tabs = [...document.querySelectorAll('.sb .nav-i')];
  console.log('\nTABS FOUND: ' + tabs.length + ' -> ' + tabs.map(b=>b.textContent.trim()).join(' | '));
  console.log('\n%-18s %8s %6s %6s %6s  %s'.replace(/%(-?\d+)s/g,'%s'), 'TAB','chars','NaN','$NaN','undef','first heading');
  console.log('-'.repeat(96));

  /* THE ALERT, ON SCREEN. Not the predicate in isolation — the rendered thing.

     The first version of this feature passed every unit test and rendered for
     nobody, because the filter read c.data.attribution and getContacts()
     returns a flat row. A predicate test cannot catch that. Only asking the
     mounted app whether the element exists can. */
  const alert = document.querySelector('.nl-wrap .nl');
  t.ok(alert, 'the new lead alert is on screen for an unacknowledged website lead');
  if (alert) {
    const txt = alert.textContent || '';
    t.ok(/Priya Raman/.test(txt), 'and it names the lead');
    t.ok(/New lead/i.test(txt), 'and says what it is');
    t.ok(alert.querySelector('.nl-open') && alert.querySelector('.nl-ack'),
      'with both an Open and an acknowledge button');
    const wrap = document.querySelector('.nl-wrap');
    t.ok(wrap && wrap.getAttribute('role') === 'alert',
      'announced assertively, because it is an interruption the user needs');
  }

  /* It must survive a tab change: the requirement is that it follows him
     wherever he is working, not that it lives on one screen. */
  const second = tabs[3];
  if (second) { second.click(); await tick(400); }
  t.ok(document.querySelector('.nl-wrap .nl'),
    'and it is still there after moving to another tab');

  for (const b of tabs) {
    const label = b.textContent.trim();
    b.click();
    await tick(500);
    const body = document.querySelector('.body');
    const txt = body ? (body.textContent || '') : '';
    const h = body && body.querySelector('h1,h2,h3');
    const nan  = (txt.match(/\bNaN\b/g)||[]).length;
    const dnan = (txt.match(/\$NaN/g)||[]).length;
    const und  = (txt.match(/\bundefined\b/g)||[]).length;
    const nul  = (txt.match(/\bnull\b/g)||[]).length;
    const inv  = (txt.match(/Invalid Date/g)||[]).length;
    const pad = (s,n)=>String(s).padEnd(n);
    console.log(pad(label,18)+pad(txt.length,8)+pad(nan,6)+pad(dnan,6)+pad(und+nul+inv,7)+' '+(h?h.textContent.trim().slice(0,44):'(no heading)'));
    t.ok(txt.length > 120, `${label}: renders content (${txt.length} chars)`);
    t.ok(nan === 0 && dnan === 0, `${label}: no NaN on screen`);
    t.ok(und === 0 && inv === 0, `${label}: no undefined / Invalid Date on screen`);
  }
}
