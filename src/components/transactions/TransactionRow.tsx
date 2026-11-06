import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatCurrencyPrecise } from '@/lib/format';
import { Calendar, Activity, DollarSign, Sparkles, Clock, Link, Unlink, AlertCircle, PlusCircle, Users, CheckCircle2, ChevronDown, ChevronRight, Tag, Undo2, Search, X } from 'lucide-react';
import { Transaction } from '@/lib/types';
import type { CashFlowCategory, IncomeType, Event } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TransactionRowProps {
  tx: Transaction;
  linkedTransfer: Transaction | undefined;
  isUnlinked: boolean;
  potentialMatches: { transferMatches: Transaction[]; otherMatches: Transaction[] };
  allCategories: string[];
  monthOptions: { value: string; label: string }[];
  accountName?: string;
  isManualAccount?: boolean;
  onUpdateCategory: (id: string, category: string) => void;
  onCreateCategory: (name: string) => Promise<string | null>;
  onToggleOneTime: (tx: Transaction) => void;
  onOpenAmortize: (tx: Transaction) => void;
  onRemoveAmortization: (id: string) => void;
  onLinkTransfers: (txId: string, linkedId: string, convert?: boolean) => void;
  onUnlinkTransfer: (tx: Transaction) => void;
  onOpenExceptionDialog: (tx: Transaction) => void;
  onRemoveException: (tx: Transaction) => void;
  onUpdateRecognitionDate: (id: string, month: string) => void;
  onUpdateIncomeType: (id: string, type: IncomeType | null) => void;
  onUpdateCashFlowType: (id: string, type: CashFlowCategory) => void;
  onUpdateOwnershipPct: (id: string, pct: number | null) => void;
  hasPartner: boolean;
  getRecognitionMonth: (tx: Transaction) => string;
  onMarkReviewed?: (id: string) => void;
  // Event tagging
  events?: Event[];
  taggedEventIds?: Set<string>;
  onTagEvent?: (eventId: string, txId: string) => void;
  onUntagEvent?: (eventId: string, txId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: (id: string) => void;
  // Offset linking
  netAmount?: number;
  offsetTransactions?: Transaction[];
  onSearchOffsets?: (query: string) => Transaction[];
  suggestedOffsets?: Transaction[];
  onLinkOffset?: (parentId: string, offsetId: string) => void;
  onUnlinkOffset?: (parentId: string, offsetId: string) => void;
}

export const TransactionRow = memo(function TransactionRow({
  tx,
  linkedTransfer,
  isUnlinked,
  potentialMatches,
  allCategories,
  monthOptions,
  accountName,
  isManualAccount,
  onUpdateCategory,
  onCreateCategory,
  onToggleOneTime,
  onOpenAmortize,
  onRemoveAmortization,
  onLinkTransfers,
  onUnlinkTransfer,
  onOpenExceptionDialog,
  onRemoveException,
  onUpdateRecognitionDate,
  onUpdateIncomeType,
  onUpdateCashFlowType,
  onUpdateOwnershipPct,
  hasPartner,
  getRecognitionMonth,
  onMarkReviewed,
  events,
  taggedEventIds,
  onTagEvent,
  onUntagEvent,
  isExpanded,
  onToggleExpand,
  netAmount,
  offsetTransactions,
  onSearchOffsets,
  suggestedOffsets,
  onLinkOffset,
  onUnlinkOffset,
}: TransactionRowProps) {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [offsetSearchQuery, setOffsetSearchQuery] = useState('');
  const [offsetSearchResults, setOffsetSearchResults] = useState<Transaction[]>([]);
  
  const formattedDate = new Date(tx.date).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });

  const recognitionMonth = getRecognitionMonth(tx);
  const txMonth = tx.date.substring(0, 7);
  const hasCustomRecognition = recognitionMonth !== txMonth;
  const hasCustomCashFlow = tx.cash_flow_type && tx.cash_flow_type !== 'operating';
  const hasIncomeType = tx.category?.toLowerCase() === 'income' && tx.income_type;

  const iconButtonClass = "h-7 w-7 p-0";
  const activeIconClass = "text-primary bg-primary/10";
  const inactiveIconClass = "text-muted-foreground hover:text-foreground";

  // Indicators for compact view
  const hasFlags = tx.is_one_time_expense || tx.is_amortized || hasCustomRecognition || hasCustomCashFlow || !!hasIncomeType || (tx.ownership_pct != null);
  const eventCount = taggedEventIds?.size ?? 0;
  const hasOffsets = offsetTransactions && offsetTransactions.length > 0;
  const displayAmount = netAmount ?? tx.amount;
  const displayAmountFormatted = (amt: number) => amt > 0 ? -amt : Math.abs(amt);

  return (
    <div className={cn("transition-colors", isUnlinked ? 'bg-warning/5' : '')}>
      {/* Compact Row */}
      <div 
        className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-muted/50 cursor-pointer"
        onClick={() => onToggleExpand?.(tx.id)}
      >
        {/* Expand indicator */}
        <div className="w-4 shrink-0 text-muted-foreground">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>

        {/* Date */}
        <div className="w-12 sm:w-16 text-xs sm:text-sm text-muted-foreground shrink-0">
          {formattedDate}
        </div>
        
        {/* Name & Account */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-medium truncate text-xs sm:text-sm">{tx.merchant_name || tx.name}</p>
            {/* Status indicators */}
            {tx.needs_review && (
              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
            )}
            {isUnlinked && (
              <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0" />
            )}
            {hasFlags && (
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
            )}
            {eventCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">
                <Tag className="w-2.5 h-2.5 mr-0.5" />{eventCount}
              </Badge>
            )}
          </div>
          {accountName && (
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{accountName}</p>
          )}
        </div>

        {/* Category - hidden on mobile, shown on sm+ */}
        <div className="hidden sm:block w-28 shrink-0" onClick={e => e.stopPropagation()}>
          <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
            <PopoverTrigger asChild>
              <Button 
                variant="ghost" 
                className="h-7 w-full justify-start text-xs bg-muted/50 hover:bg-muted px-2"
              >
                {tx.category || 'Category'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
              <div className="max-h-64 overflow-y-auto">
                {allCategories.map(c => (
                  <button
                    key={c}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted ${tx.category === c ? 'bg-muted font-medium' : ''}`}
                    onClick={() => {
                      onUpdateCategory(tx.id, c);
                      setCategoryOpen(false);
                    }}
                  >
                    {c}
                  </button>
                ))}
                <button
                  className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted text-primary flex items-center gap-1 border-t border-border mt-1 pt-2"
                  onClick={async () => {
                    const name = prompt('Enter new category name:');
                    if (name) {
                      const created = await onCreateCategory(name);
                      if (created) {
                        onUpdateCategory(tx.id, created);
                      }
                    }
                    setCategoryOpen(false);
                  }}
                >
                  <PlusCircle className="w-3 h-3" />
                  New Category
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Review button inline */}
        {tx.needs_review && onMarkReviewed && (
          <div onClick={e => e.stopPropagation()}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(iconButtonClass, "text-primary hover:bg-primary/10")}
                  onClick={() => onMarkReviewed(tx.id)}
                >
                  <CheckCircle2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>Mark Reviewed</p></TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Amount */}
        <div className="w-16 sm:w-28 text-right shrink-0">
          {hasOffsets && (
            <div className="text-[10px] text-muted-foreground line-through font-mono">
              {formatCurrency(tx.amount > 0 ? -tx.amount : Math.abs(tx.amount))}
            </div>
          )}
          <div className={`font-mono text-xs sm:text-sm font-medium ${displayAmount > 0 ? 'text-destructive' : displayAmount === 0 ? 'text-muted-foreground' : 'text-success'}`}>
            {isExpanded 
              ? formatCurrencyPrecise(displayAmountFormatted(displayAmount))
              : formatCurrency(displayAmountFormatted(displayAmount))
            }
          </div>
        </div>
      </div>

      {/* Expanded Detail Panel */}
      {isExpanded && (
        <div className="px-3 sm:px-4 pb-3 pt-0 ml-4 border-l-2 border-primary/20" onClick={e => e.stopPropagation()}>
          {/* Mobile-only category selector */}
          <div className="sm:hidden py-2" onClick={e => e.stopPropagation()}>
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="h-7 justify-start text-xs bg-muted/50 hover:bg-muted px-2"
                >
                  {tx.category || 'Category'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1" align="start">
                <div className="max-h-64 overflow-y-auto">
                  {allCategories.map(c => (
                    <button
                      key={c}
                      className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted ${tx.category === c ? 'bg-muted font-medium' : ''}`}
                      onClick={() => onUpdateCategory(tx.id, c)}
                    >
                      {c}
                    </button>
                  ))}
                  <button
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted text-primary flex items-center gap-1 border-t border-border mt-1 pt-2"
                    onClick={async () => {
                      const name = prompt('Enter new category name:');
                      if (name) {
                        const created = await onCreateCategory(name);
                        if (created) onUpdateCategory(tx.id, created);
                      }
                    }}
                  >
                    <PlusCircle className="w-3 h-3" />
                    New Category
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-wrap items-center gap-1 py-2">
            {/* Recognition Date */}
            <Tooltip>
              <Popover>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className={cn("h-7 text-xs gap-1", hasCustomRecognition || tx.is_amortized ? activeIconClass : inactiveIconClass)}
                      disabled={tx.is_amortized}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Recognition
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top"><p>Recognition Date</p></TooltipContent>
                <PopoverContent className="w-44 p-2" align="start" side="top">
                  <p className="text-xs text-muted-foreground mb-2">Recognition Month</p>
                  <Select 
                    value={recognitionMonth} 
                    onValueChange={(v) => onUpdateRecognitionDate(tx.id, v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent side="top">
                      {monthOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PopoverContent>
              </Popover>
            </Tooltip>

            {/* Cash Flow Type */}
            <Tooltip>
              <Popover>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className={cn("h-7 text-xs gap-1", hasCustomCashFlow ? activeIconClass : inactiveIconClass)}
                    >
                      <Activity className="w-3.5 h-3.5" />
                      Cash Flow
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top"><p>Cash Flow Type</p></TooltipContent>
                <PopoverContent className="w-36 p-2" align="start" side="top">
                  <p className="text-xs text-muted-foreground mb-2">Cash Flow Type</p>
                  <Select value={tx.cash_flow_type} onValueChange={(v) => onUpdateCashFlowType(tx.id, v as CashFlowCategory)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent side="top">
                      <SelectItem value="operating">Operating</SelectItem>
                      <SelectItem value="investing">Investing</SelectItem>
                      <SelectItem value="financing">Financing</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </PopoverContent>
              </Popover>
            </Tooltip>

            {/* Income Type (only for income) */}
            {tx.category?.toLowerCase() === 'income' && (
              <Tooltip>
                <Popover>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className={cn("h-7 text-xs gap-1", hasIncomeType ? activeIconClass : inactiveIconClass)}
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        Income Type
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Income Type</p></TooltipContent>
                  <PopoverContent className="w-32 p-2" align="start" side="top">
                    <p className="text-xs text-muted-foreground mb-2">Income Type</p>
                    <Select 
                      value={tx.income_type || ''} 
                      onValueChange={(v) => onUpdateIncomeType(tx.id, v as IncomeType || null)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent side="top">
                        <SelectItem value="salary">Salary</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </PopoverContent>
                </Popover>
              </Tooltip>
            )}

            {/* One-time (for expenses or income) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className={cn("h-7 text-xs gap-1", tx.is_one_time_expense ? activeIconClass : inactiveIconClass)}
                  onClick={() => onToggleOneTime(tx)}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  One-time
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>{tx.amount > 0 ? 'One-time Expense' : 'One-time Income'}</p></TooltipContent>
            </Tooltip>

            {/* Amortization */}
            <Tooltip>
              <Popover>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className={cn("h-7 text-xs gap-1", tx.is_amortized ? activeIconClass : inactiveIconClass)}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Amortize
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top"><p>Amortization</p></TooltipContent>
                <PopoverContent className="w-48 p-3" align="start" side="top">
                  {tx.is_amortized ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium">Amortized</p>
                      <p className="text-xs text-muted-foreground">This transaction is being amortized over multiple periods.</p>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="w-full text-xs"
                        onClick={() => onRemoveAmortization(tx.id)}
                      >
                        Remove Amortization
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-medium">Amortize</p>
                      <p className="text-xs text-muted-foreground">Spread this {tx.amount > 0 ? 'expense' : 'income'} over multiple periods.</p>
                      <Button 
                        variant="default" 
                        size="sm" 
                        className="w-full text-xs"
                        onClick={() => onOpenAmortize(tx)}
                      >
                        Set Up Amortization
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </Tooltip>

            {/* Transfer Linking (only for transfers) */}
            {tx.category === 'Transfer' && (
              <Tooltip>
                <Popover>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className={cn(
                          "h-7 text-xs gap-1", 
                          linkedTransfer || tx.is_transfer_exception 
                            ? activeIconClass 
                            : isUnlinked 
                              ? "text-warning bg-warning/10" 
                              : inactiveIconClass
                        )}
                      >
                        {linkedTransfer || tx.is_transfer_exception ? (
                          <Link className="w-3.5 h-3.5" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5" />
                        )}
                        Transfer
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Transfer Link</p></TooltipContent>
                  <PopoverContent className="w-72 p-3" align="start" side="top">
                    {isManualAccount && tx.is_transfer_exception ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium">Manual Transaction</p>
                        <p className="text-xs text-muted-foreground">
                          This is a manual transaction linked to a transfer exception.
                        </p>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          className="w-full text-xs"
                          onClick={() => onUnlinkTransfer(tx)}
                        >
                          <Unlink className="w-3 h-3 mr-1" />
                          Unlink & Delete
                        </Button>
                      </div>
                    ) : linkedTransfer ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-success">Linked Transfer</p>
                        <p className="text-xs text-muted-foreground">
                          Linked to: {linkedTransfer.merchant_name || linkedTransfer.name}
                          {linkedTransfer.account_name && ` (${linkedTransfer.account_name})`}
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full text-xs"
                          onClick={() => onUnlinkTransfer(tx)}
                        >
                          <Unlink className="w-3 h-3 mr-1" />
                          Unlink
                        </Button>
                      </div>
                    ) : tx.is_transfer_exception ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium">Exception</p>
                        <p className="text-xs text-muted-foreground">This transfer is marked as an exception.</p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full text-xs"
                          onClick={() => onRemoveException(tx)}
                        >
                          Remove Exception
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs font-medium text-warning">Unlinked Transfer</p>
                        {potentialMatches.transferMatches.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Transfer matches:</p>
                            {potentialMatches.transferMatches.map(match => (
                              <button
                                key={match.id}
                                className="w-full p-2 text-left text-xs rounded hover:bg-muted flex justify-between items-center border border-border"
                                onClick={() => onLinkTransfers(tx.id, match.id)}
                              >
                                <span className="truncate">{match.account_name || match.name}</span>
                                <span className={`font-mono ${match.amount > 0 ? 'text-destructive' : 'text-success'}`}>
                                  {formatCurrencyPrecise(match.amount)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        {potentialMatches.otherMatches.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Other matches:</p>
                            {potentialMatches.otherMatches.map(match => (
                              <button
                                key={match.id}
                                className="w-full p-2 text-left text-xs rounded hover:bg-muted/70 border border-dashed border-muted-foreground/30 flex justify-between items-center"
                                onClick={() => onLinkTransfers(tx.id, match.id, true)}
                              >
                                <div className="flex flex-col items-start">
                                  <span className="truncate">{match.account_name || match.name}</span>
                                  <span className="text-[10px] text-muted-foreground">{match.category || 'Uncategorized'}</span>
                                </div>
                                <span className={`font-mono ${match.amount > 0 ? 'text-destructive' : 'text-success'}`}>
                                  {formatCurrencyPrecise(match.amount)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        {potentialMatches.transferMatches.length === 0 && potentialMatches.otherMatches.length === 0 && (
                          <p className="text-xs text-muted-foreground">No matching transactions found.</p>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full text-xs"
                          onClick={() => onOpenExceptionDialog(tx)}
                        >
                          Mark as exception
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </Tooltip>
            )}

            {/* Ownership Override (only when partner exists) */}
            {hasPartner && (
              <Tooltip>
                <Popover>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className={cn("h-7 text-xs gap-1", tx.ownership_pct != null ? activeIconClass : inactiveIconClass)}
                      >
                        <Users className="w-3.5 h-3.5" />
                        Ownership
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Ownership Split</p></TooltipContent>
                  <PopoverContent className="w-40 p-2" align="start" side="top">
                    <p className="text-xs text-muted-foreground mb-2">My Share Override</p>
                    <Select 
                      value={tx.ownership_pct != null ? String(tx.ownership_pct) : 'default'} 
                      onValueChange={(v) => onUpdateOwnershipPct(tx.id, v === 'default' ? null : parseFloat(v))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent side="top">
                        <SelectItem value="default">Account Default</SelectItem>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="25">25%</SelectItem>
                        <SelectItem value="33">33%</SelectItem>
                        <SelectItem value="50">50%</SelectItem>
                        <SelectItem value="67">67%</SelectItem>
                        <SelectItem value="75">75%</SelectItem>
                        <SelectItem value="100">100%</SelectItem>
                      </SelectContent>
                    </Select>
                  </PopoverContent>
                </Popover>
              </Tooltip>
            )}

            {/* Event Tagging */}
            {events && events.length > 0 && onTagEvent && onUntagEvent && (
              <Tooltip>
                <Popover>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className={cn("h-7 text-xs gap-1", eventCount > 0 ? activeIconClass : inactiveIconClass)}
                      >
                        <Tag className="w-3.5 h-3.5" />
                        Events{eventCount > 0 ? ` (${eventCount})` : ''}
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Tag to Events</p></TooltipContent>
                  <PopoverContent className="w-52 p-2" align="start" side="top">
                    <p className="text-xs text-muted-foreground mb-2">Tag to Events</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {events.map(event => {
                        const isTagged = taggedEventIds?.has(event.id) ?? false;
                        return (
                          <button
                            key={event.id}
                            className={cn(
                              "w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted flex items-center gap-2",
                              isTagged && "bg-primary/10"
                            )}
                            onClick={() => {
                              if (isTagged) {
                                onUntagEvent(event.id, tx.id);
                              } else {
                                onTagEvent(event.id, tx.id);
                              }
                            }}
                          >
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: event.color }} />
                            <span className="truncate flex-1">{event.name}</span>
                            {isTagged && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </Tooltip>
            )}
          </div>

          {/* Offset / Refund Linking — transfer-style popover */}
          {tx.amount < 0 && onLinkOffset && onUnlinkOffset && onSearchOffsets && (
            <Tooltip>
              <Popover>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className={cn("h-7 text-xs gap-1", hasOffsets ? activeIconClass : inactiveIconClass)}
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      Offset{hasOffsets ? ` (${offsetTransactions!.length})` : ''}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top"><p>Link Offset / Refund</p></TooltipContent>
                <PopoverContent className="w-72 p-3" align="start" side="top">
                  {hasOffsets ? (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-success">Linked Offsets</p>
                      <div className="space-y-1">
                        {offsetTransactions!.map(offset => (
                          <div key={offset.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-xs border border-border">
                            <div className="min-w-0">
                              <span className="truncate block">{offset.merchant_name || offset.name}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(offset.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {offset.account_name && ` · ${offset.account_name}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="font-mono text-success">{formatCurrencyPrecise(Math.abs(offset.amount))}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => onUnlinkOffset(tx.id, offset.id)}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Search to add more */}
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-1">Add another offset:</p>
                        <div className="relative mb-2">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                          <Input
                            className="h-7 text-xs pl-7"
                            placeholder="Search by name or amount..."
                            value={offsetSearchQuery}
                            onChange={(e) => {
                              setOffsetSearchQuery(e.target.value);
                              if (e.target.value.length >= 2) {
                                setOffsetSearchResults(onSearchOffsets(e.target.value));
                              } else {
                                setOffsetSearchResults([]);
                              }
                            }}
                          />
                        </div>
                        <div className="max-h-36 overflow-y-auto space-y-1">
                          {offsetSearchResults.length === 0 && offsetSearchQuery.length >= 2 && (
                            <p className="text-xs text-muted-foreground py-1 text-center">No matches.</p>
                          )}
                          {offsetSearchResults.map(result => (
                            <button
                              key={result.id}
                              className="w-full p-2 text-left text-xs rounded hover:bg-muted flex justify-between items-center border border-border"
                              onClick={() => {
                                onLinkOffset(tx.id, result.id);
                                setOffsetSearchQuery('');
                                setOffsetSearchResults([]);
                              }}
                            >
                              <span className="truncate">{result.merchant_name || result.name}</span>
                              <span className="font-mono text-success shrink-0 ml-2">{formatCurrencyPrecise(Math.abs(result.amount))}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs font-medium">Link Offset / Refund</p>
                      {/* Suggested matches */}
                      {suggestedOffsets && suggestedOffsets.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Suggested matches:</p>
                          {suggestedOffsets.map(match => (
                            <button
                              key={match.id}
                              className="w-full p-2 text-left text-xs rounded hover:bg-muted flex justify-between items-center border border-border"
                              onClick={() => onLinkOffset(tx.id, match.id)}
                            >
                              <div className="min-w-0">
                                <span className="truncate block">{match.merchant_name || match.name}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(match.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  {match.account_name && ` · ${match.account_name}`}
                                </span>
                              </div>
                              <span className={`font-mono shrink-0 ml-2 ${match.amount > 0 ? 'text-destructive' : 'text-success'}`}>
                                {formatCurrencyPrecise(match.amount > 0 ? -match.amount : Math.abs(match.amount))}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Search */}
                      <div>
                        <div className="relative mb-2">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                          <Input
                            className="h-7 text-xs pl-7"
                            placeholder="Search by name or amount..."
                            value={offsetSearchQuery}
                            onChange={(e) => {
                              setOffsetSearchQuery(e.target.value);
                              if (e.target.value.length >= 2) {
                                setOffsetSearchResults(onSearchOffsets(e.target.value));
                              } else {
                                setOffsetSearchResults([]);
                              }
                            }}
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {offsetSearchResults.length === 0 && offsetSearchQuery.length >= 2 && (
                            <p className="text-xs text-muted-foreground py-2 text-center">No matching transactions found.</p>
                          )}
                          {offsetSearchResults.map(result => (
                            <button
                              key={result.id}
                              className="w-full p-2 text-left text-xs rounded hover:bg-muted flex justify-between items-center border border-border"
                              onClick={() => {
                                onLinkOffset(tx.id, result.id);
                                setOffsetSearchQuery('');
                                setOffsetSearchResults([]);
                              }}
                            >
                              <div className="min-w-0">
                                <span className="truncate block">{result.merchant_name || result.name}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(result.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  {result.account_name && ` · ${result.account_name}`}
                                </span>
                              </div>
                              <span className="font-mono text-success shrink-0 ml-2">
                                {formatCurrencyPrecise(Math.abs(result.amount))}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                      {suggestedOffsets && suggestedOffsets.length === 0 && offsetSearchResults.length === 0 && offsetSearchQuery.length < 2 && (
                        <p className="text-xs text-muted-foreground">No automatic matches. Use search above.</p>
                      )}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
});
