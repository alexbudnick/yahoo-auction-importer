# Yahoo Auction Tracker v1.3

Railway cron app for Airtable Yahoo Auctions tracking.

This version updates the auction price/status fields and can also enrich records with:

- Yahoo Photos
- Yahoo Description
- Yahoo Condition
- Yahoo Condition Rank
- Yahoo Description EN
- Yahoo Condition EN
- Translated At
- Translation Status

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

- Photos are only attached when `Yahoo Photos` is empty unless `UPDATE_PHOTOS_ONLY_IF_EMPTY=false`.
- Descriptions, condition, and translations are only filled when the destination field is empty unless the corresponding `ONLY_IF_EMPTY` setting is false.
- Known Yahoo condition labels are translated without an OpenAI call.
- Full descriptions are translated using OpenAI when `TRANSLATE_DESCRIPTIONS=true` and `OPENAI_API_KEY` is set.
- The translation is for internal research/tech reference, not listing copy.
