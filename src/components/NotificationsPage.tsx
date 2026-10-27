import { useState } from 'react';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  Filter,
  Eye,
  EyeOff,
  Send,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import type { AppNotification } from '../types/pms';

interface NotificationsPageProps {
  notifications?: AppNotification[];
  onMarkRead?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  onMarkAllRead?: (ids: string[]) => void;
}

type FilterMode = 'all' | 'unread';

function getNotifIcon(type: AppNotification['type'], id: string) {
  const base = 'w-9 h-9 rounded-xl flex items-center justify-center shrink-0';

  if (id.startsWith('notif-overdue')) {
    return (
      <div className={`${base} bg-red-500/15 border border-red-500/30`}>
        <AlertCircle className="w-4.5 h-4.5 text-red-400 w-5 h-5" />
      </div>
    );
  }
  if (id.startsWith('notif-due-soon')) {
    return (
      <div className={`${base} bg-amber-500/15 border border-amber-500/30`}>
        <Clock className="w-5 h-5 text-amber-400" />
      </div>
    );
  }
  if (id.startsWith('notif-corrections')) {
    return (
      <div className={`${base} bg-amber-500/15 border border-amber-500/30`}>
        <RotateCcw className="w-5 h-5 text-amber-400" />
      </div>
    );
  }
  if (id.startsWith('notif-tl-recommended')) {
    return (
      <div className={`${base} bg-indigo-500/15 border border-indigo-500/30`}>
        <ShieldCheck className="w-5 h-5 text-indigo-400" />
      </div>
    );
  }
  if (id.startsWith('notif-completed')) {
    return (
      <div className={`${base} bg-emerald-500/15 border border-emerald-500/30`}>
        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
      </div>
    );
  }
  if (id.startsWith('notif-review')) {
    return (
      <div className={`${base} bg-purple-500/15 border border-purple-500/30`}>
        <Send className="w-5 h-5 text-purple-400" />
      </div>
    );
  }

  switch (type) {
    case 'success':
      return (
        <div className={`${base} bg-emerald-500/15 border border-emerald-500/30`}>
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        </div>
      );
    case 'warning':
      return (
        <div className={`${base} bg-amber-500/15 border border-amber-500/30`}>
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
      );
    case 'error':
      return (
        <div className={`${base} bg-red-500/15 border border-red-500/30`}>
          <AlertCircle className="w-5 h-5 text-red-400" />
        </div>
      );
    default:
      return (
        <div className={`${base} bg-purple-500/15 border border-purple-500/30`}>
          <Info className="w-5 h-5 text-purple-400" />
        </div>
      );
  }
}

function getTypeLabel(type: AppNotification['type'], id: string) {
  if (id.startsWith('notif-overdue')) return { label: 'Overdue', cls: 'bg-red-500/15 text-red-300 border-red-500/30' };
  if (id.startsWith('notif-due-soon')) return { label: 'Due Soon', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
  if (id.startsWith('notif-corrections')) return { label: 'Revision', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
  if (id.startsWith('notif-tl-recommended')) return { label: 'TL Review', cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' };
  if (id.startsWith('notif-completed')) return { label: 'Completed', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
  if (id.startsWith('notif-review')) return { label: 'Review', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' };
  switch (type) {
    case 'success': return { label: 'Success', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
    case 'warning': return { label: 'Warning', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    case 'error': return { label: 'Error', cls: 'bg-red-500/15 text-red-300 border-red-500/30' };
    default: return { label: 'Info', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' };
  }
}

export default function NotificationsPage({
  notifications = [],
  onMarkRead,
  onMarkUnread,
  onMarkAllRead,
}: NotificationsPageProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const unreadNotifs = notifications.filter((n) => !n.read);
  const displayed = filterMode === 'unread' ? unreadNotifs : notifications;

  const handleMarkAllRead = () => {
    if (onMarkAllRead) {
      onMarkAllRead(unreadNotifs.map((n) => n.id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Notifications
            </h2>
            {unreadNotifs.length > 0 && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                {unreadNotifs.length} Unread
              </span>
            )}
            {notifications.length > 0 && unreadNotifs.length === 0 && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                All read
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Task review events, deadline alerts, and workflow updates from your workspace.
          </p>
        </div>

        {notifications.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            {unreadNotifs.length > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-purple-300 bg-slate-900/60 border border-slate-700 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filter bar */}
      {notifications.length > 0 && (
        <div className="flex items-center gap-2 bg-[#0b112c]/80 border border-slate-800 rounded-2xl p-1.5 w-fit">
          <div className="flex items-center gap-1 text-slate-500 text-xs pl-1.5 pr-0.5">
            <Filter className="w-3.5 h-3.5" />
          </div>
          {(['all', 'unread'] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer capitalize ${
                filterMode === mode
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {mode === 'all' ? `All (${notifications.length})` : `Unread (${unreadNotifs.length})`}
            </button>
          ))}
        </div>
      )}

      {/* Empty State */}
      {notifications.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-10 sm:p-14 text-center flex flex-col items-center justify-center min-h-[380px]">
          <div className="w-16 h-16 rounded-2xl bg-purple-600/15 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 shadow-lg shadow-purple-500/10">
            <Bell className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">No notifications</h3>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed">
            You're all caught up! Notifications appear here when tasks are submitted for review,
            corrections are requested, deadlines approach, or tasks are approved and completed.
          </p>
        </div>
      ) : displayed.length === 0 ? (
        /* Empty filtered state — no unread */
        <div className="rounded-2xl border-2 border-dashed border-slate-700/70 bg-[#0f173b]/40 p-10 text-center flex flex-col items-center justify-center min-h-[260px]">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3">
            <CheckCheck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No unread notifications</h3>
          <p className="mt-1 text-xs text-slate-400">
            Switch to "All" to view your full notification history.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayed.map((notif) => {
            const { label, cls } = getTypeLabel(notif.type, notif.id);
            return (
              <div
                key={notif.id}
                className={`group relative flex items-start gap-4 p-4 rounded-2xl border transition-all duration-200 ${
                  notif.read
                    ? 'bg-[#0b112c]/60 border-slate-800/60 opacity-70 hover:opacity-100 hover:border-slate-700/60'
                    : 'bg-[#0f173b]/90 border-slate-700/60 hover:border-purple-500/30 shadow-lg shadow-black/20'
                }`}
              >
                {/* Unread indicator dot */}
                {!notif.read && (
                  <span className="absolute top-4 right-4 w-2 h-2 rounded-full bg-purple-500 ring-2 ring-[#0f173b]" />
                )}

                {/* Icon */}
                {getNotifIcon(notif.type, notif.id)}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}>
                      {label}
                    </span>
                    {!notif.read && (
                      <span className="text-[10px] font-semibold text-purple-400">NEW</span>
                    )}
                  </div>
                  <h4
                    className={`text-sm font-semibold leading-snug ${
                      notif.read ? 'text-slate-300' : 'text-white'
                    }`}
                  >
                    {notif.title}
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">
                    {notif.message}
                  </p>
                  {notif.timestamp && (
                    <p className="mt-1.5 text-[10px] text-slate-600 font-mono">
                      {notif.timestamp}
                    </p>
                  )}
                </div>

                {/* Read / Unread toggle */}
                <button
                  type="button"
                  onClick={() => {
                    if (notif.read) {
                      onMarkUnread?.(notif.id);
                    } else {
                      onMarkRead?.(notif.id);
                    }
                  }}
                  title={notif.read ? 'Mark as unread' : 'Mark as read'}
                  className="mt-0.5 shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                >
                  {notif.read ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      {notifications.length > 0 && (
        <p className="text-[11px] text-slate-600 text-center pt-2">
          Notifications are generated from your workspace data and reset when the app session ends.
          Hover a notification to mark it read or unread.
        </p>
      )}
    </div>
  );
}
