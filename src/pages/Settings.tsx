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
import { Navigate } from 'react-router-dom';
import { Users, User } from 'lucide-react';
import { PartnerPairing } from '@/components/settings/PartnerPairing';
import { toast } from 'sonner';

export default function Settings() {
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Partner Mode
              </CardTitle>
              <CardDescription>
                Show joint account ownership percentages, partner-related columns, and budget scoping throughout the app.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="partner-mode" className="flex-1">
                  <span className="font-medium">Show partner mode</span>
                  <p className="text-sm text-muted-foreground mt-1">
                    When disabled, joint ownership details will be hidden from all pages.
                  </p>
                </Label>
                <Switch
                  id="partner-mode"
                  checked={showPartnerMode}
                  onCheckedChange={setShowPartnerMode}
                />
              </div>
            </CardContent>
          </Card>

          {showPartnerMode && <PartnerPairing />}
        </div>
      )}
    </AppLayout>
  );
}
