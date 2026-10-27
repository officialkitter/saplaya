'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, UserRound } from 'lucide-react';
import { PageHeader, Panel } from '@/components/admin/Guard';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { useDB, useMe, useToast } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';

function AccountPage() {
  const me = useMe();
  const saveProfileName = useDB((state) => state.saveProfileName);
  const push = useToast((state) => state.push);
  const [name, setName] = useState(me?.name ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => setName(me?.name ?? ''), [me?.name]);

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

  if (!me) return null;

  return (
    <>
      <PageHeader title="My account" subtitle="Update your account name and password." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Personal details" subtitle="This name is shown to your team.">
          <form onSubmit={(event) => void saveName(event)} className="space-y-4">
            <Field label="Full name">
              <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} />
            </Field>
            <Field label="Email address">
              <Input value={me.email} readOnly aria-readonly="true" className="bg-milk" />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" icon={<UserRound size={19} />} disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </form>
        </Panel>

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
