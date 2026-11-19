import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Monitor, Smartphone, KeyRound } from 'lucide-react';
import { SubscriptionManager } from '@/components/cto/SubscriptionManager';
import { DeviceInventory } from '@/components/cto/DeviceInventory';
import { CredentialTracker } from '@/components/cto/CredentialTracker';

export default function CTODashboard() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">CTO — Technology</h1>
          <p className="text-muted-foreground mt-1">Manage your digital life</p>
        </div>

        <Tabs defaultValue="subscriptions">
          <TabsList>
            <TabsTrigger value="subscriptions" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Monitor className="w-4 h-4" /> Subscriptions
            </TabsTrigger>
            <TabsTrigger value="devices" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Smartphone className="w-4 h-4" /> Devices
            </TabsTrigger>
            <TabsTrigger value="credentials" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <KeyRound className="w-4 h-4" /> Credentials
            </TabsTrigger>
          </TabsList>
          <TabsContent value="subscriptions"><SubscriptionManager /></TabsContent>
          <TabsContent value="devices"><DeviceInventory /></TabsContent>
          <TabsContent value="credentials"><CredentialTracker /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

