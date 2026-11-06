import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cake, Gift, CalendarDays } from 'lucide-react';
import { format, parse, isValid, differenceInDays, setYear, addYears } from 'date-fns';

interface BirthdayContact {
  id: string;
  display_name: string;
  birthday: string;
  contact_type: string;
}

function parseBirthday(bday: string): { month: number; day: number; year?: number } | null {
  // Handle --MM-DD format (no year)
  const noYearMatch = bday.match(/^--(\d{2})-(\d{2})$/);
  if (noYearMatch) {
    return { month: parseInt(noYearMatch[1]), day: parseInt(noYearMatch[2]) };
  }
  // Handle YYYY-MM-DD
  const fullMatch = bday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (fullMatch) {
    return { month: parseInt(fullMatch[2]), day: parseInt(fullMatch[3]), year: parseInt(fullMatch[1]) };
  }
  return null;
}

function getNextBirthday(parsed: { month: number; day: number }): Date {
  const now = new Date();
  const thisYear = setYear(new Date(now.getFullYear(), parsed.month - 1, parsed.day), now.getFullYear());
  if (thisYear < now) {
    return setYear(thisYear, now.getFullYear() + 1);
  }
  return thisYear;
}

function getAge(year: number | undefined): string | null {
  if (!year) return null;
  const now = new Date();
  return `${now.getFullYear() - year}`;
}

export function BirthdayCalendar() {
  const { user } = useAuth();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['chro-birthdays', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, display_name, birthday, contact_type')
        .not('birthday', 'is', null)
        .order('display_name');
      if (error) throw error;
      return data as BirthdayContact[];
    },
    enabled: !!user,
  });

  const sortedBirthdays = useMemo(() => {
    const now = new Date();
    return contacts
      .map(c => {
        const parsed = parseBirthday(c.birthday);
        if (!parsed) return null;
        const next = getNextBirthday(parsed);
        const daysUntil = differenceInDays(next, now);
        const age = getAge(parsed.year);
        return { ...c, parsed, next, daysUntil, age };
      })
      .filter(Boolean)
      .sort((a, b) => a!.daysUntil - b!.daysUntil) as NonNullable<typeof sortedBirthdays[0]>[];
  }, [contacts]);

  const upcoming = sortedBirthdays.filter(b => b.daysUntil <= 30);
  const later = sortedBirthdays.filter(b => b.daysUntil > 30);

  if (isLoading) return <p className="text-muted-foreground text-sm py-4">Loading birthdays...</p>;

  if (sortedBirthdays.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Cake className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground text-sm">No contacts with birthdays yet. Add birthdays to your contacts to see them here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Gift className="w-4 h-4 text-accent" />
            Coming Up (Next 30 Days)
          </h3>
          <div className="space-y-2">
            {upcoming.map(b => (
              <BirthdayCard key={b.id} {...b} highlight />
            ))}
          </div>
        </div>
      )}

      {later.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            Later This Year
          </h3>
          <div className="space-y-2">
            {later.map(b => (
              <BirthdayCard key={b.id} {...b} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BirthdayCard({ display_name, next, daysUntil, age, contact_type, highlight }: {
  display_name: string;
  next: Date;
  daysUntil: number;
  age: string | null;
  contact_type: string;
  highlight?: boolean;
}) {
  const daysLabel = daysUntil === 0 ? '🎂 Today!' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`;

  return (
    <Card className={highlight ? 'border-accent/40 bg-accent/5' : ''}>
      <CardContent className="py-3 px-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
          <Cake className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{display_name}</span>
            {age && <span className="text-xs text-muted-foreground">turning {parseInt(age) + 1}</span>}
          </div>
          <span className="text-xs text-muted-foreground">{format(next, 'EEEE, MMMM d')}</span>
        </div>
        <Badge variant={daysUntil <= 7 ? 'default' : 'secondary'} className="text-xs shrink-0">
          {daysLabel}
        </Badge>
      </CardContent>
    </Card>
  );
}
