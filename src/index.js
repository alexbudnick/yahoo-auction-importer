import * as cheerio from 'cheerio';

const env = process.env;

const CONFIG = {
  airtableToken: required('AIRTABLE_TOKEN'),
  baseId: required('AIRTABLE_BASE_ID'),
  tableName: env.AIRTABLE_TABLE_NAME || 'Table 1',
  viewName: env.AIRTABLE_VIEW_NAME || '',
  dryRun: String(env.DRY_RUN || 'true').toLowerCase() !== 'false',
  maxRecords: Number(env.MAX_RECORDS || 100),
  requestDelayMs: Number(env.REQUEST_DELAY_MS || 900),
  inferBidResult: String(env.INFER_BID_RESULT || 'false').toLowerCase() === 'true',
  fields: {
    url: fieldEnv('FIELD_URL', 'Auction Link'),
    title: fieldEnv('FIELD_TITLE', 'Title (Auction Link)'),
    currentBid: fieldEnv('FIELD_CURRENT_BID', 'Current Bid JPY'),
    buyout: fieldEnv('FIELD_BUYOUT', 'Buyout Price JPY'),
    bidCount: fieldEnv('FIELD_BID_COUNT', 'Bid Count'),
    endTime: fieldEnv('FIELD_END_TIME', 'End Time'),
    status: fieldEnv('FIELD_STATUS', 'Auction Status'),
    finalPrice: fieldEnv('FIELD_FINAL', 'Final Price JPY'),
    lastChecked: fieldEnv('FIELD_LAST_CHECKED', 'Last Checked'),
    error: fieldEnv('FIELD_ERROR', 'Error Notes'),
    myMaxBid: fieldEnv('FIELD_MY_MAX', 'My Max Bid JPY'),
    bidResult: fieldEnv('FIELD_BID_RESULT', 'Bid Result')
  }
};

const ENDED_STATUSES = new Set(['Ended', 'Won', 'Lost', 'Cancelled']);

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

async function main() {
  console.log(`Starting Yahoo Auction Tracker. dryRun=${CONFIG.dryRun}`);
  const records = await fetchAirtableRecords();
  console.log(`Fetched ${records.length} Airtable records.`);

  const updates = [];
  let checked = 0;
  let skipped = 0;

  for (const record of records) {
    const f = record.fields || {};
    const url = asString(f[CONFIG.fields.url]);
    const existingStatus = asString(f[CONFIG.fields.status]);

    if (!url) {
      skipped++;
      continue;
    }

    if (ENDED_STATUSES.has(existingStatus)) {
      skipped++;
      continue;
    }

    await sleep(CONFIG.requestDelayMs);
    checked++;

    try {
      const parsed = await scrapeYahooAuction(url);
      const nextFields = buildAirtableFields(parsed, record.fields || {});
      const changedFields = onlyChangedFields(nextFields, record.fields || {});

      if (Object.keys(changedFields).length > 0) {
        updates.push({ id: record.id, fields: changedFields });
      }

      console.log(`[OK] ${record.id} ${parsed.auctionId || ''} ${parsed.status || ''} current=${parsed.currentBid ?? ''} end=${parsed.endTimeIso || ''}`);
    } catch (err) {
      const message = cleanError(err);
      console.warn(`[ERROR] ${record.id} ${url}: ${message}`);
      const errorFields = {};
      setField(errorFields, CONFIG.fields.status, 'Error');
      setField(errorFields, CONFIG.fields.lastChecked, new Date().toISOString());
      setField(errorFields, CONFIG.fields.error, message.slice(0, 1000));
      updates.push({ id: record.id, fields: errorFields });
    }
  }

  console.log(`Checked ${checked}; skipped ${skipped}; records needing updates ${updates.length}.`);

  if (CONFIG.dryRun) {
    console.log('DRY_RUN=true, not writing updates. Sample update:');
    console.log(JSON.stringify(updates.slice(0, 3), null, 2));
    return;
  }

  await batchUpdateAirtable(updates);
  console.log('Done.');
}

function buildAirtableFields(parsed, existingFields) {
  const out = {};

  setField(out, CONFIG.fields.lastChecked, new Date().toISOString());
  setField(out, CONFIG.fields.error, '');
  setField(out, CONFIG.fields.status, parsed.status || 'Active');

  if (parsed.title) setField(out, CONFIG.fields.title, parsed.title);
  if (Number.isFinite(parsed.currentBid)) setField(out, CONFIG.fields.currentBid, parsed.currentBid);
  if (Number.isFinite(parsed.buyoutPrice)) setField(out, CONFIG.fields.buyout, parsed.buyoutPrice);
  if (Number.isFinite(parsed.bidCount)) setField(out, CONFIG.fields.bidCount, parsed.bidCount);
  if (parsed.endTimeIso) setField(out, CONFIG.fields.endTime, parsed.endTimeIso);

  if (parsed.status === 'Ended' && Number.isFinite(parsed.currentBid)) {
    setField(out, CONFIG.fields.finalPrice, parsed.currentBid);
  }

  if (CONFIG.inferBidResult) {
    const myMaxBid = Number(existingFields[CONFIG.fields.myMaxBid]);
    if (Number.isFinite(myMaxBid) && Number.isFinite(parsed.currentBid)) {
      if (parsed.status === 'Ended') {
        setField(out, CONFIG.fields.bidResult, parsed.currentBid <= myMaxBid ? 'Needs Check' : 'Lost');
      } else {
        setField(out, CONFIG.fields.bidResult, parsed.currentBid > myMaxBid ? 'Outbid' : 'Watching');
      }
    }
  } else if (parsed.status === 'Ended') {
    setField(out, CONFIG.fields.bidResult, 'Needs Check');
  }

  return out;
}

async function scrapeYahooAuction(url) {
  const normalizedUrl = normalizeYahooUrl(url);
  const response = await fetchWithTimeout(normalizedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache'
    }
  }, 25000);

  if (!response.ok) {
    throw new Error(`Yahoo fetch failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  if (!html || html.length < 1000) {
    throw new Error('Yahoo page returned very little HTML. It may be blocked or unavailable.');
  }

  const $ = cheerio.load(html);
  const text = normalizeText($('body').text());
  const title = parseTitle($, text);
  const auctionId = extractAuctionId(normalizedUrl);

  const publicEnded = /このオークションは終了|オークションは終了|終了しました|終了しています|落札されました/.test(text);
  const currentBid = parseCurrentPrice($, text);
  const buyoutPrice = parseBuyoutPrice($, text);
  const bidCount = parseBidCount(text);
  const endTimeIso = parseEndTimeIso($, text);
  const endedByTime = endTimeIso ? new Date(endTimeIso).getTime() <= Date.now() : false;
  const cancelled = /取り消されました|キャンセルされました|出品者により取り消し/.test(text);

  let status = 'Active';
  if (cancelled) status = 'Cancelled';
  else if (publicEnded || endedByTime) status = 'Ended';

  if (!Number.isFinite(currentBid)) {
    throw new Error('Could not parse current bid from Yahoo page. Parser may need an update.');
  }

  return {
    url: normalizedUrl,
    auctionId,
    title,
    currentBid,
    buyoutPrice,
    bidCount,
    endTimeIso,
    status
  };
}

function parseTitle($, text) {
  const h1 = normalizeText($('h1').first().text());
  if (h1 && h1.length > 3) return h1.slice(0, 250);

  const og = $('meta[property="og:title"]').attr('content');
  if (og) return normalizeText(og).replace(/ - Yahoo!オークション$/, '').slice(0, 250);

  const docTitle = normalizeText($('title').first().text());
  return docTitle ? docTitle.replace(/ - Yahoo!オークション$/, '').slice(0, 250) : '';
}

function parseCurrentPrice($, text) {
  const metaPrice = parseYen($('meta[property="product:price:amount"]').attr('content'));
  if (Number.isFinite(metaPrice)) return metaPrice;

  const itempropPrice = parseYen($('[itemprop="price"]').first().attr('content'));
  if (Number.isFinite(itempropPrice)) return itempropPrice;

  const patterns = [
    /現在価格\s*[:：]?\s*([0-9,]+)\s*円/,
    /現在\s*[:：]?\s*([0-9,]+)\s*円/,
    /落札価格\s*[:：]?\s*([0-9,]+)\s*円/,
    /価格\s*[:：]?\s*([0-9,]+)\s*円/
  ];
  return firstYenMatch(text, patterns);
}

function parseBuyoutPrice($, text) {
  const patterns = [
    /即決価格\s*[:：]?\s*([0-9,]+)\s*円/,
    /即決\s*[:：]?\s*([0-9,]+)\s*円/,
    /希望落札価格\s*[:：]?\s*([0-9,]+)\s*円/
  ];
  return firstYenMatch(text, patterns);
}

function parseBidCount(text) {
  const patterns = [
    /入札件数\s*[:：]?\s*([0-9,]+)\s*件/,
    /入札\s*[:：]?\s*([0-9,]+)\s*件/,
    /([0-9,]+)\s*件の入札/
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInteger(m[1]);
  }
  return undefined;
}

function parseEndTimeIso($, text) {
  // Try machine-readable dates first.
  const timeSelectors = [
    'time[datetime]',
    '[datetime]',
    'meta[property="auction:end_time"]',
    'meta[itemprop="availabilityEnds"]'
  ];
  for (const selector of timeSelectors) {
    const el = $(selector).first();
    const value = el.attr('datetime') || el.attr('content');
    const iso = parseAnyDateToIso(value);
    if (iso) return iso;
  }

  // Japanese formats. These are intentionally broad because Yahoo changes labels/layouts.
  const labeled = extractAround(text, ['終了日時', '終了時間', '終了予定', '終了']);
  const combined = labeled || text;

  const explicitYear = combined.match(/(20[0-9]{2})\s*年\s*([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日.*?([0-9]{1,2})\s*時\s*([0-9]{1,2})\s*分/);
  if (explicitYear) {
    return japanLocalToUtcIso(Number(explicitYear[1]), Number(explicitYear[2]), Number(explicitYear[3]), Number(explicitYear[4]), Number(explicitYear[5]));
  }

  const monthDayKanji = combined.match(/([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日.*?([0-9]{1,2})\s*時\s*([0-9]{1,2})\s*分/);
  if (monthDayKanji) {
    const { year, month, day, hour, minute } = inferTokyoYear(
      Number(monthDayKanji[1]),
      Number(monthDayKanji[2]),
      Number(monthDayKanji[3]),
      Number(monthDayKanji[4])
    );
    return japanLocalToUtcIso(year, month, day, hour, minute);
  }

  const slashFormat = combined.match(/([0-9]{1,2})\s*\/\s*([0-9]{1,2}).{0,20}?([0-9]{1,2})\s*:\s*([0-9]{2})/);
  if (slashFormat) {
    const { year, month, day, hour, minute } = inferTokyoYear(
      Number(slashFormat[1]),
      Number(slashFormat[2]),
      Number(slashFormat[3]),
      Number(slashFormat[4])
    );
    return japanLocalToUtcIso(year, month, day, hour, minute);
  }

  return undefined;
}

function inferTokyoYear(month, day, hour, minute) {
  const nowUtc = new Date();
  const tokyoNow = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  let year = tokyoNow.getUTCFullYear();
  let candidateUtc = Date.UTC(year, month - 1, day, hour - 9, minute, 0);

  // Auctions are normally near-future. If the inferred date is more than 180 days in the past,
  // assume the page is showing a date in the next calendar year.
  if (candidateUtc < Date.now() - 180 * 24 * 60 * 60 * 1000) year += 1;

  return { year, month, day, hour, minute };
}

function japanLocalToUtcIso(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0)).toISOString();
}

function parseAnyDateToIso(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isFinite(date.getTime())) return date.toISOString();
  return undefined;
}

function firstYenMatch(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = parseInteger(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function parseYen(value) {
  return parseInteger(value);
}

function parseInteger(value) {
  if (value === undefined || value === null) return undefined;
  const cleaned = String(value).replace(/[^0-9]/g, '');
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function extractAround(text, labels) {
  for (const label of labels) {
    const idx = text.indexOf(label);
    if (idx !== -1) return text.slice(idx, idx + 300);
  }
  return '';
}

function normalizeYahooUrl(url) {
  const s = asString(url).trim();
  if (!s) throw new Error('Missing Yahoo auction URL');
  return s;
}

function extractAuctionId(url) {
  const m = url.match(/auction\/([A-Za-z0-9]+)(?:[/?#]|$)/);
  return m ? m[1] : '';
}

function normalizeText(value) {
  return asString(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asString(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

async function fetchAirtableRecords() {
  const records = [];
  let offset;

  do {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(CONFIG.baseId)}/${encodeURIComponent(CONFIG.tableName)}`);
    url.searchParams.set('pageSize', '100');
    if (CONFIG.viewName) url.searchParams.set('view', CONFIG.viewName);
    if (offset) url.searchParams.set('offset', offset);

    const response = await fetchWithTimeout(url.toString(), {
      headers: {
        Authorization: `Bearer ${CONFIG.airtableToken}`,
        'Content-Type': 'application/json'
      }
    }, 30000);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Airtable fetch failed HTTP ${response.status}: ${body}`);
    }

    const data = await response.json();
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset && records.length < CONFIG.maxRecords);

  return records.slice(0, CONFIG.maxRecords);
}

async function batchUpdateAirtable(updates) {
  if (updates.length === 0) return;

  const disabledFields = new Set();

  for (let i = 0; i < updates.length; i += 10) {
    let chunk = stripDisabledFields(updates.slice(i, i + 10), disabledFields);
    let attempts = 0;

    while (chunk.length > 0) {
      attempts++;
      const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(CONFIG.baseId)}/${encodeURIComponent(CONFIG.tableName)}`);
      url.searchParams.set('typecast', 'true');

      const response = await fetchWithTimeout(url.toString(), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${CONFIG.airtableToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ records: chunk })
      }, 30000);

      if (response.ok) {
        console.log(`Updated ${chunk.length} records.`);
        break;
      }

      const body = await response.text();
      const rejectedField = extractRejectedAirtableField(body);

      if (rejectedField && attempts <= 12) {
        disabledFields.add(rejectedField);
        console.warn(`Airtable rejected field "${rejectedField}". Skipping that field for this run and retrying the rest.`);
        chunk = stripDisabledFields(chunk, disabledFields);
        continue;
      }

      throw new Error(`Airtable update failed HTTP ${response.status}: ${body}`);
    }

    await sleep(250);
  }

  if (disabledFields.size > 0) {
    console.warn(`Completed with skipped Airtable fields: ${Array.from(disabledFields).join(', ')}. Fix those field types/names if you want them updated.`);
  }
}

function extractRejectedAirtableField(body) {
  const m = String(body || '').match(/Field \"([^\"]+)\" cannot accept the provided value/);
  return m ? m[1] : '';
}

function stripDisabledFields(updates, disabledFields) {
  if (!disabledFields || disabledFields.size === 0) return updates;

  return updates
    .map((update) => {
      const fields = { ...(update.fields || {}) };
      for (const fieldName of disabledFields) delete fields[fieldName];
      return { ...update, fields };
    })
    .filter((update) => Object.keys(update.fields || {}).length > 0);
}

function onlyChangedFields(nextFields, currentFields) {
  const out = {};
  for (const [key, nextValue] of Object.entries(nextFields)) {
    const currentValue = currentFields[key];
    if (valuesDiffer(nextValue, currentValue)) out[key] = nextValue;
  }
  return out;
}

function valuesDiffer(a, b) {
  if (a === '' && (b === undefined || b === null || b === '')) return false;
  if (typeof a === 'number') return Number(b) !== a;
  if (looksIsoDate(a) && b) {
    const at = new Date(a).getTime();
    const bt = new Date(b).getTime();
    return Number.isFinite(at) && Number.isFinite(bt) ? Math.abs(at - bt) > 1000 : a !== b;
  }
  return String(a ?? '') !== String(b ?? '');
}

function looksIsoDate(value) {
  return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}T/.test(value);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function setField(out, fieldName, value) {
  if (!fieldName) return;
  out[fieldName] = value;
}

function fieldEnv(name, fallback) {
  if (!(name in env)) return fallback;
  const value = String(env[name] ?? '').trim();
  if (!value) return fallback;
  if (['skip', 'disabled', 'false', 'none'].includes(value.toLowerCase())) return '';
  return value;
}

function required(name) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function cleanError(err) {
  if (!err) return 'Unknown error';
  if (err.name === 'AbortError') return 'Request timed out';
  return String(err.message || err).replace(/\s+/g, ' ').trim();
}
