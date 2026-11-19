import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Share2, CalendarDays, Handshake } from 'lucide-react';
import { SocialAccounts } from '@/components/cmo/SocialAccounts';
import { ContentCalendar } from '@/components/cmo/ContentCalendar';
import { NetworkingLog } from '@/components/cmo/NetworkingLog';

export default function CMODashboard() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">CMO — Marketing</h1>
          <p className="text-muted-foreground mt-1">Personal brand, content, and networking</p>
        </div>

        <Tabs defaultValue="social">
          <TabsList>
            <TabsTrigger value="social" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Share2 className="w-4 h-4" /> Social
            </TabsTrigger>
            <TabsTrigger value="content" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CalendarDays className="w-4 h-4" /> Content
            </TabsTrigger>
            <TabsTrigger value="networking" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Handshake className="w-4 h-4" /> Networking
            </TabsTrigger>
          </TabsList>
          <TabsContent value="social"><SocialAccounts /></TabsContent>
          <TabsContent value="content"><ContentCalendar /></TabsContent>
          <TabsContent value="networking"><NetworkingLog /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

