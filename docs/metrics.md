# Metrics

Weekly distance is total running distance completed in the selected week.

Yearly Report statistics are direct totals for completed running activities in the selected owner-local calendar year. The year runs from local `YYYY-01-01 00:00` inclusive to local `YYYY+1-01-01 00:00` exclusive. Running kilometers sum activity distance, total elevation sums elevation gain, and running time sums moving time.

Weekly load is a transparent training-stress estimate. During Strava sync, each activity is calculated from the HR zone set that is effective on the activity date. If a heart-rate stream and effective HR zones are available, load uses minutes in zone multiplied by default zone weights. If not, it uses RPE when present. Otherwise it uses duration multiplied by `2.0`.

HR zone sets are dated profile records. Add a new zone set when your zones change. Saving a zone set recomputes existing activities that already have HR streams or average HR, and future syncs calculate imported activities with the effective zone set for each activity date. Settings also exposes a manual recalculation action for existing imports; it requires at least one saved zone set and reports how many HR activities remain unknown.

Heart-rate data alone is not enough for zone-based intensity. The activity date must have an effective HR zone set. If a zone set starts after an imported run, that run remains unknown until a zone set is added for that historical date range.

Activity detail responses include `heart_rate_zone_breakdown` when HR data and an effective zone set are available. Each item reports zone name, boundaries, sample count, percentage, and seconds allocated from activity duration. Average-HR-only activities show the whole activity in the average HR zone because no per-sample stream exists.

Planned load is a live planning estimate shown in the weekly scheduler. It uses the planned duration in minutes multiplied by a simple intensity weight:

- Rest: `0`
- Easy/recovery/default: `2`
- Moderate/strength: `4`
- Hard: `6`
- Race: `8`

Planned load is only a scheduling aid. It does not use completed HR data and should not be treated as a medical or injury prediction.

Acute load is recent 7-day load. Chronic load is recent 28-day load. Ramp ratio is acute load divided by chronic load when chronic load is nonzero. It is a training-ramp indicator, not an injury prediction.

Intensity labels:

- Easy: mostly Z1/Z2 or RPE 1-4.
- Moderate: RPE 5-6 or mixed HR distribution.
- Hard: meaningful Z4/Z5 time, race/tempo/interval/hill workout type, or RPE 7-10.
- Unknown: insufficient data.

Dashboard and Trends intensity split prefers the same HR-zone breakdown shown on activity detail. For activities with usable HR data and an effective zone set, Z1/Z2 seconds count as easy, Z3 seconds count as moderate, and Z4/Z5 seconds count as hard. Average-HR-only activities put the whole duration into the average HR zone. If no usable breakdown exists, the split falls back to the stored activity label. Unknown time is shown separately so missing HR zones or RPE do not make the chart look empty.

Easy-run efficiency uses easy runs longer than 20 minutes and compares pace, heart rate, and elevation gain per km over time. It should not be treated as a precise fitness or medical metric.

Detailed trend metrics are returned by `/analytics/trend-metrics`. They are computed on demand from owner-scoped activities, streams, dated HR zones, and planned workouts:

- Zone breakdown over time: weekly seconds in Z1-Z5 from the same HR-zone breakdown used on activity detail.
- Easy pace: weekly pace from activities that are mostly Z1/Z2 when HR breakdown exists, otherwise activities stored as easy.
- Long-run share: longest run distance divided by total weekly running distance.
- Consistency: number of distinct owner-local dates with a running activity in the week.
- Hilliness: weekly elevation gain divided by weekly running distance.
- Pace by HR zone: pace from aligned time, distance, and heart-rate stream segments. Segments faster than 2:00/km or slower than 30:00/km are ignored as GPS/pause artifacts. Missing or inconsistent streams return `null` for that zone.
- Plan vs reality: completed weekly distance, time, and load compared with planned workouts in the same owner-local week.
- Monotony: average daily load divided by the standard deviation of daily load across the seven-day week. It is `null` when there is no load or the week has no variation.

Coach effect is a transparent weekly verdict returned with detailed trend metrics. It is not a medical or injury prediction. It combines four small signals:

- Week intent: `unplanned` when there is no planned session, `recovery` when planned load is zero, `quality` when the plan contains hard/race/tempo/interval/hill work, otherwise `base`.
- Delivered stimulus: `on_target` when completed load is 80-120% of planned load, `too_low` below 80%, `too_high` above 120%, `no_plan` without planned sessions, and `no_signal` when no comparable target exists.
- Body response: `positive` when easy pace improves at least 2% against recent active weeks without an excessive stimulus, `fatigue_risk` when weekly load jumps more than 35% from the previous active week or monotony is at least 2.0, `watch` when easy pace worsens while load is not lower or the stimulus is high, otherwise `no_signal`.
- Recommendation: a short next-step code derived from the intent, stimulus, and response, such as keeping the current structure, reducing load, improving adherence, adding a plan, or collecting more data.

Event preparation metrics are simple planning indicators:

- Days until start: event date minus today in the owner timezone.
- Target pace: target time divided by event distance.
- Current 4-week distance/load: completed running activity totals over the last 28 days.
- Longest 8-week run: longest completed run in the last 56 days.
- Long-run event distance ratio: longest 8-week run divided by event distance.
- Planned distance/load to event: planned workouts from today through event date.
- Missed planned sessions: recent planned non-rest workouts before today without a linked completion.
- Phase: base, build, peak, taper, race week, completed, or cancelled based on days remaining and event status.
