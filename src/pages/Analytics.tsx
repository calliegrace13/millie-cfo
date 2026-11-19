import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { NetWorthContent } from './NetWorth';
import { InsightsContent } from './Insights';
import { PlanningContent } from './Planning';
import { GoalsContent } from '@/components/goals/GoalsContent';
import { TrendingUp, PieChart, Target, Flag } from 'lucide-react';

type AnalyticsView = 'net-worth' | 'insights' | 'planning' | 'goals';

export default function Analytics() {
  const [params, setParams] = useSearchParams();
  const requestedView = params.get('view');
  const view: AnalyticsView = ['net-worth', 'insights', 'planning', 'goals'].includes(requestedView || '') ? requestedView as AnalyticsView : 'net-worth';
  const setView = (next: AnalyticsView) => setParams({ view: next });

  return (
    <AppLayout>
      <div className="mb-6">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => { if (v) setView(v as AnalyticsView); }}
          aria-label="Planning and insights views"
          variant="outline"
          className="justify-start flex-wrap"
        >
          <ToggleGroupItem value="net-worth" className="gap-2 px-4">
            <TrendingUp className="w-4 h-4" />
            Net Worth
          </ToggleGroupItem>
          <ToggleGroupItem value="insights" className="gap-2 px-4">
            <PieChart className="w-4 h-4" />
            Insights
          </ToggleGroupItem>
          <ToggleGroupItem value="planning" className="gap-2 px-4">
            <Target className="w-4 h-4" />
            Planning
          </ToggleGroupItem>
          <ToggleGroupItem value="goals" className="gap-2 px-4">
            <Flag className="w-4 h-4" />
            Goals
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === 'net-worth' && <NetWorthContent />}
      {view === 'insights' && <InsightsContent />}
      {view === 'planning' && <PlanningContent />}
      {view === 'goals' && <GoalsContent />}
    </AppLayout>
  );
}

