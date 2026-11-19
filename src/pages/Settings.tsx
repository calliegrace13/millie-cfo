import {useModules} from '@/hooks/useModules';
import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Navigate, Link } from 'react-router-dom';
import { Users, User } from 'lucide-react';
import { PartnerPairing } from '@/components/settings/PartnerPairing';
import { toast } from 'sonner';

export default function Settings() {
 const {isEnabled}=useModules();
  const { user, loading: authLoading } = useAuth();
  const { showPartnerMode, setShowPartnerMode, loading } = useSettings();
  const [fullName, setFullName] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('full_name').eq('id', user.id).single().then(({ data }) => {
      if (data?.full_name) setFullName(data.full_name);
    });
  }, [user]);

  async function saveFullName() {
    if (!user) return;
    setSavingName(true);
    const { error } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', user.id);
    if (error) toast.error('Failed to update name');
    else toast.success('Name updated');
    setSavingName(false);
  }

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <AppLayout>
      <PageHeader title="Settings" description="Manage your preferences" />

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Loading settings...</div>
      ) : (
        <div className="space-y-6 max-w-2xl">
          {/* Profile Name */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Your Profile
              </CardTitle>
              <CardDescription>
                Your name is visible to your linked partner.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Input
                  placeholder="Your first name"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="max-w-xs"
                />
                <Button size="sm" onClick={saveFullName} disabled={savingName || !fullName.trim()}>
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card><CardHeader><CardTitle>Customize Millie</CardTitle><CardDescription>Choose a preset or individual modules. Your financial history stays intact.</CardDescription></CardHeader><CardContent><Button asChild><Link to="/customize">Customize your workspace</Link></Button></CardContent></Card>
          {isEnabled('household')&&<Card><CardHeader><CardTitle>Household finances</CardTitle><CardDescription>Manage your partner connection, dated splits, sharing, and monthly budgets in one place.</CardDescription></CardHeader><CardContent><Button asChild><Link to="/household">Open Household</Link></Button></CardContent></Card>}

        </div>
      )}
    </AppLayout>
  );
}

