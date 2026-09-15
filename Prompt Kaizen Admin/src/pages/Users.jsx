import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users as UsersIcon, Search, ShieldCheck, Inbox, Upload, Trash2, KeyRound, Loader2, FileSpreadsheet, Download,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axiosInstance.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDialog } from '../components/Dialog.jsx';
import { roleBadgeClass } from '../utils/scoreUtils.js';
import { usePaginatedList } from '../utils/usePaginatedList.js';
import Pagination from '../components/Pagination.jsx';

export default function Users() {
  const { user: me } = useAuth();
  const dialog = useDialog();
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rowBusyId, setRowBusyId] = useState(null);
  const fileInputRef = useRef(null);

  // Paging and search both run on the server. Filtering in the browser used to
  // mean the box only searched the first 1000 accounts ever fetched.
  const {
    items: users, pagination, meta, loading, error,
    page, setPage, search: q, setSearch: setQ,
    reload: load, removeLocal,
  } = usePaginatedList('/admin/users', { limit: 25 });

  // Counts that describe the whole collection cannot be derived from one page,
  // so the server supplies them.
  const totalUsers = pagination.total;
  const adminCount = meta.adminCount ?? 0;

  // Hits GET /admin/users/export which streams an .xlsx of (Name, Email) for
  // every user. We pull it as a Blob, build an object URL, and trigger a
  // synthetic anchor click so the browser saves it to Downloads. The server
  // already sets Content-Disposition with a date-stamped filename; we mirror
  // it client-side as a fallback in case the browser strips that header.
  const onExportUsers = async () => {
    try {
      setExporting(true);
      const res = await api.get('/admin/users/export', { responseType: 'blob' });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      // Try to read the server-supplied filename; fall back to a local one.
      const disposition = res.headers?.['content-disposition'] || '';
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const filename = match?.[1] || `prompt-kaizen-users-${new Date().toISOString().slice(0, 10)}.xlsx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Users exported.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to export users.');
    } finally {
      setExporting(false);
    }
  };

  const onUploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      setUploading(true);
      const { data } = await api.post('/admin/users/bulk-upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const lines = [`${data.created} created`];
      if (data.skippedDuplicates) lines.push(`${data.skippedDuplicates} duplicate${data.skippedDuplicates === 1 ? '' : 's'} skipped`);
      if (data.skippedInvalid)    lines.push(`${data.skippedInvalid} invalid row${data.skippedInvalid === 1 ? '' : 's'}`);
      toast.success(lines.join(' · '));
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (u) => {
    const ok = await dialog.confirm({
      title: `Delete ${u.name || 'this user'}?`,
      message: `${u.email}\n\nTheir prompts and contest submissions will also be deleted. This cannot be undone.`,
      confirmLabel: 'Delete user',
      destructive: true,
    });
    if (!ok) return;
    try {
      setRowBusyId(u._id);
      await api.delete(`/admin/users/${u._id}`);
      toast.success('User deleted.');
      removeLocal(u._id);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete user.');
    } finally {
      setRowBusyId(null);
    }
  };

  const onResetPassword = async (u) => {
    const pwd = await dialog.prompt({
      title: 'Reset password',
      message: `Set a new password for ${u.email} (at least 6 characters).`,
      placeholder: 'New password',
      type: 'password',
      confirmLabel: 'Reset password',
      validate: (v) => (String(v || '').length < 6 ? 'Password must be at least 6 characters.' : ''),
    });
    if (pwd === null) return;
    try {
      setRowBusyId(u._id);
      await api.post(`/admin/users/${u._id}/reset-password`, { password: pwd });
      toast.success(`Password reset for ${u.email}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to reset password.');
    } finally {
      setRowBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <span className="chip"><UsersIcon className="w-3.5 h-3.5" /> All members</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Users</h1>
          <p className="text-brand-text text-sm">
            {totalUsers.toLocaleString()} total · <span className="text-ink font-semibold">{adminCount} admin</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            aria-label="Upload a spreadsheet of users to bulk-create"
            onChange={onUploadFile}
          />
          <button
            type="button"
            onClick={onExportUsers}
            disabled={exporting || loading}
            className="btn-ghost text-sm"
            title="Download every user's name and email as an Excel file"
          >
            {exporting ? (
              <><Loader2 className="w-4 h-4 animate-spin-slow" /> Exporting…</>
            ) : (
              <><Download className="w-4 h-4" /> Export users</>
            )}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-primary text-sm"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin-slow" /> Uploading…</>
            ) : (
              <><Upload className="w-4 h-4" /> Bulk upload</>
            )}
          </button>
        </div>
      </motion.div>

      <div className="card p-4 flex flex-wrap items-start gap-3 border-l-4 border-l-flame-500">
        <span className="w-10 h-10 rounded-xl bg-brand text-brand-fg flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-ink">Excel / CSV format</p>
          <p className="text-sm text-brand-text mt-0.5">
            No header row. Three columns per row, in this order: <span className="font-semibold text-ink">Name</span>,{' '}
            <span className="font-semibold text-ink">Email</span>,{' '}
            <span className="font-semibold text-ink">Password</span> (min 6 chars).
            Existing emails are skipped automatically.
          </p>
        </div>
      </div>

      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            aria-label="Search users by name or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email..."
            className="input pl-9"
          />
        </div>
        <span className="badge-ghost ml-auto">
          {pagination.total.toLocaleString()} {q ? 'match' : 'user'}{pagination.total === 1 ? '' : q ? 'es' : 's'}
        </span>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-2 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-surface-sunken" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-surface-sunken text-ink flex items-center justify-center">
              <Inbox className="w-6 h-6" />
            </div>
            <p className="mt-3 font-semibold text-ink">No users match your search</p>
            <p className="text-sm text-brand-text mt-1">Try a different name or email.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-brand-text border-b border-line bg-surface">
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Name</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Email</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Role</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold">Joined</th>
                  <th className="py-2 px-4 text-[11px] uppercase tracking-wider font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => {
                  const isMe = me && String(me._id || me.id) === String(u._id);
                  const isAdmin = u.role === 'admin';
                  const rowBusy = rowBusyId === u._id;
                  const lockDelete = isMe || isAdmin;
                  const lockReason = isMe ? 'You cannot delete yourself.' : isAdmin ? 'Cannot delete an admin account.' : '';

                  return (
                    <motion.tr
                      key={u._id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: i * 0.02 }}
                      className="border-b border-line/60 hover:bg-surface/60 transition"
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-surface-sunken text-ink flex items-center justify-center text-xs font-bold uppercase">
                            {u.name?.[0] || 'U'}
                          </div>
                          <span className="font-medium text-ink">{u.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-brand-text">{u.email}</td>
                      <td className="py-2.5 px-4">
                        <span className={`badge ${roleBadgeClass(u.role)}`}>
                          {isAdmin ? <ShieldCheck className="w-3 h-3" /> : null}
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-brand-text">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onResetPassword(u)}
                            disabled={rowBusy}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-line-strong text-ink hover:bg-brand hover:text-brand-fg hover:border-brand transition disabled:opacity-50"
                            title="Reset password"
                            aria-label="Reset password"
                          >
                            {rowBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin-slow" /> : <KeyRound className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(u)}
                            disabled={rowBusy || lockDelete}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-line-strong text-ink hover:bg-panel hover:text-brand-fg hover:border-panel transition disabled:opacity-40 disabled:cursor-not-allowed"
                            title={lockReason || 'Delete user'}
                            aria-label="Delete user"
                          >
                            {rowBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin-slow" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {error && !loading && (
          <p className="mt-4 text-sm text-brand-text" role="alert">{error}</p>
        )}

        <Pagination pagination={pagination} onPage={setPage} loading={loading} />
      </div>
    </div>
  );
}
