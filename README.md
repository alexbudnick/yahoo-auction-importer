# Yahoo Auction Tracker v1.6

Railway cron app for Airtable Yahoo Auctions tracking.

This version keeps the v1.4 photo/banner filtering and adds manual force-rescan support. When `Force Rescan` is checked on an Airtable record, the next Railway run will re-scrape that record even if it is already ended and already has photos/descriptions/translations. On success, the app can clear the checkbox automatically.

## Required Airtable fields

Minimum fields:

- Auction Link — URL
- Current Bid JPY — number/currency
- Buyout Price JPY — number/currency
- Bid Count — number
- End Time — date with time enabled
- Auction Status — single select: Active, Ended, Cancelled, Error
- Final Price JPY — number/currency
- Last Checked — date with time enabled
- Error Notes — long text

Optional enrichment fields:

- Yahoo Photos — attachment
- Yahoo Description — long text
- Yahoo Condition — single line text
- Yahoo Condition Rank — number

Optional translation fields:

- Yahoo Description EN — long text
- Yahoo Condition EN — single line text
- Translated At — date with time enabled
- Translation Status — single select

Recommended Translation Status options:

- Not Needed
- Needs Translation
- Translated
- Error

Force-rescan fields:

- Force Rescan — checkbox
- Last Rescanned At — date with time enabled
- Rescan Notes — long text

## Railway variables

Required:

```bash
AIRTABLE_TOKEN=your_airtable_pat
AIRTABLE_BASE_ID=appxxxxxxxxxxxxxx
AIRTABLE_TABLE_NAME=Table 1
```

Common settings:

```bash
AIRTABLE_VIEW_NAME=Grid view
DRY_RUN=false
MAX_RECORDS=100
REQUEST_DELAY_MS=900
```

Yahoo enrichment:

```bash
FIELD_PHOTOS=Yahoo Photos
FIELD_DESCRIPTION=Yahoo Description
FIELD_CONDITION=Yahoo Condition
FIELD_CONDITION_RANK=Yahoo Condition Rank
UPDATE_PHOTOS_ONLY_IF_EMPTY=true
ENRICH_ENDED_RECORDS_IF_MISSING=true
MAX_PHOTOS_PER_AUCTION=12
MAX_DESCRIPTION_CHARS=12000
SKIP_WIDE_BANNER_PHOTOS=true
WIDE_BANNER_RATIO=3.2
WIDE_BANNER_MAX_HEIGHT=420
PHOTO_EXCLUDE_URL_PATTERNS=buyee,tenso,overseas,visitor,pr_banner
UPDATE_STATIC_FIELDS_ONLY_IF_EMPTY=true
```

Translation enrichment:

```bash
TRANSLATE_DESCRIPTIONS=true
TRANSLATION_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
FIELD_DESCRIPTION_TRANSLATED=Yahoo Description EN
FIELD_CONDITION_TRANSLATED=Yahoo Condition EN
FIELD_TRANSLATED_AT=Translated At
FIELD_TRANSLATION_STATUS=Translation Status
TRANSLATE_ONLY_IF_EMPTY=true
TRANSLATE_IN_DRY_RUN=false
MAX_TRANSLATION_CHARS=12000
TRANSLATION_DELAY_MS=500
```

Force rescan:

```bash
FIELD_FORCE_RESCAN=Force Rescan
FIELD_LAST_RESCANNED_AT=Last Rescanned At
FIELD_RESCAN_NOTES=Rescan Notes
CLEAR_FORCE_RESCAN_AFTER_SUCCESS=true
FORCE_RESCAN_TRANSLATE=true
```

## Force rescan behavior

When `Force Rescan` is checked on a record:

1. The app does not skip the record even if `Auction Status` is `Ended`, `Lost`, `Won`, or `Cancelled`.
2. It overwrites scraped/static fields for that record, including price/status/end time, description, condition, and photos.
3. It overwrites translation fields too when `FORCE_RESCAN_TRANSLATE=true`.
4. It writes `Last Rescanned At` and `Rescan Notes`.
5. It clears `Force Rescan` after a successful scrape when `CLEAR_FORCE_RESCAN_AFTER_SUCCESS=true`.

If the scrape fails, `Force Rescan` stays checked so you can retry after fixing the issue.

## Dry run note

By default, `TRANSLATE_IN_DRY_RUN=false`, so dry runs will not spend OpenAI API credits. To test translation in dry run mode, temporarily set:

```bash
DRY_RUN=true
TRANSLATE_IN_DRY_RUN=true
```

Then switch back to:

```bash
DRY_RUN=false
TRANSLATE_IN_DRY_RUN=false
```

## Behavior

- Photos are only attached when `Yahoo Photos` is empty unless `UPDATE_PHOTOS_ONLY_IF_EMPTY=false` or `Force Rescan` is checked.
- Repeated wide PR/banner images, including the Buyee banner, are skipped before attaching photos.
- Descriptions, condition, and translations are only filled when the destination field is empty unless the corresponding `ONLY_IF_EMPTY` setting is false or `Force Rescan` is checked.
- Known Yahoo condition labels are translated without an OpenAI call.
- Full descriptions are translated using OpenAI when `TRANSLATE_DESCRIPTIONS=true` and `OPENAI_API_KEY` is set.
- The translation and photos are for internal research/tech reference, not listing copy.


## v1.6 status fix

This version fixes false `Ended` results caused by Yahoo pages containing an old/past date in page text or seller content.

By default, v1.6 only marks an auction as `Ended` when Yahoo's page contains an explicit ended/cancelled message. If the parser finds an end time in the past but the page does not explicitly say the auction ended, it leaves the status as `Active` and writes a note during Force Rescan.

Add or confirm this Railway variable:

```bash
MARK_ENDED_BY_PAST_END_TIME=false
```

Leave this false unless you specifically want the app to infer ended status from a past parsed end time.

During Force Rescan, if the corrected status is Active, v1.6 also clears stale `Final Price JPY` that may have been written by an earlier false-ended scan.
