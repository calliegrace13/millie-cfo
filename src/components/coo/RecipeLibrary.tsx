import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Heart, Clock, Users, Trash2, Search, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  calories_per_serving: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
  instructions: string | null;
  tags: string[];
  is_favorite: boolean;
};

type Ingredient = {
  id?: string;
  name: string;
  quantity: number | null;
  unit: string;
  sort_order: number;
};

export function RecipeLibrary() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ['recipes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('is_favorite', { ascending: false })
        .order('name');
      if (error) throw error;
      return data as Recipe[];
    },
    enabled: !!user,
  });

  const toggleFavorite = useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase.from('recipes').update({ is_favorite } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
  });

  const deleteRecipe = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recipes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast({ title: 'Recipe deleted' });
    },
  });

  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search recipes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingRecipe(null)}>
              <Plus className="w-4 h-4 mr-2" /> Add Recipe
            </Button>
          </DialogTrigger>
          <RecipeFormDialog
            recipe={editingRecipe}
            onClose={() => setDialogOpen(false)}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {recipes.length === 0 ? 'No recipes yet. Add your first one!' : 'No matches.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(recipe => (
            <Card key={recipe.id} className="group relative">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{recipe.name}</CardTitle>
                  <button
                    onClick={() => toggleFavorite.mutate({ id: recipe.id, is_favorite: !recipe.is_favorite })}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Heart className={`w-4 h-4 ${recipe.is_favorite ? 'fill-destructive text-destructive' : ''}`} />
                  </button>
                </div>
                {recipe.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{recipe.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {recipe.prep_time_minutes && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {recipe.prep_time_minutes + (recipe.cook_time_minutes || 0)}m
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {recipe.servings}
                  </span>
                  {recipe.calories_per_serving && (
                    <span>{recipe.calories_per_serving} cal</span>
                  )}
                </div>
                {recipe.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {recipe.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => { setEditingRecipe(recipe); setDialogOpen(true); }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteRecipe.mutate(recipe.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RecipeFormDialog({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(recipe?.name || '');
  const [description, setDescription] = useState(recipe?.description || '');
  const [servings, setServings] = useState(recipe?.servings?.toString() || '1');
  const [prepTime, setPrepTime] = useState(recipe?.prep_time_minutes?.toString() || '');
  const [cookTime, setCookTime] = useState(recipe?.cook_time_minutes?.toString() || '');
  const [calories, setCalories] = useState(recipe?.calories_per_serving?.toString() || '');
  const [protein, setProtein] = useState(recipe?.protein_grams?.toString() || '');
  const [carbs, setCarbs] = useState(recipe?.carbs_grams?.toString() || '');
  const [fat, setFat] = useState(recipe?.fat_grams?.toString() || '');
  const [instructions, setInstructions] = useState(recipe?.instructions || '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(recipe?.tags || []);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [saving, setSaving] = useState(false);

  // Load ingredients if editing
  useState(() => {
    if (recipe) {
      supabase
        .from('recipe_ingredients')
        .select('*')
        .eq('recipe_id', recipe.id)
        .order('sort_order')
        .then(({ data }) => {
          if (data) setIngredients(data as Ingredient[]);
        });
    }
  });

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput('');
    }
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', quantity: null, unit: '', sort_order: ingredients.length }]);
  };

  const updateIngredient = (idx: number, field: string, value: any) => {
    const updated = [...ingredients];
    (updated[idx] as any)[field] = value;
    setIngredients(updated);
  };

  const removeIngredient = (idx: number) => {
    setIngredients(ingredients.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      const recipeData = {
        user_id: user.id,
        name: name.trim(),
        description: description || null,
        servings: parseInt(servings) || 1,
        prep_time_minutes: prepTime ? parseInt(prepTime) : null,
        cook_time_minutes: cookTime ? parseInt(cookTime) : null,
        calories_per_serving: calories ? parseFloat(calories) : null,
        protein_grams: protein ? parseFloat(protein) : null,
        carbs_grams: carbs ? parseFloat(carbs) : null,
        fat_grams: fat ? parseFloat(fat) : null,
        instructions: instructions || null,
        tags,
      };

      let recipeId = recipe?.id;
      if (recipe) {
        const { error } = await supabase.from('recipes').update(recipeData as any).eq('id', recipe.id);
        if (error) throw error;
        // Delete old ingredients and re-insert
        await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipe.id);
      } else {
        const { data, error } = await supabase.from('recipes').insert(recipeData as any).select('id').single();
        if (error) throw error;
        recipeId = data.id;
      }

      // Insert ingredients
      const validIngredients = ingredients.filter(i => i.name.trim());
      if (validIngredients.length > 0 && recipeId) {
        const { error } = await supabase.from('recipe_ingredients').insert(
          validIngredients.map((i, idx) => ({
            recipe_id: recipeId!,
            user_id: user.id,
            name: i.name.trim(),
            quantity: i.quantity,
            unit: i.unit || null,
            sort_order: idx,
          })) as any
        );
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast({ title: recipe ? 'Recipe updated' : 'Recipe added' });
      onClose();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{recipe ? 'Edit Recipe' : 'New Recipe'}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Recipe name" />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Servings</Label>
            <Input type="number" value={servings} onChange={e => setServings(e.target.value)} />
          </div>
          <div>
            <Label>Prep (min)</Label>
            <Input type="number" value={prepTime} onChange={e => setPrepTime(e.target.value)} />
          </div>
          <div>
            <Label>Cook (min)</Label>
            <Input type="number" value={cookTime} onChange={e => setCookTime(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label>Calories</Label>
            <Input type="number" value={calories} onChange={e => setCalories(e.target.value)} />
          </div>
          <div>
            <Label>Protein (g)</Label>
            <Input type="number" value={protein} onChange={e => setProtein(e.target.value)} />
          </div>
          <div>
            <Label>Carbs (g)</Label>
            <Input type="number" value={carbs} onChange={e => setCarbs(e.target.value)} />
          </div>
          <div>
            <Label>Fat (g)</Label>
            <Input type="number" value={fat} onChange={e => setFat(e.target.value)} />
          </div>
        </div>

        {/* Tags */}
        <div>
          <Label>Tags</Label>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
              placeholder="Add a tag"
            />
            <Button type="button" variant="outline" size="sm" onClick={addTag}>Add</Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.map(t => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button onClick={() => setTags(tags.filter(x => x !== t))}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Ingredients */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Ingredients</Label>
            <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          </div>
          <div className="space-y-2">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <Input
                  placeholder="Qty"
                  type="number"
                  className="w-16"
                  value={ing.quantity || ''}
                  onChange={e => updateIngredient(idx, 'quantity', e.target.value ? parseFloat(e.target.value) : null)}
                />
                <Input
                  placeholder="Unit"
                  className="w-20"
                  value={ing.unit}
                  onChange={e => updateIngredient(idx, 'unit', e.target.value)}
                />
                <Input
                  placeholder="Ingredient name"
                  className="flex-1"
                  value={ing.name}
                  onChange={e => updateIngredient(idx, 'name', e.target.value)}
                />
                <Button variant="ghost" size="sm" onClick={() => removeIngredient(idx)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label>Instructions</Label>
          <Textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={4} placeholder="Step-by-step..." />
        </div>

        <Button onClick={save} disabled={saving || !name.trim()} className="w-full">
          {saving ? 'Saving...' : recipe ? 'Update Recipe' : 'Add Recipe'}
        </Button>
      </div>
    </DialogContent>
  );
}
