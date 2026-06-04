type RunnerSceneProps = {
  variant?: 'dashboard' | 'race' | 'heatmap' | 'settings' | 'empty';
  label?: string;
};

const palette = {
  dashboard: {
    sky: '#dfeefa',
    ridgeA: '#7aa18b',
    ridgeB: '#2f6f60',
    path: '#f4b65d',
    accent: '#2f66d0',
  },
  race: {
    sky: '#f7e7d3',
    ridgeA: '#d89b58',
    ridgeB: '#954d37',
    path: '#ffffff',
    accent: '#256f5b',
  },
  heatmap: {
    sky: '#e4eef7',
    ridgeA: '#79a8c6',
    ridgeB: '#294f68',
    path: '#f2c94c',
    accent: '#bf3b45',
  },
  settings: {
    sky: '#e9f3ec',
    ridgeA: '#8bb399',
    ridgeB: '#274a3e',
    path: '#c8d8cf',
    accent: '#d17b0f',
  },
  empty: {
    sky: '#edf3ff',
    ridgeA: '#b5c8ba',
    ridgeB: '#6b8578',
    path: '#ffffff',
    accent: '#256f5b',
  },
};

export function RunnerScene({ variant = 'dashboard', label }: RunnerSceneProps) {
  const colors = palette[variant];

  return (
    <div className={`runner-scene ${variant}`} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined}>
      <svg viewBox="0 0 520 340" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="520" height="340" rx="18" fill={colors.sky} />
        <circle cx="398" cy="74" r="38" fill="#fff6d6" />
        <path d="M0 171C61 118 98 113 157 151C213 187 246 159 304 122C372 79 421 105 520 160V340H0V171Z" fill={colors.ridgeA} opacity="0.72" />
        <path d="M0 221C71 167 120 169 185 203C245 235 291 198 346 171C411 140 462 159 520 204V340H0V221Z" fill={colors.ridgeB} />
        <path d="M-8 312C66 280 103 246 177 260C245 273 294 316 362 290C415 269 451 231 528 246" stroke={colors.path} strokeWidth="18" strokeLinecap="round" />
        <path d="M-8 312C66 280 103 246 177 260C245 273 294 316 362 290C415 269 451 231 528 246" stroke="#17211d" strokeOpacity="0.12" strokeWidth="2" strokeDasharray="9 13" strokeLinecap="round" />
        <path d="M136 228L164 201L193 228" stroke="#ffffff" strokeOpacity="0.52" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M302 178L336 145L370 178" stroke="#ffffff" strokeOpacity="0.42" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <g transform="translate(284 213)">
          <circle cx="18" cy="10" r="8" fill={colors.accent} />
          <path d="M17 21L3 42M19 22L42 31M16 34L31 51M14 35L5 56" stroke={colors.accent} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <g opacity={variant === 'heatmap' ? 0.85 : 0.28}>
          <circle cx="120" cy="257" r="14" fill="#6fbf73" />
          <circle cx="142" cy="253" r="18" fill="#f2c94c" />
          <circle cx="166" cy="260" r="13" fill="#f2994a" />
          <circle cx="189" cy="263" r="10" fill="#bf3b45" />
        </g>
      </svg>
    </div>
  );
}
