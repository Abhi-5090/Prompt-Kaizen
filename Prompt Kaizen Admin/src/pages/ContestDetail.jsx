import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Trophy, Calendar, Clock, Users as UsersIcon, FileSpreadsheet, Loader2,
  CheckCircle2, Lock, Trash2, Upload, Send, ShieldCheck, Pencil,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api/axiosInstance.js';
import { useDialog } from '../components/Dialog.jsx';
import { ratingBadgeClass } from '../utils/scoreUtils.js';

const STATUS_BADGE = {
  draft:     'bg-surface text-ink-soft border border-line',
  published: 'bg-surface-sunken text-ink',
  closed:    'bg-panel text-panel-soft',
};

export default function ContestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dialog = useDialog();
  const fileInputRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  // Default to 'append' — the safer mode. Admins must explicitly opt into
  // 'replace' (which wipes the existing allowlist) and confirm a dialog.
  const [uploadMode, setUploadMode] = useState('append');

  const load = () => {
    setLoading(true);
    api.get(`/admin/contests/${id}`)
      .then((res) => setData(res.data))
      .catch((e) => toast.error(errorMessage(err, 'Failed to load contest.')))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const onUploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so picking the same file again retriggers
    if (!file) return;
    if (uploadMode === 'replace') {
      const currentCount = data?.contest?.allowedEmails?.length || 0;
      const ok = await dialog.confirm({
        title: 'Replace the existing allowlist?',
        message: `This will OVERWRITE the existing allowlist of ${currentCount} email${currentCount === 1 ? '' : 's'} with the contents of the uploaded file.`,
        confirmLabel: 'Replace allowlist',
        destructive: true,
      });
      if (!ok) return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mode', uploadMode);
    try {
      setBusy(true);
      const { data: res } = await api.post(`/admin/contests/${id}/emails`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadResult({
        parsed: res.parsed, added: res.added, skipped: res.skipped,
        total: res.total, capped: res.capped, mode: res.mode,
      });
      if (res.mode === 'append') {
        // Append: report how many NEW unique emails actually landed (file
        // duplicates against the existing list are silently de-duped).
        toast.success(`Added ${res.added} new email${res.added === 1 ? '' : 's'} · total ${res.total}`);
      } else {
        toast.success(`Allowlist replaced · ${res.total} total`);
      }
      if (res.capped) {
        toast.error('Upload hit the per-file email cap. Some rows from the end of the file were ignored.');
      }
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Upload failed.'));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    const ok = await dialog.confirm({
      title: 'Publish this contest?',
      message: 'Eligible users will be able to take it during the scheduled window.',
      confirmLabel: 'Publish',
    });
    if (!ok) return;
    try {
      setBusy(true);
      await api.post(`/admin/contests/${id}/publish`);
      toast.success('Contest published.');
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to publish.'));
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    const ok = await dialog.confirm({
      title: 'Close this contest?',
      message: 'No further submissions will be accepted.',
      confirmLabel: 'Close contest',
      destructive: true,
    });
    if (!ok) return;
    try {
      setBusy(true);
      await api.post(`/admin/contests/${id}/close`);
      toast.success('Contest closed.');
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to close.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await dialog.confirm({
      title: 'Delete this contest?',
      message: 'All scenarios, allowlist entries and submissions will be permanently lost.',
      confirmLabel: 'Delete contest',
      destructive: true,
    });
    if (!ok) return;
    try {
      setBusy(true);
      await api.delete(`/admin/contests/${id}`);
      toast.success('Contest deleted.');
      navigate('/contests');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-brand-text">Loading contest...</p>;
  if (!data) return null;
  const { contest, submissions } = data;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <Link to="/contests" className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold text-brand-text hover:text-ink transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to contests
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink flex items-center gap-3">
            {contest.title}
            <span className={`badge ${STATUS_BADGE[contest.status]}`}>{contest.status}</span>
          </h1>
          <p className="text-brand-text text-sm">{contest.description || 'No description provided.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {contest.status !== 'closed' && (
            <Link to={`/contests/${contest._id}/edit`} className="btn-ghost text-sm">
              <Pencil className="w-4 h-4" /> Edit
            </Link>
          )}
          {contest.status === 'draft' && (
            <button onClick={publish} disabled={busy} className="btn-primary text-sm">
              <Send className="w-4 h-4" /> Publish
            </button>
          )}
          {contest.status === 'published' && (
            <button onClick={close} disabled={busy} className="btn-ghost text-sm">
              <Lock className="w-4 h-4" /> Close
            </button>
          )}
          <button onClick={remove} disabled={busy} className="btn-danger">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCard
          label="Date (IST)"
          value={new Date(contest.scheduledDate).toLocaleDateString(undefined, {
            timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric',
          })}
          Icon={Calendar}
        />
        <InfoCard
          label="Window (IST)"
          value={
            contest.startsAt && contest.endsAt
              ? `${new Date(contest.startsAt).toLocaleTimeString(undefined, { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })} – ${new Date(contest.endsAt).toLocaleTimeString(undefined, { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })}`
              : 'Full day'
          }
          Icon={Clock}
        />
        <InfoCard label="Per-user limit" value={`${contest.durationMinutes} min`} Icon={Clock} />
        <InfoCard label="Allowlist" value={`${contest.allowedEmails?.length || 0} emails`} Icon={UsersIcon} />
      </div>

      {/* Allowlist uploader */}
      <div className="card p-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="stat-icon"><FileSpreadsheet className="w-5 h-5" /></span>
            <div>
              <h3 className="font-semibold text-ink">Participant allowlist</h3>
              <p className="text-[11px] uppercase tracking-wider text-brand-text font-semibold">
                Upload an Excel / CSV file (no headers — one email per row)
              </p>
            </div>
          </div>
          <input
            type="file" ref={fileInputRef} className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={onUploadFile}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={uploadMode}
              onChange={(e) => setUploadMode(e.target.value)}
              disabled={busy || contest.status === 'closed'}
              className="input !py-1.5 text-xs max-w-[160px]"
              title="Append adds to the existing allowlist; Replace wipes and re-uploads."
            >
              <option value="append">Append to existing</option>
              <option value="replace">Replace existing</option>
            </select>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || contest.status === 'closed'}
              className="btn-primary text-sm"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin-slow" /> : <Upload className="w-4 h-4" />}
              Upload allowlist
            </button>
          </div>
        </div>
        {uploadResult ? (
          <div className="text-sm text-ink-soft">
            <CheckCircle2 className="inline w-4 h-4 mr-1 text-ink" />
            {uploadResult.mode === 'append' ? (
              <>
                Parsed <span className="font-bold">{uploadResult.parsed}</span> emails ·
                added <span className="font-bold">{uploadResult.added}</span> new ·
                skipped <span className="font-bold">{uploadResult.skipped}</span> rows ·
                total now <span className="font-bold">{uploadResult.total}</span>
              </>
            ) : (
              <>
                Parsed <span className="font-bold">{uploadResult.parsed}</span> emails ·
                skipped <span className="font-bold">{uploadResult.skipped}</span> rows ·
                total now <span className="font-bold">{uploadResult.total}</span>
              </>
            )}
          </div>
        ) : null}
        {contest.allowedEmails?.length > 0 ? (
          <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface/30 p-3 text-xs text-ink-soft leading-relaxed">
            {contest.allowedEmails.join(' · ')}
          </div>
        ) : (
          <p className="mt-2 text-sm text-brand-text">
            No participants added yet — upload a file to make this contest available to users.
          </p>
        )}
      </div>

      {/* Scenarios preview */}
      <div className="card p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="stat-icon"><Trophy className="w-5 h-5" /></span>
          <h3 className="font-semibold text-ink">Scenarios ({contest.scenarios?.length || 0})</h3>
        </div>
        <ol className="space-y-3">
          {(contest.scenarios || []).map((s, i) => (
            <li key={i} className="rounded-xl border border-line p-4 bg-surface/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="badge bg-panel text-panel-soft">Q{i + 1}</span>
                <span className="badge bg-surface text-ink-soft border border-line">{s.category}</span>
              </div>
              <p className="text-sm text-ink whitespace-pre-wrap">{s.scenario}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Submissions */}
      <SubmissionsTable submissions={submissions} totalScenarios={contest.scenarios?.length || 0} />
    </div>
  );
}

function InfoCard({ label, value, Icon }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-surface-sunken text-ink flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider font-semibold text-brand-text">{label}</p>
        <p className="font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}

function SubmissionsTable({ submissions, totalScenarios }) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="p-5 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="stat-icon"><ShieldCheck className="w-5 h-5" /></span>
          <div>
            <h3 className="font-semibold text-ink">Submissions</h3>
            <p className="text-[11px] uppercase tracking-wider text-brand-text font-semibold">
              Ranked by average score
            </p>
          </div>
        </div>
        <span className="badge-cream">{submissions.length}</span>
      </div>
      {submissions.length === 0 ? (
        <div className="p-8 text-center text-sm text-brand-text">
          No submissions yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-brand-text border-b border-line bg-surface/40">
                <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Rank</th>
                <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Participant</th>
                <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Average</th>
                <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Answered</th>
                <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Status</th>
                <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s, i) => (
                <motion.tr
                  key={s._id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: i * 0.02 }}
                  className="border-b border-line/60 hover:bg-surface/60 transition"
                >
                  <td className="py-2.5 px-4 font-semibold text-ink">#{i + 1}</td>
                  <td className="py-2.5 px-4">
                    <p className="font-medium text-ink">{s.userId?.name || '—'}</p>
                    <p className="text-xs text-brand-text">{s.userId?.email}</p>
                  </td>
                  <td className="py-2.5 px-4 font-bold text-ink">
                    {s.averageScore}<span className="text-brand-text text-xs">/100</span>
                  </td>
                  <td className="py-2.5 px-4 text-ink-soft">
                    {(s.answers || []).filter((a) => (a.userPrompt || '').trim().length).length} / {totalScenarios}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`badge ${s.status === 'submitted' ? 'bg-surface-sunken text-ink' : 'bg-surface text-ink-soft border border-line'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-brand-text whitespace-nowrap">
                    {s.submittedAt
                      ? new Date(s.submittedAt).toLocaleString(undefined, {
                          timeZone: 'Asia/Kolkata',
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', hour12: false,
                        }) + ' IST'
                      : '—'}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
