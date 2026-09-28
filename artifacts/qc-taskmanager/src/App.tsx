import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Bell, CalendarClock, Check, CheckCircle2, ChevronDown, CircleDot, ClipboardCheck, Clock3, Database, Edit3, HardDrive, LayoutDashboard, ListFilter, Menu, MoreHorizontal, Pencil, Plus, RefreshCw, RotateCcw, Search, Server, ShieldCheck, SlidersHorizontal, Trash2, Wifi, X, Zap } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  getGetDashboardSummaryQueryKey,
  getGetSystemHealthQueryKey,
  getGetTaskQueryKey,
  getHealthCheckQueryKey,
  getListDueTasksQueryKey,
  getListTasksQueryKey,
  useCompleteTask,
  useCreateTask,
  useDeleteTask,
  useGetDashboardSummary,
  useGetSystemHealth,
  useGetTask,
  useHealthCheck,
  useListDueTasks,
  useListTasks,
  useRescheduleTask,
  useUpdateTask,
  type Task,
} from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type DialogMode = 'create' | 'edit' | 'reschedule';
type FilterStatus = 'all' | 'scheduled' | 'upcoming' | 'completed' | 'overdue';

const dateKey = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const todayKey = dateKey(new Date());
const formatTaskDate = (task: Task) => {
  const value = new Date(task.scheduledAt || `${task.scheduledDate}T${task.scheduledTime}`);
  if (Number.isNaN(value.getTime())) return task.scheduledDate;
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(value);
};
const formatTaskTime = (task: Task) => {
  const value = new Date(task.scheduledAt || `${task.scheduledDate}T${task.scheduledTime}`);
  if (Number.isNaN(value.getTime())) return task.scheduledTime;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(value);
};
const inputDate = (task?: Task | null) => task?.scheduledDate || dateKey(new Date());
const inputTime = (task?: Task | null) => task?.scheduledTime?.slice(0, 5) || '09:00';

function StatusPill({ status }: { status: Task['status'] }) {
  const config = {
    scheduled: { label: 'Scheduled', className: 'bg-[#e5f2ef] text-[#14645f] border-[#beded8]', dot: 'bg-[#2d9486]' },
    completed: { label: 'Completed', className: 'bg-[#eaf0ee] text-[#47605d] border-[#d1ded9]', dot: 'bg-[#6b8981]' },
    overdue: { label: 'Overdue', className: 'bg-[#f9e9df] text-[#9b4c2f] border-[#edc6b2]', dot: 'bg-[#cc6942]' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-[.04em] ${config.className}`} data-testid={`status-task-${status}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function MetricCard({ label, value, note, icon: Icon, tone, delay }: { label: string; value: number; note: string; icon: typeof ClipboardCheck; tone: 'teal' | 'amber' | 'coral' | 'slate'; delay: string }) {
  const tones = {
    teal: 'bg-[#e7f2ef] text-[#17766d]',
    amber: 'bg-[#fbf0d6] text-[#9a681d]',
    coral: 'bg-[#f9e8df] text-[#a55739]',
    slate: 'bg-[#e9edf0] text-[#4c6870]',
  };
  return (
    <article className={`animate-rise ${delay} control-shadow rounded-xl border border-card-border bg-card p-4`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="flex items-start justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}><Icon className="h-[18px] w-[18px]" /></div>
        <span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">24h</span>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <strong className="font-mono text-[28px] font-medium leading-none tracking-[-.08em] text-foreground">{value}</strong>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{note}</p>
    </article>
  );
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[#cbd5d1] bg-[#f7f8f5] px-6 text-center" data-testid="empty-state">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#e4efec] text-primary"><ClipboardCheck className="h-5 w-5" /></div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function TaskRow({ task, onEdit, onReschedule, onComplete, onDelete }: { task: Task; onEdit: (task: Task) => void; onReschedule: (task: Task) => void; onComplete: (task: Task) => void; onDelete: (task: Task) => void }) {
  return (
    <div className="group flex items-center gap-3 border-b border-border/70 px-4 py-3.5 transition-colors last:border-0 hover:bg-[#f6f8f5]" data-testid={`row-task-${task.id}`}>
      <button type="button" disabled={task.status === 'completed'} onClick={() => onComplete(task)} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all ${task.status === 'completed' ? 'border-[#87a99e] bg-[#dcebe7] text-[#27756a]' : 'border-[#b9c7c2] text-transparent hover:border-primary hover:bg-[#e8f3f0] hover:text-primary'}`} aria-label={task.status === 'completed' ? 'Completed task' : 'Complete task'} data-testid={`button-complete-task-${task.id}`}>
        <Check className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[13px] font-semibold ${task.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'}`} data-testid={`text-task-description-${task.id}`}>{task.description}</p>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />{formatTaskDate(task)}</span>
          <span className="text-border">·</span>
          <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatTaskTime(task)}</span>
        </div>
      </div>
      <StatusPill status={task.status} />
      <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
        {task.status !== 'completed' && <button type="button" onClick={() => onReschedule(task)} className="rounded-md p-2 text-muted-foreground hover:bg-[#e9f0ee] hover:text-primary" aria-label="Reschedule task" data-testid={`button-reschedule-task-${task.id}`}><RotateCcw className="h-3.5 w-3.5" /></button>}
        <button type="button" onClick={() => onEdit(task)} className="rounded-md p-2 text-muted-foreground hover:bg-[#e9f0ee] hover:text-primary" aria-label="Edit task" data-testid={`button-edit-task-${task.id}`}><Pencil className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => onDelete(task)} className="rounded-md p-2 text-muted-foreground hover:bg-[#f9e9e4] hover:text-destructive" aria-label="Delete task" data-testid={`button-delete-task-${task.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

function TaskDialog({ open, mode, task, onOpenChange, onSubmit, pending }: { open: boolean; mode: DialogMode; task?: Task | null; onOpenChange: (open: boolean) => void; onSubmit: (values: { description: string; scheduledDate: string; scheduledTime: string }) => void; pending: boolean }) {
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState(dateKey(new Date()));
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [touched, setTouched] = useState(false);
  const selectedId = task?.id ?? 0;
  const { data: fetchedTask } = useGetTask(selectedId, { query: { enabled: open && mode !== 'create' && selectedId > 0, queryKey: getGetTaskQueryKey(selectedId) } });

  useEffect(() => {
    if (!open) return;
    const source = fetchedTask ?? task;
    setDescription(source?.description ?? '');
    setScheduledDate(inputDate(source));
    setScheduledTime(inputTime(source));
    setTouched(false);
  }, [open, fetchedTask, task]);

  const isCreate = mode === 'create';
  const isReschedule = mode === 'reschedule';
  const title = isCreate ? 'Schedule a task' : isReschedule ? 'Move task window' : 'Edit task';
  const submitLabel = isCreate ? 'Add to schedule' : isReschedule ? 'Confirm new time' : 'Save changes';
  const valid = description.trim().length > 0 && scheduledDate.length > 0 && scheduledTime.length > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] border-[#d9e0dc] bg-[#fbfcf9] p-0">
        <DialogHeader className="border-b border-border bg-[#f3f6f2] px-6 py-5 text-left">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-accent" />Task control</div>
          <DialogTitle className="mt-2 text-xl tracking-[-.03em]">{title}</DialogTitle>
          <DialogDescription>{isReschedule ? 'Set a new operating window. The task will remain in its current queue.' : isCreate ? 'Create a clear next action for the quality-control queue.' : 'Keep the task record current for the whole team.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); setTouched(true); if (valid) onSubmit({ description: description.trim(), scheduledDate, scheduledTime }); }} className="space-y-5 p-6">
          {!isReschedule && <div className="space-y-2"><label htmlFor="task-description" className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">Task description</label><Textarea id="task-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Verify batch 24-B label placement" className="min-h-[92px] resize-none border-[#d3ddd8] bg-white text-sm focus-visible:ring-primary" data-testid="input-task-description" />{touched && !description.trim() && <p className="text-xs text-destructive" data-testid="validation-description">A description is required.</p>}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><label htmlFor="task-date" className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">Date</label><Input id="task-date" type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className="border-[#d3ddd8] bg-white text-sm" data-testid="input-task-date" /></div>
            <div className="space-y-2"><label htmlFor="task-time" className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">Time</label><Input id="task-time" type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} className="border-[#d3ddd8] bg-white text-sm" data-testid="input-task-time" /></div>
          </div>
          {touched && (!scheduledDate || !scheduledTime) && <p className="text-xs text-destructive" data-testid="validation-schedule">Date and time are required.</p>}
          <DialogFooter className="gap-2 border-t border-border pt-5">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-cancel-task">Cancel</Button>
            <Button type="submit" disabled={pending || !valid} data-testid="button-submit-task">{pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ task, pending, onOpenChange, onConfirm }: { task?: Task | null; pending: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={Boolean(task)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[410px] border-[#ead5cd] bg-[#fffaf8]">
        <DialogHeader className="text-left"><div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#f9e7df] text-destructive"><Trash2 className="h-5 w-5" /></div><DialogTitle>Remove this task?</DialogTitle><DialogDescription>This will permanently remove “{task?.description}” from the schedule. This action cannot be undone.</DialogDescription></DialogHeader>
        <DialogFooter className="gap-2 pt-3"><Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-cancel-delete">Keep task</Button><Button variant="destructive" onClick={onConfirm} disabled={pending} data-testid="button-confirm-delete">{pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Remove task</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HealthPanel({ onRetry }: { onRetry: () => void }) {
  const health = useHealthCheck();
  const system = useGetSystemHealth();
  const systemData = system.data;
  const online = systemData?.status === 'online' || health.data?.status === 'ok' || health.data?.status === 'healthy';
  const loading = health.isLoading || system.isLoading;
  return (
    <section className="control-shadow overflow-hidden rounded-xl border border-card-border bg-card" data-testid="system-health-panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="text-sm font-bold">System health</h2></div><button type="button" onClick={onRetry} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary" aria-label="Refresh system health" data-testid="button-refresh-health"><RefreshCw className="h-3.5 w-3.5" /></button></div>
      {loading ? <div className="space-y-3 p-4"><SkeletonBlock className="h-7 w-32" /><SkeletonBlock className="h-4 w-full" /><SkeletonBlock className="h-4 w-4/5" /></div> : system.isError && health.isError ? <div className="p-4" data-testid="health-error"><div className="flex gap-2 text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /><p className="text-xs font-semibold">Health endpoint unavailable</p></div><p className="mt-2 text-xs leading-5 text-muted-foreground">The dashboard is showing the last known queue state.</p><Button onClick={onRetry} variant="outline" size="sm" className="mt-3" data-testid="button-retry-health">Retry connection</Button></div> : <div className="p-4"><div className="flex items-center gap-2"><span className={`health-line h-2 w-2 rounded-full ${online ? 'bg-[#37a28d]' : 'bg-[#d06a49]'}`} /><span className={`text-xs font-bold ${online ? 'text-[#247668]' : 'text-destructive'}`} data-testid="status-system">{online ? 'Operational' : 'Offline'}</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">{systemData?.responseDurationMs ? `${systemData.responseDurationMs}ms` : '—'}</span></div><div className="mt-4 space-y-2.5"><HealthLine icon={Zap} label="Scheduler" value={systemData?.scheduler === 'running' ? 'Running' : 'Stopped'} good={systemData?.scheduler === 'running'} /><HealthLine icon={Database} label="Database" value={systemData?.database === 'connected' ? 'Connected' : 'Disconnected'} good={systemData?.database === 'connected'} /><HealthLine icon={Server} label="Last endpoint" value={systemData?.lastEndpoint || '/api/tasks'} good={Boolean(systemData?.lastEndpoint)} mono /></div><div className="mt-4 border-t border-border pt-3 font-mono text-[10px] text-muted-foreground">Last checked {systemData?.lastResponseAt ? new Date(systemData.lastResponseAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'just now'}</div></div>}
    </section>
  );
}

function HealthLine({ icon: Icon, label, value, good, mono }: { icon: typeof Zap; label: string; value: string; good: boolean; mono?: boolean }) {
  return <div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">{label}</span><span className={`ml-auto max-w-[130px] truncate text-right text-xs font-semibold ${good ? 'text-foreground' : 'text-destructive'} ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</span></div>;
}

function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);
  const [acknowledged, setAcknowledged] = useState<number[]>([]);
  const [mobileNav, setMobileNav] = useState(false);

  const taskParams = useMemo(() => ({ status: status === 'all' ? undefined : status, search: search.trim() || undefined, limit: 100 }), [status, search]);
  const tasksQuery = useListTasks(taskParams);
  const dueQuery = useListDueTasks();
  const summaryQuery = useGetDashboardSummary();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();
  const completeTask = useCompleteTask();
  const rescheduleTask = useRescheduleTask();
  const summary = summaryQuery.data;
  const tasks = tasksQuery.data ?? [];
  const dueTasks = (dueQuery.data ?? []).filter((task) => !acknowledged.includes(task.id));
  const counts = { scheduled: summary?.scheduled ?? tasks.filter((task) => task.status === 'scheduled').length, completed: summary?.completed ?? tasks.filter((task) => task.status === 'completed').length, overdue: summary?.overdue ?? tasks.filter((task) => task.status === 'overdue').length, dueSoon: summary?.dueSoon ?? dueTasks.length };

  const invalidate = async (id?: number) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListDueTasksQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetSystemHealthQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getHealthCheckQueryKey() }),
      ...(id ? [queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(id) })] : []),
    ]);
  };
  const notifyError = () => toast({ title: 'Action could not be completed', description: 'Check the connection and try again.' });
  const handleMutationSuccess = (message: string, id?: number) => { void invalidate(id); toast({ title: message, description: 'The queue has been refreshed.' }); setDialogMode(null); setSelectedTask(null); setDeleteTask(null); };

  const submitTask = (values: { description: string; scheduledDate: string; scheduledTime: string }) => {
    if (dialogMode === 'create') createTask.mutate({ data: values }, { onSuccess: () => handleMutationSuccess('Task added to schedule'), onError: notifyError });
    else if (dialogMode === 'edit' && selectedTask) updateTask.mutate({ id: selectedTask.id, data: values }, { onSuccess: (result) => handleMutationSuccess('Task changes saved', result.id), onError: notifyError });
    else if (dialogMode === 'reschedule' && selectedTask) rescheduleTask.mutate({ id: selectedTask.id, data: { scheduledDate: values.scheduledDate, scheduledTime: values.scheduledTime } }, { onSuccess: (result) => handleMutationSuccess('Task rescheduled', result.id), onError: notifyError });
  };
  const openTaskDialog = (mode: DialogMode, task?: Task) => { setSelectedTask(task ?? null); setDialogMode(mode); };
  const performComplete = (task: Task) => completeTask.mutate({ id: task.id }, { onSuccess: (result) => handleMutationSuccess('Task marked complete', result.id), onError: notifyError });
  const performDelete = () => { if (!deleteTask) return; deleteTaskMutation.mutate({ id: deleteTask.id }, { onSuccess: () => handleMutationSuccess('Task removed'), onError: notifyError }); };
  const retryAll = () => { void Promise.all([tasksQuery.refetch(), dueQuery.refetch(), summaryQuery.refetch()]); };
  const anyPending = createTask.isPending || updateTask.isPending || rescheduleTask.isPending;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`} data-testid="sidebar">
        <div className="flex h-[78px] items-center gap-3 border-b border-sidebar-border px-6"><div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><CircleDot className="h-5 w-5" /><span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent" /></div><div><div className="text-sm font-extrabold tracking-[-.02em]">QC / TaskManager</div><div className="mt-0.5 font-mono text-[9px] uppercase tracking-[.16em] text-sidebar-foreground/55">Operations console</div></div></div>
        <nav className="flex-1 px-3 py-7"><div className="px-3 pb-2 font-mono text-[9px] uppercase tracking-[.2em] text-sidebar-foreground/45">Workspace</div><button type="button" className="flex w-full items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-2.5 text-left text-sm font-bold text-sidebar-accent-foreground" data-testid="nav-dashboard"><LayoutDashboard className="h-4 w-4 text-sidebar-primary" />Control room<span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" /></button><div className="mt-8 px-3 pb-2 font-mono text-[9px] uppercase tracking-[.2em] text-sidebar-foreground/45">Queue view</div><button type="button" onClick={() => setStatus('scheduled')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="nav-scheduled"><Clock3 className="h-4 w-4" />Scheduled<span className="ml-auto rounded bg-sidebar-border px-1.5 py-0.5 font-mono text-[10px]">{counts.scheduled}</span></button><button type="button" onClick={() => setStatus('overdue')} className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="nav-overdue"><AlertCircle className="h-4 w-4" />Needs attention<span className="ml-auto rounded bg-[#9d563e]/30 px-1.5 py-0.5 font-mono text-[10px] text-[#efb29d]">{counts.overdue}</span></button><button type="button" onClick={() => setStatus('completed')} className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="nav-completed"><CheckCircle2 className="h-4 w-4" />Completed<span className="ml-auto rounded bg-sidebar-border px-1.5 py-0.5 font-mono text-[10px]">{counts.completed}</span></button></nav>
        <div className="border-t border-sidebar-border p-5"><div className="flex items-center gap-2 text-[11px] text-sidebar-foreground/65"><Wifi className="h-3.5 w-3.5 text-sidebar-primary" />Live connection<span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" /></div><div className="mt-3 font-mono text-[9px] uppercase tracking-[.16em] text-sidebar-foreground/35">QC-OPS / v1.4.0</div></div>
      </aside>
      {mobileNav && <button type="button" className="fixed inset-0 z-30 bg-[#15222a]/45 lg:hidden" onClick={() => setMobileNav(false)} aria-label="Close navigation" data-testid="button-close-navigation" />}
      <main className="min-h-[100dvh] lg:ml-[248px]">
        <header className="sticky top-0 z-20 flex h-[78px] items-center justify-between border-b border-border/80 bg-background/95 px-5 backdrop-blur md:px-8"><div className="flex items-center gap-3"><button type="button" className="rounded-md p-2 hover:bg-muted lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu className="h-5 w-5" /></button><div><div className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Monday / 08:42 local</div><h1 className="mt-1 text-lg font-extrabold tracking-[-.04em]">Control room</h1></div></div><div className="flex items-center gap-2 md:gap-4"><div className="hidden items-center gap-2 rounded-full border border-[#cfe1dc] bg-[#edf6f2] px-3 py-1.5 text-[11px] font-bold text-[#2c7167] sm:flex" data-testid="status-live"><span className="h-1.5 w-1.5 rounded-full bg-[#35a58f]" />All systems nominal</div><button type="button" className="relative rounded-lg border border-border bg-card p-2 text-muted-foreground hover:border-primary hover:text-primary" aria-label="View due reminders" data-testid="button-notifications"><Bell className="h-4 w-4" />{dueTasks.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[9px] font-bold text-accent-foreground">{dueTasks.length}</span>}</button><div className="hidden h-8 w-px bg-border sm:block" /><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d9e9e5] text-xs font-extrabold text-primary">MC</div><div className="hidden leading-tight sm:block"><div className="text-xs font-bold">Maya Chen</div><div className="text-[10px] text-muted-foreground">Shift lead</div></div><ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" /></div></div></header>
        <div className="grid-fade min-h-[calc(100dvh-78px)] px-5 py-6 md:px-8 md:py-8"><div className="mx-auto max-w-[1450px]">
          <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-primary"><span className="h-px w-6 bg-primary" />Shift overview</div><h2 className="text-[30px] font-extrabold leading-none tracking-[-.055em] md:text-[36px]">Keep the line moving.</h2><p className="mt-2 text-sm text-muted-foreground">The next right action, without the noise.</p></div><Button onClick={() => openTaskDialog('create')} className="w-full shadow-sm sm:w-auto" data-testid="button-create-task"><Plus className="h-4 w-4" />Schedule task</Button></div>
          {summaryQuery.isError && <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-[#edc9bb] bg-[#fff6f1] px-4 py-3 text-sm text-[#984c34]" data-testid="summary-error"><div className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />Summary is taking longer than usual. Showing live queue counts.</div><Button variant="outline" size="sm" onClick={() => summaryQuery.refetch()} data-testid="button-retry-summary">Retry</Button></div>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard label="scheduled" value={counts.scheduled} note="Active in the queue" icon={ClipboardCheck} tone="teal" delay="animate-rise-1" /><MetricCard label="due soon" value={counts.dueSoon} note="Needs a look this hour" icon={Bell} tone="amber" delay="animate-rise-2" /><MetricCard label="overdue" value={counts.overdue} note={counts.overdue ? 'Requires attention' : 'Nothing waiting'} icon={AlertCircle} tone="coral" delay="animate-rise-3" /><MetricCard label="completed" value={counts.completed} note="Closed in the current window" icon={CheckCircle2} tone="slate" delay="animate-rise-4" /></div>
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
              <section className="control-shadow overflow-hidden rounded-xl border border-card-border bg-card" data-testid="task-queue"><div className="flex flex-col gap-4 border-b border-border px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5"><div><div className="flex items-center gap-2"><ListFilter className="h-4 w-4 text-primary" /><h2 className="text-sm font-bold">Task queue</h2><span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{tasks.length}</span></div><p className="mt-1 pl-6 text-[11px] text-muted-foreground">Every action has an owner: the next one is yours.</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1 sm:w-[220px]"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search queue" className="h-9 border-[#d3ddd8] bg-[#fbfcfa] pl-9 text-xs" aria-label="Search tasks" data-testid="input-search-tasks" />{search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search" data-testid="button-clear-search"><X className="h-3.5 w-3.5" /></button>}</div><div className="flex items-center gap-1 rounded-lg border border-border bg-[#f5f7f4] p-1" data-testid="task-filters">{(['all', 'scheduled', 'upcoming', 'overdue', 'completed'] as FilterStatus[]).map((option) => <button key={option} type="button" onClick={() => setStatus(option)} className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold capitalize transition-colors ${status === option ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} data-testid={`button-filter-${option}`}>{option === 'all' ? 'All' : option}</button>)}</div></div></div>
                {tasksQuery.isLoading ? <div className="space-y-4 p-5">{[1, 2, 3, 4].map((row) => <div key={row} className="flex items-center gap-3"><SkeletonBlock className="h-7 w-7 rounded-full" /><div className="flex-1 space-y-2"><SkeletonBlock className="h-3 w-3/5" /><SkeletonBlock className="h-2.5 w-2/5" /></div><SkeletonBlock className="h-6 w-20 rounded-full" /></div>)}</div> : tasksQuery.isError ? <div className="p-5"><div className="rounded-lg border border-[#e9cec3] bg-[#fff7f3] p-5"><div className="flex items-center gap-2 text-sm font-bold text-[#984c34]"><AlertCircle className="h-4 w-4" />Queue unavailable</div><p className="mt-1 text-xs text-muted-foreground">We could not retrieve the current task list.</p><Button onClick={() => tasksQuery.refetch()} variant="outline" size="sm" className="mt-3" data-testid="button-retry-tasks">Try again</Button></div></div> : tasks.length === 0 ? <div className="p-5"><EmptyState title={search || status !== 'all' ? 'No matching tasks' : 'The queue is clear'} description={search || status !== 'all' ? 'Adjust the filter or search phrase to see more work.' : 'A quiet queue is a good queue. Add the next control point when ready.'} action={!search && status === 'all' ? <Button size="sm" onClick={() => openTaskDialog('create')} data-testid="button-empty-create"><Plus className="h-4 w-4" />Schedule first task</Button> : undefined} /></div> : <div>{tasks.map((task) => <TaskRow key={task.id} task={task} onEdit={(item) => openTaskDialog('edit', item)} onReschedule={(item) => openTaskDialog('reschedule', item)} onComplete={performComplete} onDelete={setDeleteTask} />)}</div>}
              </section>
              <section className="control-shadow rounded-xl border border-card-border bg-card" data-testid="recently-completed"><div className="flex items-center justify-between border-b border-border px-4 py-3.5 md:px-5"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><h2 className="text-sm font-bold">Recently completed</h2></div><span className="font-mono text-[10px] text-muted-foreground">LATEST CLOSES</span></div>{(summary?.recentlyCompleted ?? tasks.filter((task) => task.status === 'completed').slice(0, 3)).length === 0 ? <div className="p-5"><EmptyState title="No completed work yet" description="Closed tasks will settle here once the shift gets moving." /></div> : <div>{(summary?.recentlyCompleted ?? tasks.filter((task) => task.status === 'completed').slice(0, 3)).slice(0, 3).map((task) => <div key={task.id} className="flex items-center gap-3 border-b border-border/70 px-4 py-3 last:border-0 md:px-5" data-testid={`recent-task-${task.id}`}><div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e2eee9] text-primary"><Check className="h-3.5 w-3.5" /></div><p className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">{task.description}</p><span className="font-mono text-[10px] text-muted-foreground">{task.completedAt ? new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'closed'}</span></div>)}</div>}</section>
            </div>
            <aside className="space-y-6">
              <section className="control-shadow overflow-hidden rounded-xl border border-[#ecd8a9] bg-[#fffaf0]" data-testid="due-reminders"><div className="flex items-center justify-between border-b border-[#efdfba] px-4 py-3.5"><div className="flex items-center gap-2"><Bell className="h-4 w-4 text-[#a57421]" /><h2 className="text-sm font-bold text-[#684d21]">Due reminders</h2></div><span className="rounded-full bg-[#f5e3b3] px-2 py-0.5 font-mono text-[10px] font-bold text-[#8b641e]">{dueTasks.length}</span></div>{dueQuery.isLoading ? <div className="space-y-3 p-4"><SkeletonBlock className="h-12 w-full" /><SkeletonBlock className="h-12 w-full" /></div> : dueQuery.isError ? <div className="p-4"><p className="text-xs text-[#8b642a]">Reminder service is unavailable.</p><Button variant="outline" size="sm" onClick={() => dueQuery.refetch()} className="mt-3 border-[#e5cd91]" data-testid="button-retry-reminders">Retry reminders</Button></div> : dueTasks.length === 0 ? <div className="px-4 py-7 text-center"><div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[#f7eacb] text-[#a57421]"><Check className="h-4 w-4" /></div><p className="mt-3 text-xs font-bold text-[#684d21]">No reminders waiting</p><p className="mt-1 text-[11px] text-[#9c8350]">You are caught up for now.</p></div> : <div>{dueTasks.slice(0, 4).map((task) => <div key={task.id} className="border-b border-[#efdfba] p-4 last:border-0" data-testid={`reminder-task-${task.id}`}><div className="flex items-start gap-2"><div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d38b26]" /><p className="text-xs font-bold leading-5 text-[#684d21]">{task.description}</p></div><div className="mt-2 flex items-center justify-between pl-3.5"><span className="font-mono text-[10px] text-[#9c8350]">{formatTaskTime(task)} · {formatTaskDate(task)}</span><button type="button" onClick={() => setAcknowledged((current) => [...current, task.id])} className="text-[10px] font-bold text-[#a57421] underline-offset-2 hover:underline" data-testid={`button-acknowledge-${task.id}`}>Acknowledge</button></div></div>)}</div>}</section>
              <HealthPanel onRetry={() => { void Promise.all([queryClient.invalidateQueries({ queryKey: getGetSystemHealthQueryKey() }), queryClient.invalidateQueries({ queryKey: getHealthCheckQueryKey() })]); }} />
              <section className="rounded-xl border border-border bg-[#eef3f0] p-4" data-testid="shift-note"><div className="flex items-center gap-2 text-primary"><Zap className="h-4 w-4" /><span className="font-mono text-[10px] font-bold uppercase tracking-[.14em]">Shift note</span></div><p className="mt-3 text-sm font-semibold leading-6 text-[#365650]">“Close the loop before opening the next one.”</p><p className="mt-2 text-[11px] leading-5 text-muted-foreground">A simple handoff is a reliable handoff. Keep descriptions specific and time windows honest.</p></section>
            </aside>
          </div>
        </div></div>
      </main>
      <TaskDialog open={Boolean(dialogMode)} mode={dialogMode ?? 'create'} task={selectedTask} onOpenChange={(open) => { if (!open) { setDialogMode(null); setSelectedTask(null); } }} onSubmit={submitTask} pending={anyPending} />
      <DeleteDialog task={deleteTask} pending={deleteTaskMutation.isPending} onOpenChange={(open) => { if (!open) setDeleteTask(null); }} onConfirm={performDelete} />
    </div>
  );
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Dashboard} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;