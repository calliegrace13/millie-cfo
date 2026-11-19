import { AppLayout } from '@/components/layout/AppLayout';
import { ContactsList } from '@/components/chro/ContactsList';
import { BirthdayCalendar } from '@/components/chro/BirthdayCalendar';
import { GiftTracker } from '@/components/chro/GiftTracker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Cake, Gift } from 'lucide-react';

export default function CHRODashboard() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Millie CHRO</h1>
          <p className="text-muted-foreground mt-1">People — Relationships, family & social life</p>
        </div>

        <Tabs defaultValue="contacts" className="w-full">
          <TabsList>
            <TabsTrigger value="contacts" className="gap-1.5">
              <Users className="w-4 h-4" /> Contacts
            </TabsTrigger>
            <TabsTrigger value="birthdays" className="gap-1.5">
              <Cake className="w-4 h-4" /> Birthdays
            </TabsTrigger>
            <TabsTrigger value="gifts" className="gap-1.5">
              <Gift className="w-4 h-4" /> Gifts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contacts" className="mt-4">
            <ContactsList />
          </TabsContent>
          <TabsContent value="birthdays" className="mt-4">
            <BirthdayCalendar />
          </TabsContent>
          <TabsContent value="gifts" className="mt-4">
            <GiftTracker />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

