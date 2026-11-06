import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { usePartnerLink } from '@/hooks/usePartnerLink';
import { toast } from 'sonner';
import { Copy, Link2, Unlink, UserPlus, Loader2, CheckCircle2 } from 'lucide-react';

export function PartnerPairing() {
  const { partnerLink, partnerEmail, loading, generateCode, redeemCode, unlinkPartner } = usePartnerLink();
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const code = await generateCode();
      if (code) toast.success(`Your pairing code is: ${code}`);
    } catch {
      toast.error('Failed to generate code');
    }
    setBusy(false);
  };

  const handleRedeem = async () => {
    if (!codeInput.trim()) return;
    setBusy(true);
    try {
      await redeemCode(codeInput.trim());
      toast.success('Partner linked successfully!');
      setCodeInput('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to link partner');
    }
    setBusy(false);
  };

  const handleUnlink = async () => {
    setBusy(true);
    await unlinkPartner();
    toast.success('Partner unlinked');
    setBusy(false);
  };

  const copyCode = () => {
    if (partnerLink?.pairing_code) {
      navigator.clipboard.writeText(partnerLink.pairing_code);
      toast.success('Code copied!');
    }
  };

  if (loading) return <div className="animate-pulse text-muted-foreground text-sm">Loading partner info...</div>;

  // Already linked
  if (partnerLink?.status === 'active') {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="w-5 h-5" />
              Partner Linked
            </CardTitle>
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="w-3 h-3" /> Active
            </Badge>
          </div>
          <CardDescription>
            Your partner has full access to joint data across all roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {partnerEmail && (
            <div className="text-sm">
              <span className="text-muted-foreground">Linked to: </span>
              <span className="font-medium">{partnerEmail}</span>
            </div>
          )}
          <Button variant="destructive" size="sm" onClick={handleUnlink} disabled={busy}>
            <Unlink className="w-4 h-4 mr-2" />
            Unlink Partner
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Pending code generated
  if (partnerLink?.status === 'pending' && partnerLink.user_id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-5 h-5" />
            Waiting for Partner
          </CardTitle>
          <CardDescription>
            Share this code with your partner. They'll enter it in their Settings to link accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="font-mono text-2xl font-bold tracking-widest bg-muted px-4 py-2 rounded-lg">
              {partnerLink.pairing_code}
            </div>
            <Button variant="outline" size="icon" onClick={copyCode}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This code expires when used. Generate a new one if needed.
          </p>
        </CardContent>
      </Card>
    );
  }

  // No link — show generate + redeem
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="w-5 h-5" />
          Link a Partner
        </CardTitle>
        <CardDescription>
          Generate a code to share, or enter your partner's code to link accounts. 
          Both of you will see joint data (accounts, tasks, events, meal plans, budgets).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Generate a code for your partner</Label>
          <Button onClick={handleGenerate} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
            Generate Pairing Code
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="redeem-code" className="text-sm font-medium">Enter your partner's code</Label>
          <div className="flex gap-2">
            <Input
              id="redeem-code"
              placeholder="ABC123"
              value={codeInput}
              onChange={e => setCodeInput(e.target.value.toUpperCase())}
              maxLength={6}
              className="font-mono uppercase tracking-widest"
            />
            <Button onClick={handleRedeem} disabled={busy || !codeInput.trim()}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Link'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
