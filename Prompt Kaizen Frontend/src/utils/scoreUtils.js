export const PARAMETER_KEYS = [
  { key: 'clarity', label: 'Clarity', max: 10 },
  { key: 'context', label: 'Context', max: 15 },
  { key: 'roleAssignment', label: 'Role', max: 10 },
  { key: 'taskDefinition', label: 'Task', max: 15 },
  { key: 'inputParameters', label: 'Input Details', max: 15 },
  { key: 'outputFormat', label: 'Output Format', max: 10 },
  { key: 'constraints', label: 'Constraints', max: 10 },
  { key: 'tone', label: 'Tone', max: 5 },
  { key: 'relevance', label: 'Relevance', max: 5 },
  { key: 'grammarStructure', label: 'Grammar', max: 5 },
];

export function ratingFromScore(score) {
  if (score >= 90) return 'Excellent Prompt';
  if (score >= 75) return 'Good Prompt';
  if (score >= 60) return 'Average Prompt';
  if (score >= 40) return 'Needs Improvement';
  return 'Poor Prompt';
}

/**
 * Heatmap palette — keeps the two-color rule:
 *  - High (≥ 8): solid peach, dark text. Visually dominant ("strong").
 *  - Mid (5–7): soft cream, dark text. Quieter ("okay").
 *  - Low (< 5): dark warm brown, peach text. Inverted ("needs attention").
 */
export function heatmapClass(scaledScore) {
  if (scaledScore >= 8) return 'bg-brand text-brand-fg ring-1 ring-brand shadow-[0_8px_24px_-12px_rgba(241,93,35,0.55)]';
  if (scaledScore >= 5) return 'bg-surface-sunken text-ink ring-1 ring-line';
  return 'bg-panel text-panel-soft ring-1 ring-ink-soft';
}

export function normalizeToTen(score, max) {
  if (!max) return 0;
  return Math.round((score / max) * 10 * 10) / 10;
}

/**
 * Rating badge — small chip near the overall score.
 */
export function ratingBadgeClass(rating) {
  switch (rating) {
    case 'Excellent Prompt':
      return 'bg-panel text-panel-soft';
    case 'Good Prompt':
      return 'bg-surface-sunken text-ink';
    case 'Average Prompt':
      return 'bg-surface-sunken text-ink border border-line';
    case 'Needs Improvement':
      return 'bg-surface text-ink border border-line';
    default: // Poor
      return 'bg-panel text-panel-soft border border-panel';
  }
}

/**
 * For a fractional progress (0..1), pick a bar color.
 */
export function progressBarClass(ratio) {
  if (ratio >= 0.75) return 'bg-brand';
  if (ratio >= 0.5)  return 'bg-brand/85';
  if (ratio >= 0.25) return 'bg-brand/65';
  return 'bg-brand/45';
}
