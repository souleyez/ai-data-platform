# Layout guidance

This reference defines the premium shell bar for order and inventory static pages.

The composer should not generate CSS or HTML. It should generate page JSON that reads as if it belongs to one of these shells.

## Shell A: Channel Control Deck

Use for:

- `generic`
- `platform`

Tone:

- executive operations board
- sharp and controlled
- fast to scan
- not decorative

What should be memorable:

- clear channel role split
- visible growth structure
- one-screen understanding of where volume and risk sit

Recommended section language:

- operating overview
- channel structure
- platform role and incremental source
- sku focus
- inventory and replenishment
- anomaly explanation
- ai synthesis

Card language:

- channel-heavy
- revenue-heavy
- allocation-heavy

Strong card examples:

- `channel gmv`
- `active skus`
- `risk sku`
- `inventory health`
- `replenishment priority`

Chart language:

- structure charts
- contribution charts
- queue charts
- linked trend charts

Strong chart examples:

- `channel contribution mix`
- `sku sell-through vs inventory risk`
- `monthly gmv vs inventory index`
- `replenishment priority queue`

Avoid:

- a long narrative block before cards
- repetitive channel summaries with no action meaning
- generic `trend analysis` titles

## Shell B: Inventory Signal Wall

Use for:

- `stock`

Tone:

- supply-chain control room
- urgent but disciplined
- action-first

What should be memorable:

- risk queue
- turnover pressure
- shortage vs overstock split
- 72-hour action bar

Recommended section language:

- operating overview
- inventory health
- high-risk sku
- sell-through and turnover
- replenishment priority
- anomaly explanation
- ai synthesis

Card language:

- risk-first
- operational urgency
- fewer but sharper KPIs

Strong card examples:

- `inventory health`
- `stockout-risk skus`
- `slow-moving inventory share`
- `suggested replenishment quantity`
- `cross-warehouse transfer`

Strong chart examples:

- `warehouse inventory health`
- `high-risk sku queue`
- `sku turnover days`
- `72h replenishment priority`

Avoid:

- presenting stock pages as generic sales review pages
- mixing too many channel narratives into the main story
- showing risk without a concrete action queue

## Shell C: SKU Ladder Board

Use for:

- `category`

Tone:

- assortment strategy board
- category-manager friendly
- dense but readable

What should be memorable:

- category ladder
- hero sku concentration
- tail drag
- action split between growth and cleanup

Recommended section language:

- operating overview
- category ladder
- sku concentration
- sell-through and margin focus
- inventory and replenishment
- anomaly explanation
- ai synthesis

Card language:

- category ranking
- hero sku dependence
- tail risk
- actionability

Strong card examples:

- `core category gmv`
- `hero sku contribution`
- `tail-risk sku`
- `inventory pressure`
- `action priority`

Strong chart examples:

- `category ladder mix`
- `hero sku concentration`
- `sku sell-through vs margin`
- `tail inventory pressure queue`

Avoid:

- treating category view as only a sku ranking table
- too many sku names without grouping logic
- hiding the tail-risk problem behind top-line growth

## Global visual bar

Every shell should feel like:

- summary first
- strong cards
- decision-oriented charts
- dense but concise section bodies

Every shell should avoid:

- generic BI export feeling
- giant prose blocks
- chart spam
- unsupported precision

## Weak-evidence behavior

When evidence is weak:

- keep the same shell family
- reduce cards and charts
- keep section titles stable
- make uncertainty visible in the section body or `warnings`

Do not compensate with decorative filler.
