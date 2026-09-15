import { forwardRef } from 'react';
import { PARAMETER_KEYS, normalizeToTen } from '../utils/scoreUtils.js';

/**
 * 1080×1080 "Wrapped"-style social share card.
 * Rendered into the DOM off-screen so html2canvas can capture it on demand.
 */
const WrappedShareCard = forwardRef(function WrappedShareCard({ data }, ref) {
  if (!data) return null;

  const overallScore = Math.round(Number(data.overallScore ?? 0));
  const rating = data.rating || 'Good Prompt';
  const category = data.category || 'Prompt';
  const scenario = data.scenario || '';

  const cells = PARAMETER_KEYS.map((p) => ({
    ...p,
    value: normalizeToTen(data.scores?.[p.key] ?? 0, p.max),
  }));

  const dateStr = new Date(data.createdAt || Date.now()).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: '-99999px',
        top: 0,
        width: '1080px',
        height: '1080px',
      }}
    >
      <div
        style={{
          width: 1080,
          height: 1080,
          padding: 64,
          background: '#212529',
          color: '#FFFFFF',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Mesh accent */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(at 20% 10%, rgba(255,255,255,0.20) 0px, transparent 50%),' +
              'radial-gradient(at 80% 0%, rgba(255,255,255,0.10) 0px, transparent 50%),' +
              'radial-gradient(at 0% 90%, rgba(255,255,255,0.18) 0px, transparent 60%)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.08,
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgb(var(--panel-fg) / 0.6) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          {/* Top brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 16,
                background: '#212529',
                color: '#F15D23',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #F15D23',
                boxSizing: 'border-box',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" width="36" height="36">
                <path
                  d="M5 14.5L10 9.5L13 12.5L19 6.5"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="19" cy="6.5" r="2" fill="currentColor" />
              </svg>
            </div>

            <div>
              <p
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: '#FFFFFF',
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                Prompt Kaizen
              </p>
              <p
                style={{
                  fontSize: 12,
                  letterSpacing: '0.26em',
                  textTransform: 'uppercase',
                  color: '#F15D23',
                  margin: '6px 0 0 0',
                  lineHeight: 2,
                }}
              >
                Compatibility Analyzer
              </p>
            </div>
          </div>

          {/* Headline */}
          <div style={{ marginTop: 58 }}>
            <p
              style={{
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.72)',
                margin: 0,
                lineHeight: 1,
              }}
            >
              {category}
            </p>

            <h1
              style={{
                fontSize: 80,
                fontWeight: 900,
                lineHeight: 1.05,
                color: '#FFFFFF',
                margin: '28px 0 0 0',
                maxWidth: 940,
                letterSpacing: '-0.035em',
              }}
            >
              I scored{' '}
              <span style={{ whiteSpace: 'nowrap' }}>{overallScore}/100</span>
              <br />
              on my prompt.
            </h1>
          </div>

          {/* Score block + rating */}
          <div
            style={{
              marginTop: 38,
              display: 'flex',
              alignItems: 'center',
              gap: 42,
            }}
          >
            {/* Score circle */}
            <div
              style={{
                width: 220,
                height: 220,
                borderRadius: '50%',
                background: '#F15D23',
                color: '#212529',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 30px 80px -20px rgba(255,255,255,0.45)',
                flexShrink: 0,
                boxSizing: 'border-box',
                paddingTop: 8,
              }}
            >
              <span
                style={{
                  fontSize: 112,
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: '0.03em',
                  display: 'block',
                  fontVariantNumeric: 'tabular-nums',
                  // marginTop: 12,
                }}
              >
                {overallScore}
              </span>

              <span
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  marginTop: 28,
                  opacity: 0.95,
                  display: 'block',
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                / 100
              </span>
            </div>

            {/* Rating + prompt text */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                paddingTop: 6,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 56,
                  padding: '0 34px',
                  borderRadius: 999,
                  background: '#212529',
                  color: '#F15D23',
                  border: '1px solid transparent',
                  fontWeight: 800,
                  fontSize: 24,
                  letterSpacing: '0.08em',
                  lineHeight: 1,
                  boxSizing: 'border-box',
                  whiteSpace: 'nowrap',
                  textDecoration: 'none',
                }}
              >
                {rating}
              </span>

              <p
                style={{
                  marginTop: 30,
                  marginBottom: 0,
                  fontSize: 30,
                  fontWeight: 500,
                  color: '#FFFFFF',
                  maxWidth: 640,
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {scenario.slice(0, 160)}
                {scenario.length > 160 ? '…' : ''}
              </p>
            </div>
          </div>

          {/* Heatmap strip */}
          <div style={{ marginTop: 44 }}>
            <p
              style={{
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.72)',
                margin: 0,
                lineHeight: 1,
              }}
            >
              Parameter heatmap
            </p>

            <div
              style={{
                marginTop: 18,
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 14,
              }}
            >
              {cells.map((c) => {
                const bg = c.value >= 8 ? '#F15D23' : c.value >= 5 ? '#f8f9fa' : '#212529';
                const fg = c.value < 5 ? '#F15D23' : '#212529';

                return (
                  <div
                    key={c.key}
                    style={{
                      height: 94,
                      background: bg,
                      color: fg,
                      borderRadius: 14,
                      padding: '14px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: c.value < 5 ? '1px solid rgba(255,255,255,0.25)' : 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        letterSpacing: '0.13em',
                        textTransform: 'uppercase',
                        opacity: 0.78,
                        lineHeight: 1,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.label}
                    </span>

                    <span
                      style={{
                        fontSize: 40,
                        fontWeight: 900,
                        marginTop: 5,
                        lineHeight: 1,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {c.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 24,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 17,
                  color: 'rgba(255,255,255,0.68)',
                  margin: 0,
                  lineHeight: 1,
                }}
              >
                {dateStr}
              </p>

              <p
                style={{
                  fontSize: 19,
                  color: '#FFFFFF',
                  margin: '10px 0 0 0',
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                promptkaizen — write prompts that actually work.
              </p>
            </div>

            {/* <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 52,
                padding: '0 32px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.4)',
                color: '#F15D23',
                fontWeight: 900,
                fontSize: 15,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                lineHeight: 1,
                flexShrink: 0,
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
              }}
            >
              Wrapped · Share
            </div> */}
          </div>
        </div>
      </div>
    </div>
  );
});

export default WrappedShareCard;