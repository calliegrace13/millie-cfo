import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Mail, Sparkles, ShoppingCart, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type ParsedItem = {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  price: number | null;
  selected: boolean;
};

export function ReceiptImporter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [receiptText, setReceiptText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const parseReceipt = async () => {
    if (!receiptText.trim()) return;
    setParsing(true);
    setParsedItems([]);

    try {
      const { data, error } = await supabase.functions.invoke('parse-grocery-receipt', {
        body: { receiptText: receiptText.trim() },
      });

      if (error) throw error;

      const items: ParsedItem[] = (data.items || []).map((item: any) => ({
        ...item,
        selected: true,
      }));
      setParsedItems(items);

      if (items.length === 0) {
        toast({ title: 'No items found', description: 'Could not extract grocery items from the text.', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Parse failed', description: e.message, variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const importItems = async () => {
    if (!user) return;
    const selected = parsedItems.filter(i => i.selected);
    if (selected.length === 0) return;

    setImporting(true);
    try {
      const { error } = await supabase.from('grocery_items').insert(
        selected.map(i => ({
          user_id: user.id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          category: i.category || 'Other',
        })) as any
      );
      if (error) throw error;
      toast({ title: `${selected.length} items imported` });
      queryClient.invalidateQueries({ queryKey: ['grocery-items'] });
      setOpen(false);
      setReceiptText('');
      setParsedItems([]);
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const toggleItem = (idx: number) => {
    setParsedItems(items => items.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };

  const toggleAll = (checked: boolean) => {
    setParsedItems(items => items.map(item => ({ ...item, selected: checked })));
  };

  const selectedCount = parsedItems.filter(i => i.selected).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="w-4 h-4 mr-1" /> Import from Receipt
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Import from Email Receipt
          </DialogTitle>
        </DialogHeader>

        {parsedItems.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste the text from your Whole Foods, Amazon Fresh, or any grocery email receipt below. AI will extract the items automatically.
            </p>
            <Textarea
              placeholder="Paste your email receipt text here...

Example:
Whole Foods Market
Order #123-456

Organic Bananas  $1.99
Almond Milk 64oz  $3.49
Chicken Breast 1.5lb  $8.99
..."
              value={receiptText}
              onChange={e => setReceiptText(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
            <Button onClick={parseReceipt} disabled={parsing || !receiptText.trim()} className="w-full">
              {parsing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Extracting items...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Extract Items
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedCount === parsedItems.length}
                  onCheckedChange={checked => toggleAll(!!checked)}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedCount} of {parsedItems.length} selected
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setParsedItems([]); setReceiptText(''); }}>
                Re-paste
              </Button>
            </div>

            <div className="space-y-1 max-h-[40vh] overflow-y-auto">
              {parsedItems.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card border border-border"
                >
                  <Checkbox
                    checked={item.selected}
                    onCheckedChange={() => toggleItem(idx)}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-foreground">{item.name}</span>
                    {item.quantity && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({item.quantity}{item.unit ? ` ${item.unit}` : ''})
                      </span>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">{item.category}</Badge>
                  {item.price && (
                    <span className="text-xs text-muted-foreground">${item.price.toFixed(2)}</span>
                  )}
                </div>
              ))}
            </div>

            <Button onClick={importItems} disabled={importing || selectedCount === 0} className="w-full">
              {importing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ShoppingCart className="w-4 h-4 mr-2" />
              )}
              Add {selectedCount} items to grocery list
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
