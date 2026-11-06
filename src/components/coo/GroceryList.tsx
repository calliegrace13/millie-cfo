import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ShoppingCart, Sparkles } from 'lucide-react';
import { ReceiptImporter } from './ReceiptImporter';
import { ZapierReceiptSetup } from './ZapierReceiptSetup';
import { startOfWeek, format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

const GROCERY_CATEGORIES = ['Produce', 'Meat & Seafood', 'Dairy', 'Bakery', 'Pantry', 'Frozen', 'Beverages', 'Other'];

type GroceryItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  is_checked: boolean;
};

export function GroceryList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newItem, setNewItem] = useState('');
  const [newCategory, setNewCategory] = useState('Other');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['grocery-items', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grocery_items')
        .select('*')
        .order('is_checked')
        .order('category')
        .order('name');
      if (error) throw error;
      return data as GroceryItem[];
    },
    enabled: !!user,
  });

  const addItem = useMutation({
    mutationFn: async () => {
      if (!newItem.trim() || !user) return;
      const { error } = await supabase.from('grocery_items').insert({
        user_id: user.id,
        name: newItem.trim(),
        category: newCategory,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grocery-items'] });
      setNewItem('');
    },
  });

  const toggleCheck = useMutation({
    mutationFn: async ({ id, is_checked }: { id: string; is_checked: boolean }) => {
      const { error } = await supabase.from('grocery_items').update({ is_checked } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grocery-items'] }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('grocery_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grocery-items'] }),
  });

  const clearChecked = useMutation({
    mutationFn: async () => {
      const checkedIds = items.filter(i => i.is_checked).map(i => i.id);
      if (checkedIds.length === 0) return;
      const { error } = await supabase.from('grocery_items').delete().in('id', checkedIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grocery-items'] });
      toast({ title: 'Checked items cleared' });
    },
  });

  const generateFromMealPlan = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
      // Get current week's meal plan
      const { data: plan } = await supabase
        .from('meal_plans')
        .select('id')
        .eq('week_start', weekStart)
        .maybeSingle();
      if (!plan) {
        toast({ title: 'No meal plan found for this week', variant: 'destructive' });
        return;
      }
      // Get entries with recipes
      const { data: entries } = await supabase
        .from('meal_plan_entries')
        .select('recipe_id')
        .eq('meal_plan_id', plan.id)
        .not('recipe_id', 'is', null);
      if (!entries || entries.length === 0) {
        toast({ title: 'No recipes in this week\'s meal plan' });
        return;
      }
      const recipeIds = [...new Set(entries.map(e => e.recipe_id!))];
      // Get ingredients
      const { data: ingredients } = await supabase
        .from('recipe_ingredients')
        .select('name, quantity, unit')
        .in('recipe_id', recipeIds);
      if (!ingredients || ingredients.length === 0) {
        toast({ title: 'No ingredients found in recipes' });
        return;
      }
      // Merge duplicates by name
      const merged: Record<string, { name: string; quantity: number | null; unit: string | null }> = {};
      for (const ing of ingredients) {
        const key = ing.name.toLowerCase();
        if (merged[key]) {
          if (merged[key].quantity && ing.quantity) {
            merged[key].quantity = (merged[key].quantity || 0) + (ing.quantity as number);
          }
        } else {
          merged[key] = { name: ing.name, quantity: ing.quantity as number | null, unit: ing.unit };
        }
      }
      // Insert as grocery items
      const { error } = await supabase.from('grocery_items').insert(
        Object.values(merged).map(i => ({
          user_id: user.id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          category: 'Other',
        })) as any
      );
      if (error) throw error;
      toast({ title: `${Object.keys(merged).length} items added from meal plan` });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grocery-items'] }),
  });

  const grouped = items.reduce((acc, item) => {
    const cat = item.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, GroceryItem[]>);

  const checkedCount = items.filter(i => i.is_checked).length;

  return (
    <div className="space-y-4">
      {/* Add item */}
      <div className="flex gap-2">
        <Input
          placeholder="Add grocery item..."
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem.mutate()}
          className="flex-1"
        />
        <Button onClick={() => addItem.mutate()} disabled={!newItem.trim()}>
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => generateFromMealPlan.mutate()}>
          <Sparkles className="w-4 h-4 mr-1" /> Generate from Meal Plan
        </Button>
        <ReceiptImporter />
        <ZapierReceiptSetup />
        {checkedCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => clearChecked.mutate()}>
            <Trash2 className="w-4 h-4 mr-1" /> Clear {checkedCount} checked
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Your grocery list is empty
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {GROCERY_CATEGORIES.filter(cat => grouped[cat]?.length > 0).map(cat => (
            <div key={cat}>
              <h4 className="text-sm font-semibold text-foreground mb-2">{cat}</h4>
              <div className="space-y-1">
                {grouped[cat].map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card border border-border group"
                  >
                    <Checkbox
                      checked={item.is_checked}
                      onCheckedChange={checked => toggleCheck.mutate({ id: item.id, is_checked: !!checked })}
                    />
                    <span className={`flex-1 text-sm ${item.is_checked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {item.quantity && `${item.quantity} `}
                      {item.unit && `${item.unit} `}
                      {item.name}
                    </span>
                    <button
                      onClick={() => deleteItem.mutate(item.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
