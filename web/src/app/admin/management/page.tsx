'use client';

import { Plus, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Guarded, PageHeader, Panel } from '@/components/admin/Guard';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Fields';
import { formatTZS } from '@/lib/format';
import { can } from '@/lib/roles';
import { fetchAdmin } from '@/lib/supabase';
import { useMe, useToast } from '@/lib/store';

type LocationOption = { code: string; name: string };

type Scope = {
  id?: string;
  country_code: string;
  country_name: string;
  region_code: string;
  region_name: string;
  district_code: string | null;
  district_name: string | null;
};
type ManagedMember = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  role_label: string;
  status: 'active' | 'invited' | 'suspended';
  phone: string | null;
  age: number | null;
  job_title: string | null;
  bio: string | null;
  avatar_url: string | null;
  operation_scope_mode: 'global' | 'restricted';
  operation_scopes: Scope[];
};
type CommissionPolicy = {
  margin_pool_pct: number;
  incentive_budget_pct: number;
  bonus_rate_pct: number;
  period: 'weekly';
  tiers: { id?: string; target_sales_tzs: number; commission_rate_pct: number }[];
};
type CommissionMember = {
  team_member_id: string;
  full_name: string;
  email: string;
  delivered_supplier_orders: number;
  sales_value_tzs: number;
  margin_pool_tzs: number;
  target_sales_tzs: number | null;
  commission_rate_pct: number;
  commission_tzs: number;
  bonus_tzs: number;
  total_tzs: number;
};
type CommissionSummary = {
  period: { start: string; end: string };
  tiers: CommissionPolicy['tiers'];
  members: CommissionMember[];
};
type AssignableOrder = {
  id: string;
  code: string;
  supplier_id: string;
  supplier_name: string;
  country_code: string;
  country_name: string;
  region_code: string;
  region_name: string;
  district_code: string;
  district_name: string;
  status: string;
  team_member_id: string | null;
  team_member_name: string | null;
};

function scopeFromMember(member: ManagedMember): Scope[] {
  return member.operation_scopes.map((scope) => ({ ...scope }));
}

function Management() {
  const me = useMe();
  const push = useToast((state) => state.push);
  const canManage = can(me?.role, 'management.manage', me?.permissions);
  const canView = can(me?.role, 'management.view', me?.permissions);
  const [policy, setPolicy] = useState<CommissionPolicy | null>(null);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [members, setMembers] = useState<ManagedMember[]>([]);
  const [orders, setOrders] = useState<AssignableOrder[]>([]);
  const [countries, setCountries] = useState<LocationOption[]>([]);
  const [regions, setRegions] = useState<LocationOption[]>([]);
  const [districts, setDistricts] = useState<LocationOption[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [draftProfile, setDraftProfile] = useState({
    phone: '',
    age: '',
    job_title: '',
    bio: '',
    operation_scope_mode: 'restricted' as 'global' | 'restricted',
  });
  const [draftScopes, setDraftScopes] = useState<Scope[]>([]);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [newScope, setNewScope] = useState({ country_code: '', region_code: '', region_name: '', district_code: '', district_name: '' });
  const [policyForm, setPolicyForm] = useState<CommissionPolicy>({
    margin_pool_pct: 10,
    incentive_budget_pct: 1,
    bonus_rate_pct: 0.1,
    period: 'weekly',
    tiers: [],
  });

  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null;
  const selectedCountry = countries.find((country) => country.code === newScope.country_code);
  const selectedRegion = regions.find((region) => region.code === newScope.region_code);

  useEffect(() => {
    let active = true;
    void fetchAdmin<LocationOption[]>('/locations/countries')
      .then((options) => { if (active) setCountries(options); })
      .catch((error: unknown) => push(error instanceof Error ? error.message : 'Could not load countries.', 'bad'));
    return () => { active = false; };
  }, [push]);

  useEffect(() => {
    let active = true;
    setRegions([]);
    setDistricts([]);
    if (!newScope.country_code) return () => { active = false; };
    void fetchAdmin<LocationOption[]>(`/locations/countries/${encodeURIComponent(newScope.country_code)}/regions`)
      .then((options) => { if (active) setRegions(options); })
      .catch((error: unknown) => push(error instanceof Error ? error.message : 'Could not load regions.', 'bad'));
    return () => { active = false; };
  }, [newScope.country_code, push]);

  useEffect(() => {
    let active = true;
    setDistricts([]);
    if (!newScope.country_code || !newScope.region_code) return () => { active = false; };
    void fetchAdmin<LocationOption[]>(`/locations/countries/${encodeURIComponent(newScope.country_code)}/regions/${encodeURIComponent(newScope.region_code)}/districts`)
      .then((options) => { if (active) setDistricts(options); })
      .catch((error: unknown) => push(error instanceof Error ? error.message : 'Could not load districts.', 'bad'));
    return () => { active = false; };
  }, [newScope.country_code, newScope.region_code, push]);

  const reload = useCallback(async () => {
    if (!canView) return;
    const [nextPolicy, nextSummary] = await Promise.all([
      fetchAdmin<CommissionPolicy>('/admin/management/commission-policy'),
      fetchAdmin<CommissionSummary>('/admin/management/commission-summary'),
    ]);
    setPolicy(nextPolicy);
    setPolicyForm({
      ...nextPolicy,
      tiers: nextPolicy.tiers.map((tier) => ({
        ...tier,
        target_sales_tzs: Number(tier.target_sales_tzs),
        commission_rate_pct: Number(tier.commission_rate_pct),
      })),
    });
    setSummary(nextSummary);
    if (canManage) {
      const [nextMembers, nextOrders] = await Promise.all([
        fetchAdmin<ManagedMember[]>('/admin/management/members'),
        fetchAdmin<AssignableOrder[]>('/admin/management/assignable-orders'),
      ]);
      setMembers(nextMembers);
      setOrders(nextOrders);
      setSelectedMemberId((current) => current || nextMembers[0]?.id || '');
    }
  }, [canManage, canView]);

  useEffect(() => {
    void reload().catch((error: unknown) => {
      push(error instanceof Error ? error.message : 'Could not load management information.', 'bad');
    });
  }, [reload, push]);

  useEffect(() => {
    if (!selectedMember) return;
    setDraftProfile({
      phone: selectedMember.phone ?? '',
      age: selectedMember.age?.toString() ?? '',
      job_title: selectedMember.job_title ?? '',
      bio: selectedMember.bio ?? '',
      operation_scope_mode: selectedMember.operation_scope_mode,
    });
    setDraftScopes(scopeFromMember(selectedMember));
  }, [selectedMember]);

  function addScope() {
    if (!selectedCountry || !newScope.region_code) {
      push('Choose a country and region first.', 'bad');
      return;
    }
    const selectedCity = districts.find((city) => city.code === newScope.district_code);
    const scope: Scope = {
      country_code: selectedCountry.code,
      country_name: selectedCountry.name,
      region_code: newScope.region_code,
      region_name: selectedRegion?.name ?? newScope.region_name.trim(),
      district_code: newScope.district_name.trim() ? (selectedCity?.code ?? newScope.district_code.trim()) : null,
      district_name: newScope.district_name.trim() || null,
    };
    if (draftScopes.some((entry) => (
      entry.country_code === scope.country_code
      && entry.region_code === scope.region_code
      && entry.district_code === scope.district_code
    ))) {
      push('That operation area is already on the list.', 'info');
      return;
    }
    setDraftScopes((current) => [...current, scope]);
    setNewScope((current) => ({ ...current, district_code: '', district_name: '' }));
  }

  async function saveMember() {
    if (!selectedMember) return;
    const age = draftProfile.age.trim() ? Number(draftProfile.age) : null;
    if (age !== null && (!Number.isInteger(age) || age < 16 || age > 120)) {
      push('Age must be between 16 and 120, or left blank.', 'bad');
      return;
    }
    if (draftProfile.operation_scope_mode === 'restricted' && !draftScopes.length) {
      push('Add at least one operation area for a restricted account.', 'bad');
      return;
    }
    setSavingMember(true);
    try {
      await fetchAdmin(`/admin/management/members/${encodeURIComponent(selectedMember.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...draftProfile,
          age,
          phone: draftProfile.phone.trim() || null,
          job_title: draftProfile.job_title.trim() || null,
          bio: draftProfile.bio.trim() || null,
          operation_scopes: draftProfile.operation_scope_mode === 'restricted' ? draftScopes : [],
        }),
      });
      push(`${selectedMember.full_name}’s profile and operation access were saved.`);
      await reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not save this team member.', 'bad');
    } finally {
      setSavingMember(false);
    }
  }

  async function savePolicy() {
    setSavingPolicy(true);
    try {
      await fetchAdmin('/admin/management/commission-policy', {
        method: 'PUT',
        body: JSON.stringify(policyForm),
      });
      push('Weekly commission targets and rates were saved.');
      await reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not save the commission policy.', 'bad');
    } finally {
      setSavingPolicy(false);
    }
  }

  async function assignOrder(order: AssignableOrder, teamMemberId: string) {
    setBusyOrderId(order.id);
    try {
      await fetchAdmin(`/admin/management/supplier-orders/${encodeURIComponent(order.id)}/assign`, {
        method: 'POST',
        body: JSON.stringify({ team_member_id: teamMemberId || null }),
      });
      push(teamMemberId ? `${order.code} was assigned.` : `${order.code} is unassigned.`);
      await reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not assign this order.', 'bad');
    } finally {
      setBusyOrderId(null);
    }
  }

  if (!me) return null;
  const showManagement = canManage;

  return (
    <>
      <PageHeader title="Management" subtitle="Employee activity, commission bundles, order ownership and regional access." />
      {showManagement && (
        <div className="space-y-6">
          <Panel title="Weekly commission policy" subtitle="Rates apply to the 10% sales margin pool, not directly to gross sales. Commission and bonus together cannot exceed the configured budget.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Sales margin pool (%)"><Input type="number" min={0} max={100} step={0.1} value={policyForm.margin_pool_pct} onChange={(event) => setPolicyForm((current) => ({ ...current, margin_pool_pct: Number(event.target.value) }))} /></Field>
              <Field label="Incentive budget (% of pool)"><Input type="number" min={0} max={1} step={0.1} value={policyForm.incentive_budget_pct} onChange={(event) => setPolicyForm((current) => ({ ...current, incentive_budget_pct: Number(event.target.value) }))} /></Field>
              <Field label="Bonus rate (% of pool)"><Input type="number" min={0} max={1} step={0.1} value={policyForm.bonus_rate_pct} onChange={(event) => setPolicyForm((current) => ({ ...current, bonus_rate_pct: Number(event.target.value) }))} /></Field>
            </div>
            <div className="mt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold">Delivered-sales target bundles</h3>
                  <p className="text-sm text-ink-mute">Weekly, Monday through Sunday UTC. Add targets before commission earnings can activate.</p>
                </div>
                <Button variant="soft" icon={<Plus size={18} />} onClick={() => setPolicyForm((current) => ({
                  ...current,
                  tiers: [...current.tiers, { target_sales_tzs: current.tiers.length ? current.tiers[current.tiers.length - 1].target_sales_tzs + 100_000 : 100_000, commission_rate_pct: current.tiers.length ? Math.min(0.5, current.tiers[current.tiers.length - 1].commission_rate_pct + 0.1) : 0.2 }],
                }))}>Add target tier</Button>
              </div>
              {policyForm.tiers.length === 0 && <p className="rounded-2xl bg-milk p-4 text-ink-soft">No commission targets are active. Add at least one weekly target tier.</p>}
              <div className="space-y-2">
                {policyForm.tiers.map((tier, index) => (
                  <div key={tier.id ?? index} className="grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Field label={`Tier ${index + 1} · weekly delivered sales target (TZS)`}>
                      <Input type="number" min={1} step={1000} value={tier.target_sales_tzs} onChange={(event) => setPolicyForm((current) => ({
                        ...current,
                        tiers: current.tiers.map((item, itemIndex) => itemIndex === index ? { ...item, target_sales_tzs: Number(event.target.value) } : item),
                      }))} />
                    </Field>
                    <Field label="Commission rate (% of margin pool)">
                      <Input type="number" min={0.2} max={0.5} step={0.1} value={tier.commission_rate_pct} onChange={(event) => setPolicyForm((current) => ({
                        ...current,
                        tiers: current.tiers.map((item, itemIndex) => itemIndex === index ? { ...item, commission_rate_pct: Number(event.target.value) } : item),
                      }))} />
                    </Field>
                    <Button className="self-end" variant="ghost" aria-label="Remove target tier" onClick={() => setPolicyForm((current) => ({ ...current, tiers: current.tiers.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={18} /></Button>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button icon={<Save size={18} />} disabled={savingPolicy} onClick={() => { void savePolicy(); }}>{savingPolicy ? 'Saving…' : 'Save commission policy'}</Button>
            </div>
          </Panel>

          <Panel title="Employee profiles and operation areas" subtitle="Country and administrative-region access is enforced by the API on farm and order lists and updates.">
            {members.length === 0 ? <p className="rounded-2xl bg-milk p-4 text-ink-soft">Invite employees and grant the “View employee activities and commission details” permission to manage their profiles here.</p> : (
              <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.75fr)_1.5fr]">
                <div className="space-y-2">
                  {members.map((member) => (
                    <button key={member.id} type="button" onClick={() => setSelectedMemberId(member.id)} className={`w-full rounded-2xl border p-3 text-left ${selectedMemberId === member.id ? 'border-leaf bg-leaf-soft' : 'border-line hover:bg-milk'}`}>
                      <span className="block font-bold">{member.full_name}</span>
                      <span className="block text-sm text-ink-mute">{member.job_title || member.role_label} · {member.status}</span>
                    </button>
                  ))}
                </div>
                {selectedMember && (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Phone (optional)"><Input value={draftProfile.phone} onChange={(event) => setDraftProfile((current) => ({ ...current, phone: event.target.value }))} /></Field>
                      <Field label="Age (optional)"><Input type="number" min={16} max={120} value={draftProfile.age} onChange={(event) => setDraftProfile((current) => ({ ...current, age: event.target.value }))} /></Field>
                      <Field label="Job title"><Input value={draftProfile.job_title} onChange={(event) => setDraftProfile((current) => ({ ...current, job_title: event.target.value }))} /></Field>
                      <Field label="Operation access">
                        <Select value={draftProfile.operation_scope_mode} onChange={(event) => setDraftProfile((current) => ({ ...current, operation_scope_mode: event.target.value as 'global' | 'restricted', ...(event.target.value === 'global' ? {} : {}) }))}>
                          <option value="restricted">Assigned countries and regions only</option>
                          {['platform_owner', 'administrator', 'platform_admin'].includes(me.role) && <option value="global">Global operations</option>}
                        </Select>
                      </Field>
                    </div>
                    <Field label="Profile summary"><textarea value={draftProfile.bio} onChange={(event) => setDraftProfile((current) => ({ ...current, bio: event.target.value }))} rows={2} maxLength={1000} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-ink outline-none focus:border-leaf" /></Field>
                    {draftProfile.operation_scope_mode === 'restricted' && (
                      <div className="space-y-3 rounded-2xl bg-milk p-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field label="Country">
                            <Select value={newScope.country_code} onChange={(event) => setNewScope({ country_code: event.target.value, region_code: '', region_name: '', district_code: '', district_name: '' })}>
                              <option value="">Choose country</option>
                              {countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
                            </Select>
                          </Field>
                          <Field label="Region / state">
                            {regions.length ? (
                              <Select value={newScope.region_code} onChange={(event) => {
                                const region = regions.find((entry) => entry.code === event.target.value);
                                setNewScope((current) => ({ ...current, region_code: event.target.value, region_name: region?.name ?? '', district_code: '', district_name: '' }));
                              }} disabled={!newScope.country_code}>
                                <option value="">Choose region/state</option>
                                {regions.map((region) => <option key={region.code} value={region.code}>{region.name}</option>)}
                              </Select>
                            ) : (
                              <Input value={newScope.region_name} placeholder="Enter region or state" disabled={!newScope.country_code} onChange={(event) => setNewScope((current) => ({
                                ...current,
                                region_name: event.target.value,
                                region_code: event.target.value.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, '-')
                                  || event.target.value.trim().toUpperCase(),
                                district_code: '',
                                district_name: '',
                              }))} />
                            )}
                          </Field>
                          <Field label="District / city (optional)">
                            {districts.length ? (
                              <Select value={newScope.district_code} onChange={(event) => {
                                const city = districts.find((entry) => entry.code === event.target.value);
                                setNewScope((current) => ({ ...current, district_code: event.target.value, district_name: city?.name ?? '' }));
                              }} disabled={!newScope.region_code}>
                                <option value="">Entire region/state</option>
                                {districts.map((district) => <option key={district.code} value={district.code}>{district.name}</option>)}
                              </Select>
                            ) : (
                              <Input value={newScope.district_name} placeholder="Enter district or city" disabled={!newScope.region_code} onChange={(event) => setNewScope((current) => ({ ...current, district_code: event.target.value, district_name: event.target.value }))} />
                            )}
                          </Field>
                        </div>
                        <Button variant="soft" icon={<Plus size={18} />} disabled={!selectedCountry || !newScope.region_code} onClick={addScope}>Add operation area</Button>
                        <ul className="flex flex-wrap gap-2">
                          {draftScopes.map((scope, index) => (
                            <li key={`${scope.country_code}-${scope.region_code}-${scope.district_code ?? 'all'}-${index}`} className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold">
                              {scope.country_name} · {scope.region_name}{scope.district_name ? ` · ${scope.district_name}` : ' · all districts'}
                              <button type="button" aria-label="Remove operation area" onClick={() => setDraftScopes((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex justify-end"><Button icon={<Save size={18} />} disabled={savingMember} onClick={() => { void saveMember(); }}>{savingMember ? 'Saving…' : 'Save employee profile and access'}</Button></div>
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Assign orders to sales officers" subtitle="Only delivered orders assigned to an employee count toward that employee’s weekly target.">
            {orders.length === 0 ? <p className="rounded-2xl bg-milk p-4 text-ink-soft">No active or recently delivered supplier orders are available to assign.</p> : (
              <div className="space-y-2">
                {orders.map((order) => {
                  const eligible = members.filter((member) => member.status === 'active' && (
                    member.operation_scope_mode === 'global'
                    || member.operation_scopes.some((scope) => scope.country_code === order.country_code
                      && scope.region_code === order.region_code
                      && (scope.district_code === null || scope.district_code === order.district_code))
                  ));
                  return (
                    <div key={order.id} className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <p className="font-bold">{order.code} · {order.supplier_name}</p>
                        <p className="text-sm text-ink-mute">{[order.country_name, order.region_name, order.district_name].filter(Boolean).join(' · ') || 'Farm location not set'} · {order.status.replace('_', ' ')}</p>
                      </div>
                      <Select value={order.team_member_id ?? ''} disabled={busyOrderId === order.id} onChange={(event) => { void assignOrder(order, event.target.value); }}>
                        <option value="">Unassigned</option>
                        {eligible.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      )}

      <Panel title="Weekly employee performance" subtitle={summary ? `${new Date(summary.period.start).toLocaleDateString()} – ${new Date(summary.period.end).toLocaleDateString()} (UTC)` : 'Loading weekly performance…'}>
        {summary?.members.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead><tr className="border-b border-line text-sm text-ink-mute"><th className="p-3">Employee</th><th className="p-3">Delivered orders</th><th className="p-3">Eligible sales</th><th className="p-3">Tier</th><th className="p-3">Commission</th><th className="p-3">Bonus</th><th className="p-3">Total</th></tr></thead>
              <tbody>{summary.members.map((member) => (
                <tr key={member.team_member_id} className="border-b border-line last:border-0">
                  <td className="p-3"><b>{member.full_name}</b><span className="block text-sm text-ink-mute">{member.email}</span></td>
                  <td className="p-3">{member.delivered_supplier_orders}</td>
                  <td className="p-3">{formatTZS(member.sales_value_tzs)}</td>
                  <td className="p-3">{member.target_sales_tzs ? `${formatTZS(member.target_sales_tzs)} · ${member.commission_rate_pct}%` : 'Not reached'}</td>
                  <td className="p-3">{formatTZS(member.commission_tzs)}</td>
                  <td className="p-3">{formatTZS(member.bonus_tzs)}</td>
                  <td className="p-3 font-extrabold">{formatTZS(member.total_tzs)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="rounded-2xl bg-milk p-4 text-ink-soft">No assigned delivered sales have been recorded for this week.</p>}
      </Panel>
      {policy && <p className="text-sm text-ink-mute">Commission is calculated from assigned, delivered supplier orders. The configured bonus activates only after the employee reaches a weekly target.</p>}
    </>
  );
}

export default function ManagementPage() {
  return (
    <Guarded perm="management.view">
      <Management />
    </Guarded>
  );
}
