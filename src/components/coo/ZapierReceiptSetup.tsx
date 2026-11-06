import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Zap, Copy, Check, ExternalLink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export function ZapierReceiptSetup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const webhookUrl = new URL('/functions/v1/receipt-webhook', import.meta.env.VITE_SUPABASE_URL).toString();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast({ title: `${label} copied` });
    setTimeout(() => setCopied(null), 2000);
  };

  const samplePayload = JSON.stringify(
    {
      user_id: user?.id || 'your-user-id',
      email_body: '{{email body or plain text}}',
    },
    null,
    2
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Zap className="w-4 h-4 mr-1" /> Auto-Import via Zapier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Auto-Import Receipts via Zapier
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Set up a Zapier automation to automatically import grocery items from your email receipts (Whole Foods, Amazon Fresh, Instacart, etc.)
          </p>

          {/* Step 1 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Step 1</Badge>
              <span className="text-sm font-medium text-foreground">Create a Zap in Zapier</span>
            </div>
            <p className="text-xs text-muted-foreground ml-7">
              Go to <a href="https://zapier.com/app/zaps" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                zapier.com <ExternalLink className="w-3 h-3" />
              </a> and create a new Zap.
            </p>
          </div>

          {/* Step 2 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Step 2</Badge>
              <span className="text-sm font-medium text-foreground">Set the trigger</span>
            </div>
            <p className="text-xs text-muted-foreground ml-7">
              Choose <strong>Gmail</strong> or <strong>Outlook</strong> as the trigger app. Use "New Email Matching Search" with a filter like:
            </p>
            <code className="block text-xs bg-muted p-2 rounded ml-7 text-foreground">
              from:whole-foods@amazon.com OR from:amazonfresh
            </code>
          </div>

          {/* Step 3 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Step 3</Badge>
              <span className="text-sm font-medium text-foreground">Add a Webhook action</span>
            </div>
            <p className="text-xs text-muted-foreground ml-7">
              Add a <strong>Webhooks by Zapier</strong> action → <strong>POST</strong> request.
            </p>
          </div>

          {/* Step 4: Webhook URL */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Step 4</Badge>
              <span className="text-sm font-medium text-foreground">Paste this webhook URL</span>
            </div>
            <div className="flex items-center gap-2 ml-7">
              <code className="flex-1 text-xs bg-muted p-2 rounded break-all text-foreground">
                {webhookUrl}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(webhookUrl, 'Webhook URL')}
              >
                {copied === 'Webhook URL' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Step 5: Payload */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Step 5</Badge>
              <span className="text-sm font-medium text-foreground">Configure the payload</span>
            </div>
            <p className="text-xs text-muted-foreground ml-7">
              Set <strong>Payload Type</strong> to JSON and use this body (map <code>email_body</code> to the email's body/plain text):
            </p>
            <div className="relative ml-7">
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto text-foreground">
                {samplePayload}
              </pre>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-1 right-1"
                onClick={() => copyToClipboard(samplePayload, 'Payload')}
              >
                {copied === 'Payload' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
          </div>

          {/* Your user ID */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="text-xs">Your User ID</Badge>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted p-2 rounded break-all text-foreground">
                {user?.id || 'Log in to see your user ID'}
              </code>
              {user?.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(user.id, 'User ID')}
                >
                  {copied === 'User ID' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3 border-border">
            Once your Zap is live, any matching emails will automatically parse and add items to your grocery list. Items appear the next time you open this page.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
