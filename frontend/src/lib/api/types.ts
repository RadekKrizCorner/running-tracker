export type User = {
  id: string;
  email: string;
  display_name: string | null;
  is_demo?: boolean;
  timezone: string;
  units: string;
};

export type AuthOptions = {
  demo_enabled: boolean;
};

export type HeartRateZone = {
  name: string;
  min_hr: number;
  max_hr: number;
};

export type HeartRateZoneSet = {
  id: string;
  name: string;
  effective_from: string;
  zones: HeartRateZone[];
};

export type HeartRateRecomputeResponse = {
  recomputed_activities: number;
  remaining_unknown_activities: number;
  activities_without_effective_zones: number;
  earliest_activity_without_effective_zones: string | null;
};

export type PaceZone = {
  name: string;
  min_pace_s_per_km: number;
  max_pace_s_per_km: number;
};

export type UserPreference = {
  locale: string;
  dashboard_mode: 'simple' | 'advanced';
  favorite_template_ids: string[];
  recent_template_ids: string[];
  pace_zones: PaceZone[];
  elevation_correction_enabled: boolean;
  elevation_correction_mode: 'only_when_zero' | 'always';
  elevation_provider_url: string | null;
  avatar_icon: string | null;
  avatar_image_data_url: string | null;
};

export type ElevationRecomputeResponse = {
  recomputed_activities: number;
  skipped_activities: number;
  failed_activities: number;
};

export type StravaStatus = {
  connected: boolean;
  status: string;
  provider_user_id: string | null;
  scopes_granted: string[];
  missing_scopes: string[];
  access_token_expires_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  active_job_id: string | null;
};

export type SyncProgress = {
  phase: string;
  imported: number;
  skipped: number;
  streams: number;
  current_activity: string | null;
  started_at: string | null;
  updated_at: string | null;
};

export type StravaSyncResponse = {
  status: string;
  detail: string;
  job_id: string | null;
};

export type StravaSyncJobStatus = {
  job_id: string;
  status: string;
  detail: string;
  result: Record<string, unknown> | null;
  error: string | null;
  progress: SyncProgress | null;
};

export type ActivityNote = {
  rpe: number | null;
  fatigue: number | null;
  soreness: number | null;
  pain_flag: boolean;
  pain_location: string | null;
  sleep_quality: number | null;
  notes: string | null;
};

export type HeartRateZoneBreakdownItem = {
  zone_index: number;
  name: string;
  min_hr: number;
  max_hr: number;
  seconds: number;
  sample_count: number;
  percentage: number;
};

export type Activity = {
  id: string;
  provider: string;
  provider_activity_id: string | null;
  sport_type: string | null;
  workout_type: string | null;
  name: string | null;
  description: string | null;
  start_time_utc: string;
  start_time_local: string | null;
  timezone: string | null;
  distance_m: number | null;
  moving_time_s: number | null;
  elapsed_time_s: number | null;
  elevation_gain_m: number | null;
  average_speed_mps: number | null;
  max_speed_mps: number | null;
  average_hr: number | null;
  max_hr: number | null;
  average_cadence: number | null;
  calories: number | null;
  perceived_effort: number | null;
  computed_load: number | null;
  load_source: string | null;
  intensity_class: string | null;
  elevation_gain_source: string | null;
  heart_rate_zone_breakdown: HeartRateZoneBreakdownItem[];
  map_polyline: string | null;
  gear: { id: string; name: string }[];
  note: ActivityNote | null;
};

export type Stream = {
  stream_type: string;
  data: unknown[] | Record<string, unknown>;
  sample_count: number | null;
};

export type ActivitySplit = {
  split_index: number;
  distance_m: number;
  duration_s: number;
  pace_s_per_km: number | null;
  average_hr: number | null;
  elevation_gain_m: number;
};

export type ActivitySplitsResponse = {
  source: 'streams' | 'activity_summary';
  splits: ActivitySplit[];
};

export type WeeklyMetric = {
  week_start_date: string;
  distance_m: number;
  moving_time_s: number;
  elevation_gain_m: number;
  run_count: number;
  load: number;
  acute_load: number;
  chronic_load: number;
  ramp_ratio: number | null;
  easy_time_s: number;
  moderate_time_s: number;
  hard_time_s: number;
  unknown_time_s: number;
  long_run_distance_m: number;
};

export type YearlyRunningSummary = {
  year: number;
  distance_m: number;
  elevation_gain_m: number;
  moving_time_s: number;
};

export type ReportValues = {
  program?: string;
  title?: string;
  week?: string;
  main_distance?: string;
  main_unit?: string;
  main_label?: string;
  completion_percent?: number;
  stats?: {
    runs?: string;
    time?: string;
    plan_vs_actual?: string;
    longest_run?: string;
    avg_pace?: string;
    training_adherence?: string;
  };
  volume?: {
    planned?: number;
    actual?: number;
    difference?: number;
  };
  summary_lines?: string[];
  went_well?: string[];
  focus_next?: string[];
  footer?: string[];
  [key: string]: unknown;
};

export type ReportTemplate = {
  id: string;
  name: string;
  description: string | null;
  format: string;
  theme: Record<string, unknown>;
  sections: Array<Record<string, unknown>>;
  field_defaults: ReportValues;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type ReportTemplatePayload = Omit<ReportTemplate, 'id' | 'created_at' | 'updated_at'>;

export type ReportTemplateRenderConfig = {
  theme: Record<string, unknown>;
  sections: Array<Record<string, unknown>>;
};

export type ReportPrefillResponse = {
  template_id: string | null;
  period_start: string;
  period_end: string;
  values: ReportValues;
};

export type ReportRenderPayload = {
  values: ReportValues;
  template?: ReportTemplateRenderConfig;
};

export type GeneratedReport = {
  id: string;
  template_id: string | null;
  title: string;
  period_start: string;
  period_end: string;
  values: ReportValues;
  created_at: string;
  updated_at: string;
};

export type GeneratedReportPayload = Omit<GeneratedReport, 'id' | 'created_at' | 'updated_at'>;

export type AerobicTrendPoint = {
  date: string;
  pace_s_per_km: number;
  average_hr: number | null;
  elevation_gain_per_km: number;
};

export type TrendMetricWeek = {
  week_start_date: string;
  distance_m: number;
  moving_time_s: number;
  elevation_gain_m: number;
  run_count: number;
  load: number;
  zone_seconds: number[];
  easy_pace_s_per_km: number | null;
  long_run_share: number;
  run_day_count: number;
  elevation_gain_per_km: number;
  zone_paces_s_per_km: Array<number | null>;
  planned_distance_m: number;
  completed_distance_m: number;
  planned_time_s: number;
  completed_time_s: number;
  planned_load: number;
  completed_load: number;
  distance_adherence: number | null;
  time_adherence: number | null;
  load_adherence: number | null;
  monotony: number | null;
  coach_intent: string;
  coach_stimulus: string;
  coach_response: string;
  coach_recommendation: string;
};

export type HeatmapPoint = {
  lat: number;
  lng: number;
  weight: number;
  activity_count: number;
};

export type HeatmapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type RunHeatmap = {
  points: HeatmapPoint[];
  bounds: HeatmapBounds | null;
  activity_count: number;
  point_count: number;
};

export type Dashboard = {
  period: string;
  this_week: {
    distance_m: number;
    moving_time_s: number;
    run_count: number;
    load: number;
    longest_run_m: number;
    elevation_gain_m: number;
  };
  trends: {
    week_distance_delta_m: number;
    ramp_ratio: number | null;
    acute_load: number;
    chronic_load: number;
  };
  intensity_split: {
    easy_time_s: number;
    moderate_time_s: number;
    hard_time_s: number;
    unknown_time_s: number;
  };
  weekly: WeeklyMetric[];
  recent_activities: ActivitySummary[];
  upcoming_workouts: PlannedWorkout[];
  week_plan: WeekPlanComparison;
};

export type WeekPlanComparison = {
  week_start_date: string;
  week_end_date: string;
  planned_distance_m: number;
  completed_distance_m: number;
  remaining_distance_m: number;
  distance_delta_m: number;
  planned_time_s: number;
  completed_time_s: number;
  remaining_time_s: number;
  duration_delta_s: number;
  planned_load: number;
  completed_load: number;
  load_delta: number;
  planned_sessions: number;
  completed_sessions: number;
  remaining_sessions: number;
  missed_sessions: number;
  extra_sessions: number;
  rows: WeekPlanRow[];
};

export type WeekPlanRow = {
  date: string;
  planned_workout_id: string | null;
  planned_title: string | null;
  planned_type: string | null;
  planned_intensity: string | null;
  planned_distance_m: number;
  planned_duration_s: number | null;
  activity_id: string | null;
  activity_name: string | null;
  actual_intensity: string | null;
  actual_distance_m: number;
  actual_duration_s: number | null;
  distance_delta_m: number;
  duration_delta_s: number;
  intensity_match: boolean | null;
  outcome: string;
};

export type ActivitySummary = {
  id: string;
  name: string | null;
  sport_type: string | null;
  start_time_utc: string;
  distance_m: number;
  moving_time_s: number;
  computed_load: number;
  intensity_class: string | null;
};

export type Gear = {
  id: string;
  type: string;
  name: string;
  brand: string | null;
  model: string | null;
  start_date: string | null;
  retirement_distance_m: number;
  retired_at: string | null;
  notes: string | null;
  total_distance_m: number;
  retirement_warning: boolean;
};

export type EventPreparation = {
  phase: string;
  current_4w_distance_m: number;
  current_4w_load: number;
  longest_run_8w_m: number;
  long_run_event_distance_ratio: number | null;
  planned_distance_to_event_m: number;
  planned_load_to_event: number;
  planned_sessions_to_event: number;
  completed_runs_since_created: number;
  completed_distance_since_created_m: number;
  completed_load_since_created: number;
  missed_planned_sessions: number;
  easy_time_s: number;
  moderate_time_s: number;
  hard_time_s: number;
};

export type Event = {
  id: string;
  name: string;
  event_date: string;
  location: string | null;
  event_type: string;
  distance_m: number | null;
  elevation_gain_m: number | null;
  surface: string | null;
  priority: string | null;
  status: string;
  target_time_s: number | null;
  website_url: string | null;
  course_map_url: string | null;
  course_gpx: string | null;
  poster_image_data: string | null;
  goal_notes: string | null;
  course_notes: string | null;
  fueling_notes: string | null;
  gear_notes: string | null;
  travel_notes: string | null;
  days_until_start: number;
  weeks_until_start: number;
  target_pace_s_per_km: number | null;
  preparation: EventPreparation;
};

export type EventGuidanceMessage = {
  tone: string;
  title: string;
  detail: string;
};

export type EventSuggestedSession = {
  workout_type: string;
  title: string;
  target_intensity: string;
  target_distance_m: number | null;
  target_duration_s: number | null;
  detail: string;
};

export type EventPlanningGuidance = {
  event_id: string;
  phase: string;
  weeks_until_start: number;
  suggested_weekly_distance_m: number;
  suggested_long_run_m: number | null;
  suggested_sessions: EventSuggestedSession[];
  messages: EventGuidanceMessage[];
};

export type PlannedWorkout = {
  id: string | null;
  plan_id: string | null;
  scheduled_date: string;
  session_label: string | null;
  sort_order: number;
  workout_type: string;
  title: string;
  target_duration_s: number | null;
  target_distance_m: number | null;
  target_intensity: string | null;
  instructions: string | null;
  completed_activity_id: string | null;
  status: string;
};

export type TrainingPlan = {
  id: string | null;
  title: string;
  goal_type: string | null;
  start_date: string;
  end_date: string;
  status: string;
};

export type PlanPreview = {
  plan: TrainingPlan;
  workouts: PlannedWorkout[];
};

export type WorkoutTemplate = {
  id: string;
  name: string;
  workout_type: string;
  title: string;
  target_duration_s: number | null;
  target_distance_m: number | null;
  target_intensity: string | null;
  instructions: string | null;
};

export type WorkoutPoolItem = {
  id: string;
  source_template_id: string | null;
  workout_type: string;
  title: string;
  target_duration_s: number | null;
  target_distance_m: number | null;
  target_intensity: string | null;
  instructions: string | null;
};

export type CalendarActivity = {
  id: string;
  name: string | null;
  date: string;
  distance_m: number;
  moving_time_s: number;
  intensity_class: string | null;
};

export type CalendarEvent = {
  id: string;
  event_date: string;
  event_type: string;
  title: string;
  notes: string | null;
  source_type: 'custom' | 'event';
  source_id: string | null;
};

export type CalendarResponse = {
  plan?: TrainingPlan | null;
  planned_workouts: PlannedWorkout[];
  activities: CalendarActivity[];
  events: CalendarEvent[];
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  action_url: string | null;
  action_label: string | null;
  source_type: string | null;
  source_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationSummary = {
  unread_count: number;
};
