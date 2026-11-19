import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/format';
import { POPULAR_CARDS, CardTemplate } from '@/lib/credit-card-data';
import { CreditCard, Sparkles, TrendingUp, DollarSign, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

type UserCard = {
  id: string;
  card_name: string;
  card_issuer: string | null;
  annual_fee: number;
};

type Benefit = {
  id: string;
  credit_card_id: string;
  benefit_name: string;
  benefit_type: string;
  benefit_value: number;
  category_match: string | null;
  merchant_keywords: string[] | null;
};

type CategorySpending = Record<string, number>;

type Props = {
  cards: UserCard[];
  benefits: Benefit[];
  categorySpending: CategorySpending; // last 3 months spending by category
};

type CardRecommendation = {
  card: CardTemplate;
  estimatedAnnualValue: number;
  netValue: number; // value minus annual fee
  topReasons: string[];
  matchedCategories: string[];
};

export function CardOptimizer({ cards, benefits, categorySpending }: Props) {
  const [tab, setTab] = useState('existing');

  // Best existing card per category
  const bestCardPerCategory = useMemo(() => {
    const results: Record<string, { card: UserCard; benefit: Benefit; rewardRate: string }> = {};

    const categories = Object.keys(categorySpending).filter(c => c !== 'Transfer' && c !== 'Credit Card Payment');

    categories.forEach(category => {
      let bestCard: UserCard | null = null;
      let bestBenefit: Benefit | null = null;
      let bestValue = 0;

      cards.forEach(card => {
        const cardBenefits = benefits.filter(b => b.credit_card_id === card.id);

        cardBenefits.forEach(benefit => {
          // Check if benefit matches this category
          const matches = benefit.category_match && category.toLowerCase().includes(benefit.category_match.toLowerCase());
          if (!matches) return;

          const value = benefit.benefit_type === 'cashback' || benefit.benefit_type === 'points_multiplier'
            ? benefit.benefit_value
            : 0;

          if (value > bestValue) {
            bestValue = value;
            bestCard = card;
            bestBenefit = benefit;
          }
        });
      });

      if (bestCard && bestBenefit) {
        const b = bestBenefit as Benefit;
        results[category] = {
          card: bestCard,
          benefit: b,
          rewardRate: b.benefit_type === 'cashback' ? `${b.benefit_value}%` : `${b.benefit_value}x`,
        };
      }
    });

    return results;
  }, [cards, benefits, categorySpending]);

  // New card recommendations based on spending patterns
  const newCardRecommendations = useMemo(() => {
    const existingCardNames = new Set(cards.map(c => c.card_name.toLowerCase()));
    const annualSpending = Object.entries(categorySpending).reduce((s, [, v]) => s + v * 4, 0); // Extrapolate 3 months to 12

    const recommendations: CardRecommendation[] = POPULAR_CARDS
      .filter(template => !existingCardNames.has(template.name.toLowerCase()))
      .map(template => {
        let estimatedAnnualValue = 0;
        const matchedCategories: string[] = [];
        const topReasons: string[] = [];

        // Calculate value from cashback/points benefits
        template.benefits.forEach(benefit => {
          if (benefit.type !== 'cashback' && benefit.type !== 'points_multiplier') {
            if (benefit.type === 'credit') {
              estimatedAnnualValue += benefit.value;
              topReasons.push(`${benefit.name}: $${benefit.value}`);
            }
            return;
          }

          // Find matching spending categories
          Object.entries(categorySpending).forEach(([cat, threeMonthSpend]) => {
            const annualizedSpend = threeMonthSpend * 4;
            let matches = false;

            if (benefit.categoryMatch && cat.toLowerCase().includes(benefit.categoryMatch.toLowerCase())) {
              matches = true;
            }

            if (matches && annualizedSpend > 0) {
              const rewardValue = benefit.type === 'cashback'
                ? (annualizedSpend * benefit.value / 100)
                : (annualizedSpend * benefit.value * 0.015); // Assume 1.5 cpp for points
              estimatedAnnualValue += rewardValue;
              if (!matchedCategories.includes(cat)) matchedCategories.push(cat);
              topReasons.push(`${benefit.value}${benefit.type === 'cashback' ? '%' : 'x'} on ${cat}: ~${formatCurrency(rewardValue)}/yr`);
            }
          });
        });

        // Add value from credits
        template.benefits.filter(b => b.type === 'credit').forEach(b => {
          // Already counted above
        });

        const netValue = estimatedAnnualValue - template.annualFee;

        return {
          card: template,
          estimatedAnnualValue,
          netValue,
          topReasons: topReasons.slice(0, 4),
          matchedCategories,
        };
      })
      .filter(r => r.netValue > 0)
      .sort((a, b) => b.netValue - a.netValue)
      .slice(0, 5);

    return recommendations;
  }, [cards, categorySpending]);

  const sortedCategories = Object.entries(categorySpending)
    .filter(([cat]) => cat !== 'Transfer' && cat !== 'Credit Card Payment')
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="existing">Best Card per Category</TabsTrigger>
          <TabsTrigger value="new">Card Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="existing" className="space-y-4 mt-4">
          {sortedCategories.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Not enough spending data to make recommendations.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sortedCategories.map(([category, spent]) => {
                const best = bestCardPerCategory[category];
                return (
                  <Card key={category}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{category}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(spent)} spent (3 months)</p>
                        </div>
                        {best ? (
                          <div className="flex items-center gap-2 text-right shrink-0">
                            <div>
                              <p className="text-sm font-medium">{best.card.card_name}</p>
                              <Badge variant="secondary" className="text-xs">{best.rewardRate}</Badge>
                            </div>
                            <CreditCard className="w-4 h-4 text-primary" />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No optimized card</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="new" className="space-y-4 mt-4">
          {newCardRecommendations.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-50" />
                No additional card recommendations based on your spending. Your current setup is well optimized!
              </CardContent>
            </Card>
          ) : (
            newCardRecommendations.map((rec, i) => (
              <Card key={rec.card.name} className={cn(i === 0 && 'border-primary/50')}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {i === 0 && <Sparkles className="w-4 h-4 text-primary" />}
                        {rec.card.name}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {rec.card.issuer} · {rec.card.annualFee > 0 ? `$${rec.card.annualFee}/yr fee` : 'No annual fee'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-success">+{formatCurrency(rec.netValue)}/yr</p>
                      <p className="text-xs text-muted-foreground">net value</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {rec.topReasons.map((reason, j) => (
                      <div key={j} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <DollarSign className="w-3 h-3 shrink-0" />
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

