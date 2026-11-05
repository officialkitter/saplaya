'use client';

import { motion } from 'framer-motion';
import { Ban, Check, Minus, Pause, Play, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Guarded, PageHeader, Panel } from '@/components/admin/Guard';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { cn, initials } from '@/lib/format';
import { can, isFarmRole, PERM_ROWS, roleInfo } from '@/lib/roles';
import { canManageMember } from '@/lib/stats';
import { fetchAdmin } from '@/lib/supabase';
import { useDB, useScope, useToast } from '@/lib/store';
import type { DepartmentScope, MemberStatus, Perm, Role, TeamMember } from '@/lib/types';

const STATUS: Record<MemberStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-leaf-soft text-leaf-deep' },
  invited: { label: 'Invited', cls: 'bg-sun-soft text-[#8A5A00]' },
  suspended: { label: 'Paused', cls: 'bg-[#FFEBEE] text-[#B71C1C]' },
};

type RoleOption = { role_key: Role; name: string; department_id: string; scope: DepartmentScope; permissions: Perm[]; is_builtin: boolean };
type DepartmentOption = { id: string; name: string; description: string; theme_color: string };
type RoleConfigResponse = { roles: RoleOption[]; departments: DepartmentOption[]; can_manage_roles: boolean };

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function Team() {
  const { me, farmId, suppliers, team } = useScope();
  const inviteMember = useDB((s) => s.inviteMember);
  const setMemberStatus = useDB((s) => s.setMemberStatus);
  const push = useToast((s) => s.push);

  const [inviting, setInviting] = useState(false);
  const [pause, setPause] = useState<TeamMember | null>(null);
  const [form, setForm] = useState<{ name: string; email: string; role: Role; supplierId: string }>({ name: '', email: '', role: 'supplier_staff', supplierId: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [roleConfig, setRoleConfig] = useState<RoleConfigResponse | null>(null);
  const [configError, setConfigError] = useState('');
  const [departmentForm, setDepartmentForm] = useState({ name: '', description: '', theme_color: '#2E7D32' });
  const [roleForm, setRoleForm] = useState<{ name: string; department_id: string; scope: DepartmentScope; permissions: Perm[] }>({
    name: '', department_id: '', scope: 'platform', permissions: ['dashboard.view'],
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const departmentDashboardPerms: Perm[] = ['finance.view', 'marketing.view', 'stores.view', 'system.view'];
  const dashboardRequired = roleForm.permissions.some((permission) => departmentDashboardPerms.includes(permission));

  const reloadRoleConfig = useCallback(async () => {
    try {
      const result = await fetchAdmin<RoleConfigResponse>('/admin/role-config');
      setRoleConfig(result);
      setConfigError('');
      setRoleForm((current) => ({
        ...current,
        department_id: current.department_id || result.departments[0]?.id || '',
      }));
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : 'Could not load roles and departments.');
    }
  }, []);

  useEffect(() => {
    void reloadRoleConfig();
  }, [reloadRoleConfig]);

  const groups = useMemo(() => {
    const out: { title: string; members: TeamMember[] }[] = [];
    const platform = team.filter((t) => !t.supplierId);
    if (platform.length) out.push({ title: 'Saplaya team', members: platform });
    suppliers.forEach((s) => {
      const m = team.filter((t) => t.supplierId === s.id);
      if (m.length) out.push({ title: farmId ? 'Your farm team' : s.name, members: m });
    });
    return out;
  }, [team, suppliers, farmId]);

  if (!me) return null;
  const canInvite = can(me.role, 'team.manage', me.permissions);
  const options = roleConfig?.roles ?? [];

  function openInvite() {
    if (!options.length) {
      push(configError || 'No role with permissions you can assign is available.', 'bad');
      return;
    }
    setForm({ name: '', email: '', role: options[0].role_key, supplierId: me?.supplierId ?? suppliers[0]?.id ?? '' });
    setErrors({});
    setInviting(true);
  }

  async function send() {
    const err: Record<string, string> = {};
    if (form.name.trim().length < 2) err.name = 'Enter their name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) err.email = 'Check the email address.';
    const assignedRole = options.find((option) => option.role_key === form.role);
    if (!assignedRole) {
      setErrors({ role: 'Choose a role you are allowed to assign.' });
      return;
    }
    const farmRole = isFarmRole(form.role, assignedRole.scope);
    if (farmRole && !form.supplierId) err.supplierId = 'Choose a farm.';
    setErrors(err);
    if (Object.keys(err).length) return;
    const problem = await inviteMember({ name: form.name.trim(), email: form.email, role: form.role, supplierId: farmRole ? (me?.supplierId ?? form.supplierId) : null });
    if (problem) { setErrors({ email: problem }); return; }
    push(`Invitation sent to ${form.email.trim()}. They join as ${assignedRole.name}.`);
    setInviting(false);
  }

  async function createDepartment() {
    const id = slug(departmentForm.name).slice(0, 40);
    if (departmentForm.name.trim().length < 2 || id.length < 2) {
      push('Enter a department name with at least two letters or numbers.', 'bad');
      return;
    }
    setSavingConfig(true);
    try {
      await fetchAdmin('/admin/departments', {
        method: 'POST',
        body: JSON.stringify({ ...departmentForm, id }),
      });
      push(`${departmentForm.name.trim()} department was created.`);
      setDepartmentForm({ name: '', description: '', theme_color: '#2E7D32' });
      await reloadRoleConfig();
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not create this department.', 'bad');
    } finally {
      setSavingConfig(false);
    }
  }

  async function createRole() {
    const roleKey = slug(roleForm.name);
    if (roleForm.name.trim().length < 2 || roleKey.length < 2 || !roleForm.department_id || !roleForm.permissions.length) {
      push('Enter a role name, choose a department, and grant at least one permission.', 'bad');
      return;
    }
    setSavingConfig(true);
    try {
      await fetchAdmin('/admin/roles', {
        method: 'POST',
        body: JSON.stringify({ ...roleForm, role_key: roleKey }),
      });
      push(`${roleForm.name.trim()} role was created.`);
      setRoleForm((current) => ({ ...current, name: '', permissions: ['dashboard.view'] }));
      await reloadRoleConfig();
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not create this role.', 'bad');
    } finally {
      setSavingConfig(false);
    }
  }

  async function resumeMember(member: TeamMember) {
    try {
      await setMemberStatus(member.id, 'active');
      push(`${member.name} can sign in again.`);
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not update this team member.', 'bad');
    }
  }

  async function pauseMember() {
    if (!pause) return;
    try {
      await setMemberStatus(pause.id, 'suspended');
      push(`${pause.name} is paused.`, 'info');
      setPause(null);
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not pause this team member.', 'bad');
    }
  }

  const set = (k: 'name' | 'email') => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Team and roles"
        subtitle={farmId ? 'Add packers to your farm. Each person only does what their role allows.' : 'Everyone who works with Saplaya, and exactly what each role is allowed to do.'}
        actions={canInvite ? <Button icon={<UserPlus size={20} />} onClick={openInvite}>Invite someone</Button> : undefined}
      />

      <div className="space-y-6">
        {groups.map((g) => (
          <Panel key={g.title} title={g.title}>
            <ul className="divide-y divide-line">
              {g.members.map((m, i) => {
                const info = roleInfo(m.role, m.roleLabel, m.roleScope);
                const st = STATUS[m.status];
                const manage = canManageMember(me, m);
                return (
                  <motion.li key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-leaf-soft font-extrabold text-leaf-deep">{initials(m.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{m.name}{m.id === me.id && <span className="ml-2 text-sm font-semibold text-ink-mute">(you)</span>}</p>
                      <p className="truncate text-sm text-ink-mute">{m.email}</p>
                    </div>
                    <span className={cn('rounded-full px-3 py-1 text-sm font-bold', info.badge)}>{info.label}</span>
                    <span className="rounded-full bg-milk px-3 py-1 text-xs font-bold text-ink-soft">{m.department ?? info.scope}</span>
                    <span className={cn('rounded-full px-3 py-1 text-sm font-bold', st.cls)}>{st.label}</span>
                    {manage && (
                      <Button size="sm" variant={m.status === 'suspended' ? 'soft' : 'ghost'} icon={m.status === 'suspended' ? <Play size={16} /> : <Pause size={16} />} onClick={() => (m.status === 'suspended' ? void resumeMember(m) : setPause(m))}>
                        {m.status === 'suspended' ? 'Turn back on' : 'Pause'}
                      </Button>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          </Panel>
        ))}

        {roleConfig?.can_manage_roles && (
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Create a department" subtitle="Departments organize access and receive their own dashboard views.">
              <div className="space-y-3">
                <Field label="Department name"><Input value={departmentForm.name} onChange={(event) => setDepartmentForm((current) => ({ ...current, name: event.target.value }))} placeholder="Customer care" /></Field>
                <Field label="Description"><Input value={departmentForm.description} onChange={(event) => setDepartmentForm((current) => ({ ...current, description: event.target.value }))} placeholder="Customer support and service" /></Field>
                <Field label="Department theme">
                  <input type="color" value={departmentForm.theme_color} onChange={(event) => setDepartmentForm((current) => ({ ...current, theme_color: event.target.value }))} className="h-11 w-full rounded-xl border border-line bg-white p-1" />
                </Field>
                <Button disabled={savingConfig} onClick={() => { void createDepartment(); }}>Create department</Button>
              </div>
              {roleConfig.departments.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {roleConfig.departments.map((department) => (
                    <li key={department.id} className="rounded-full px-3 py-1.5 text-sm font-bold text-white" style={{ backgroundColor: department.theme_color }}>{department.name}</li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Create a configurable role" subtitle="A role can grant only permissions you already hold. Assigned users inherit its department dashboard and theme.">
              <div className="space-y-3">
                <Field label="Role name"><Input value={roleForm.name} onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))} placeholder="Customer care officer" /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Department">
                    <Select value={roleForm.department_id} onChange={(event) => setRoleForm((current) => ({ ...current, department_id: event.target.value }))}>
                      {roleConfig.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Account scope">
                    <Select value={roleForm.scope} onChange={(event) => setRoleForm((current) => ({ ...current, scope: event.target.value as DepartmentScope }))}>
                      <option value="platform">Saplaya platform</option>
                      <option value="farm">Farm</option>
                    </Select>
                  </Field>
                </div>
                <fieldset className="max-h-60 space-y-2 overflow-y-auto rounded-2xl border border-line p-3">
                  <legend className="px-1 text-sm font-bold">Permissions</legend>
                  {PERM_ROWS.filter((row) => me.permissions?.includes(row.perm)).map((row) => (
                    <label key={row.perm} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={roleForm.permissions.includes(row.perm)}
                        disabled={row.perm === 'dashboard.view' && dashboardRequired}
                        onChange={(event) => setRoleForm((current) => ({
                          ...current,
                          permissions: event.target.checked
                            ? [...new Set([
                              ...current.permissions,
                              row.perm,
                              ...(departmentDashboardPerms.includes(row.perm) ? ['dashboard.view' as Perm] : []),
                            ])]
                            : current.permissions.filter((permission) => permission !== row.perm),
                        }))}
                        className="mt-0.5 accent-leaf"
                      />
                      <span>{row.label}</span>
                    </label>
                  ))}
                </fieldset>
                {dashboardRequired && <p className="text-sm text-ink-mute">Department analytics require the home dashboard permission so the assigned person can open their dashboard.</p>}
                <Button disabled={savingConfig || !roleConfig.departments.length} onClick={() => { void createRole(); }}>Create role</Button>
              </div>
            </Panel>
          </div>
        )}

        {configError && <p role="alert" className="rounded-2xl bg-[#FFEBEE] p-4 font-semibold text-[#B71C1C]">{configError}</p>}

        <Panel title="Assignable role permissions" subtitle="Only roles whose permissions fit within your own access are shown. The system enforces these permissions on the server.">
          <div className="-mx-2 overflow-x-auto px-2">
            {options.length ? (
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white p-3" />
                    {options.map((role) => (
                      <th key={role.role_key} className="p-3 text-center align-bottom">
                        <span className={cn('inline-block rounded-full px-3 py-1 text-sm font-bold', 'bg-[#E3F2FD] text-[#0D47A1]', role.role_key === me.role && 'ring-2 ring-ink ring-offset-2')}>{role.name}</span>
                        <span className="mt-1 block text-xs font-medium text-ink-mute">{roleConfig?.departments.find((department) => department.id === role.department_id)?.name ?? role.department_id}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERM_ROWS.map((row) => (
                    <tr key={row.perm}>
                      <td className="sticky left-0 border-t border-line bg-white p-3 font-semibold">{row.label}</td>
                      {options.map((role) => (
                        <td key={role.role_key} className="border-t border-line p-3 text-center">
                          {role.permissions.includes(row.perm)
                            ? <span className="mx-auto grid h-8 w-8 place-items-center rounded-full bg-leaf text-white"><Check size={17} strokeWidth={3} /></span>
                            : <span className="mx-auto grid h-8 w-8 place-items-center rounded-full text-ink-mute/60"><Minus size={17} /></span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="p-3 text-sm text-ink-mute">No roles are available within your permission scope.</p>}
          </div>
        </Panel>

        <Panel title="Limits that always apply">
          <ul className="grid gap-3 md:grid-cols-2">
            {[
              'A farm can never see another farm’s orders, products, stock or team.',
              'Farms see a customer’s first name and delivery area only. Drivers and the Saplaya team see the phone number.',
              'Nobody can give someone a role above their own. Farm owners can only add farm packers.',
              'Even the Saplaya Owner cannot change a farm’s prices or stock. Farms control their own.',
              'Pausing a person or a farm blocks sign in straight away. Past orders and stock history stay.',
              'Every stock change is written to the stock history with who did it.',
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 rounded-2xl bg-milk p-4 text-[15px]">
                <Ban size={18} className="mt-0.5 shrink-0 text-sun-deep" />{t}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Modal open={inviting} onClose={() => setInviting(false)} title="Invite someone">
        <div className="space-y-4">
          <Field label="Full name" error={errors.name}><Input value={form.name} onChange={set('name')} /></Field>
          <Field label="Email" error={errors.email} hint="They get a link to set up their sign in."><Input type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Role" error={errors.role}>
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
              {options.map((r) => <option key={r.role_key} value={r.role_key}>{r.name} · {roleConfig?.departments.find((department) => department.id === r.department_id)?.name ?? r.department_id}</option>)}
            </Select>
          </Field>
          {!farmId && isFarmRole(form.role, options.find((role) => role.role_key === form.role)?.scope) && (
            <Field label="Which farm?" error={errors.supplierId}>
              <Select value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
          <div className="rounded-2xl bg-milk p-4 text-[15px]">
            <p className="font-bold">{options.find((role) => role.role_key === form.role)?.name ?? roleInfo(form.role).label}</p>
            <p className="mt-1 text-ink-soft">They will be assigned only the permissions granted by this role.</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {(options.find((role) => role.role_key === form.role)?.permissions ?? []).map((permission) => (
                <li key={permission} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold">{PERM_ROWS.find((row) => row.perm === permission)?.label ?? permission}</li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setInviting(false)}>Cancel</Button><Button onClick={send}>Send invitation</Button></div>
        </div>
      </Modal>

      <Modal open={!!pause} onClose={() => setPause(null)} title="Pause this person?">
        {pause && (
          <div className="space-y-4">
            <p className="text-lg text-ink-soft"><b className="text-ink">{pause.name}</b> will not be able to sign in until you turn them back on. Their past work stays in the history.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPause(null)}>Not now</Button>
              <Button variant="danger" onClick={() => { void pauseMember(); }}>Yes, pause</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function TeamPage() {
  return (
    <Guarded perm="team.view">
      <Team />
    </Guarded>
  );
}
