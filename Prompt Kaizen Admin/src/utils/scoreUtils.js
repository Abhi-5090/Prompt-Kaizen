/**
 * Admin palette — kept in sync with the user-side scoreUtils so that the
 * Prompt Details page renders identically to the Evaluation Result page.
 */

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

export function normalizeToTen(score, max) {
  if (!max) return 0;
  return Math.round((score / max) * 10 * 10) / 10;
}

export function heatmapClass(scaledScore) {
  if (scaledScore >= 8) return 'bg-brand text-brand-fg ring-1 ring-brand shadow-[0_8px_24px_-12px_rgba(241,93,35,0.55)]';
  if (scaledScore >= 5) return 'bg-surface-sunken text-ink ring-1 ring-line';
  return 'bg-panel text-panel-soft ring-1 ring-ink-soft';
}

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
    default:
      return 'bg-panel text-panel-soft border border-panel';
  }
}

export function roleBadgeClass(role) {
  return role === 'admin'
    ? 'bg-panel text-panel-soft'
    : 'bg-surface-sunken text-ink-soft border border-line';
}

export function progressBarClass(ratio) {
  if (ratio >= 0.75) return 'bg-brand';
  if (ratio >= 0.5)  return 'bg-brand/85';
  if (ratio >= 0.25) return 'bg-brand/65';
  return 'bg-brand/45';
}
