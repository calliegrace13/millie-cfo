import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PieChart, Eye } from 'lucide-react';
import { PortfolioView } from '@/components/cio/PortfolioView';
import { Watchlist } from '@/components/cio/Watchlist';

export default function CIODashboard() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">CIO — Investments</h1>
          <p className="text-muted-foreground mt-1">Track your portfolio and watchlist</p>
        </div>

        <Tabs defaultValue="portfolio">
          <TabsList>
            <TabsTrigger value="portfolio" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <PieChart className="w-4 h-4" /> Portfolio
            </TabsTrigger>
            <TabsTrigger value="watchlist" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Eye className="w-4 h-4" /> Watchlist
            </TabsTrigger>
          </TabsList>
          <TabsContent value="portfolio"><PortfolioView /></TabsContent>
          <TabsContent value="watchlist"><Watchlist /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
