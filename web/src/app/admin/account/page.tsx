'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, Upload, UserRound } from 'lucide-react';
import { PageHeader, Panel } from '@/components/admin/Guard';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { formatTZS } from '@/lib/format';
import { can } from '@/lib/roles';
import { fetchAdmin, getSupabase } from '@/lib/supabase';
import { useDB, useMe, useToast } from '@/lib/store';

type WeeklyActivity = {
  period: { start: string; end: string };
  assigned_orders: number;
  delivered_orders: number;
  active_orders: number;
  status_updates: number;
};
type WeeklyCommission = {
  members: { team_member_id: string; sales_value_tzs: number; commission_tzs: number; bonus_tzs: number; total_tzs: number }[];
};

function AccountPage() {
  const me = useMe();
  const saveProfileName = useDB((state) => state.saveProfileName);
  const saveManagementProfile = useDB((state) => state.saveManagementProfile);
  const push = useToast((state) => state.push);
  const [name, setName] = useState(me?.name ?? '');
  const [phone, setPhone] = useState(me?.phone ?? '');
  const [age, setAge] = useState(me?.age?.toString() ?? '');
  const [jobTitle, setJobTitle] = useState(me?.jobTitle ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [avatarPath, setAvatarPath] = useState(me?.avatarPath ?? '');
  const [avatarUrl, setAvatarUrl] = useState(me?.avatarUrl ?? '');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [activity, setActivity] = useState<WeeklyActivity | null>(null);
  const [commission, setCommission] = useState<WeeklyCommission['members'][number] | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setName(me?.name ?? '');
    setPhone(me?.phone ?? '');
    setAge(me?.age?.toString() ?? '');
    setJobTitle(me?.jobTitle ?? '');
    setBio(me?.bio ?? '');
    setAvatarPath(me?.avatarPath ?? '');
    setAvatarUrl(me?.avatarUrl ?? '');
  }, [me]);

  useEffect(() => {
    if (!me) return;
    void fetchAdmin<WeeklyActivity>('/admin/management/my-activity').then(setActivity).catch((error: unknown) => {
      push(error instanceof Error ? error.message : 'Could not load your weekly activity.', 'bad');
    });
    if (can(me.role, 'management.view', me.permissions)) {
      void fetchAdmin<WeeklyCommission>('/admin/management/commission-summary').then((summary) => {
        setCommission(summary.members.find((entry) => entry.team_member_id === me.id) ?? null);
      }).catch((error: unknown) => {
        push(error instanceof Error ? error.message : 'Could not load commission details.', 'bad');
      });
    }
  }, [me, push]);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) {
      push('Enter a name with at least two characters.', 'bad');
      return;
    }
    setSavingProfile(true);
    try {
      await saveProfileName(name.trim());
      push('Your profile was updated.');
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not save your profile.', 'bad');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      push('Choose a password with at least 8 characters.', 'bad');
      return;
    }
    if (password !== confirmPassword) {
      push('The passwords do not match.', 'bad');
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setConfirmPassword('');
      push('Your password was changed.');
    } catch (error) {
      console.error('Could not change the signed-in team member password:', error);
      push(error instanceof Error ? error.message : 'Could not change your password.', 'bad');
    } finally {
      setSavingPassword(false);
    }
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      push('Choose a JPG, PNG or WebP photo smaller than 2 MB.', 'bad');
      return;
    }
    setUploadingPhoto(true);
    try {
      const signed = await fetchAdmin<{ path: string; token: string; public_url: string }>('/admin/management/my-avatar-upload', {
        method: 'POST',
        body: JSON.stringify({ content_type: file.type }),
      });
      const { error } = await getSupabase().storage.from('team-avatars')
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      setAvatarPath(signed.path);
      setAvatarUrl(signed.public_url);
      push('Profile photo uploaded. Save your profile to apply it.');
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not upload your profile photo.', 'bad');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function savePersonalDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAge = age.trim() ? Number(age) : null;
    if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 16 || parsedAge > 120)) {
      push('Enter an age from 16 to 120, or leave it blank.', 'bad');
      return;
    }
    setSavingProfile(true);
    try {
      await Promise.all([
        saveProfileName(name.trim()),
        saveManagementProfile({
          phone: phone.trim() || null,
          age: parsedAge,
          job_title: jobTitle.trim() || null,
          bio: bio.trim() || null,
          avatar_url: avatarPath || null,
        }),
      ]);
      push('Your personal details were updated.');
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not save your profile.', 'bad');
    } finally {
      setSavingProfile(false);
    }
  }

  if (!me) return null;

  return (
    <>
      <PageHeader title="My account" subtitle="Manage your personal profile, weekly activity and account security." />
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Personal details" subtitle="Your optional details are visible only to authorized team managers.">
          <form onSubmit={(event) => void savePersonalDetails(event)} className="space-y-4">
            <div className="flex items-center gap-4">
              {avatarUrl
                ? <img src={avatarUrl} alt="Your profile" className="h-16 w-16 rounded-2xl object-cover" />
                : <span className="grid h-16 w-16 place-items-center rounded-2xl bg-leaf-soft text-leaf"><UserRound size={28} /></span>}
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 font-bold hover:bg-milk">
                  <Upload size={17} />{uploadingPhoto ? 'Uploading…' : 'Upload photo'}
                </span>
                <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingPhoto} onChange={(event) => { void uploadPhoto(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                <span className="mt-1 block text-xs text-ink-mute">JPG, PNG or WebP · up to 2 MB</span>
              </label>
            </div>
            <Field label="Full name">
              <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} />
            </Field>
            <Field label="Email address">
              <Input value={me.email} readOnly aria-readonly="true" className="bg-milk" />
            </Field>
            <Field label="Phone number (optional)">
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Age (optional)">
                <Input type="number" min={16} max={120} value={age} onChange={(event) => setAge(event.target.value)} />
              </Field>
              <Field label="Job title (optional)">
                <Input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} maxLength={100} />
              </Field>
            </div>
            <Field label="About me (optional)">
              <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={1000} rows={3} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-ink outline-none focus:border-leaf" />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" icon={<UserRound size={19} />} disabled={savingProfile || uploadingPhoto}>
                {savingProfile ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </form>
        </Panel>

        <Panel title="Weekly activity" subtitle={activity ? `${new Date(activity.period.start).toLocaleDateString()} – ${new Date(activity.period.end).toLocaleDateString()} (UTC)` : 'Loading this week’s activity…'}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-milk p-4"><p className="text-sm text-ink-mute">Orders handled</p><p className="mt-1 text-2xl font-extrabold">{activity?.assigned_orders ?? '—'}</p></div>
            <div className="rounded-2xl bg-milk p-4"><p className="text-sm text-ink-mute">Delivered</p><p className="mt-1 text-2xl font-extrabold">{activity?.delivered_orders ?? '—'}</p></div>
            <div className="rounded-2xl bg-milk p-4"><p className="text-sm text-ink-mute">In progress</p><p className="mt-1 text-2xl font-extrabold">{activity?.active_orders ?? '—'}</p></div>
            <div className="rounded-2xl bg-milk p-4"><p className="text-sm text-ink-mute">Status updates</p><p className="mt-1 text-2xl font-extrabold">{activity?.status_updates ?? '—'}</p></div>
          </div>
          {commission && (
            <div className="mt-4 rounded-2xl bg-leaf-soft p-4">
              <p className="font-bold text-leaf-deep">Commission details</p>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <p>Sales <b className="block text-base">{formatTZS(commission.sales_value_tzs)}</b></p>
                <p>Commission <b className="block text-base">{formatTZS(commission.commission_tzs)}</b></p>
                <p>Bonus <b className="block text-base">{formatTZS(commission.bonus_tzs)}</b></p>
                <p>Total <b className="block text-base">{formatTZS(commission.total_tzs)}</b></p>
              </div>
            </div>
          )}
        </Panel>
        </div>

        <Panel title="Change password" subtitle="Use at least 8 characters and choose a password you have not used elsewhere.">
          <form onSubmit={(event) => void changePassword(event)} className="space-y-4">
            <Field label="New password">
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required className="pr-14" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-ink-soft hover:bg-leaf-soft">
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </Field>
            <Field label="Confirm new password">
              <div className="relative">
                <Input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required className="pr-14" />
                <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-ink-soft hover:bg-leaf-soft">
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </Field>
            <div className="flex justify-end">
              <Button type="submit" icon={<KeyRound size={19} />} disabled={savingPassword}>
                {savingPassword ? 'Updating…' : 'Change password'}
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </>
  );
}

export default function MyAccountPage() {
  return <AccountPage />;
}
