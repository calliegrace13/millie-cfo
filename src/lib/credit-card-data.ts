// Popular credit card benefits templates
// These can be used as starting points when adding a new card

export type BenefitTemplate = {
  name: string;
  type: 'credit' | 'cashback' | 'points_multiplier' | 'discount' | 'perk';
  value: number;
  period: 'monthly' | 'yearly' | 'one_time';
  merchantKeywords?: string[];
  categoryMatch?: string;
  description?: string;
};

export type CardTemplate = {
  name: string;
  issuer: string;
  annualFee: number;
  benefits: BenefitTemplate[];
};

export const POPULAR_CARDS: CardTemplate[] = [
  {
    name: 'Chase Sapphire Preferred',
    issuer: 'Chase',
    annualFee: 95,
    benefits: [
      { name: '$50 Annual Hotel Credit', type: 'credit', value: 50, period: 'yearly', merchantKeywords: ['hotel', 'marriott', 'hilton', 'hyatt', 'ihg'], categoryMatch: 'Travel' },
      { name: '3x Points on Dining', type: 'points_multiplier', value: 3, period: 'yearly', categoryMatch: 'Restaurants' },
      { name: '3x Points on Streaming', type: 'points_multiplier', value: 3, period: 'yearly', merchantKeywords: ['netflix', 'spotify', 'hulu', 'disney+', 'hbo', 'apple tv', 'amazon prime video'] },
      { name: '2x Points on Travel', type: 'points_multiplier', value: 2, period: 'yearly', categoryMatch: 'Travel' },
      { name: '5x Points on Chase Travel', type: 'points_multiplier', value: 5, period: 'yearly', merchantKeywords: ['chase travel'] },
    ],
  },
  {
    name: 'Chase Sapphire Reserve',
    issuer: 'Chase',
    annualFee: 550,
    benefits: [
      { name: '$300 Travel Credit', type: 'credit', value: 300, period: 'yearly', categoryMatch: 'Travel' },
      { name: '10x Points on Hotels & Car Rentals via Chase', type: 'points_multiplier', value: 10, period: 'yearly', merchantKeywords: ['chase travel'] },
      { name: '5x Points on Flights via Chase', type: 'points_multiplier', value: 5, period: 'yearly', merchantKeywords: ['chase travel'] },
      { name: '3x Points on Dining', type: 'points_multiplier', value: 3, period: 'yearly', categoryMatch: 'Restaurants' },
      { name: '3x Points on Travel', type: 'points_multiplier', value: 3, period: 'yearly', categoryMatch: 'Travel' },
      { name: 'Priority Pass Lounge Access', type: 'perk', value: 0, period: 'yearly', description: 'Unlimited Priority Pass lounge visits' },
      { name: 'Global Entry/TSA PreCheck Credit', type: 'credit', value: 100, period: 'yearly', merchantKeywords: ['global entry', 'tsa precheck'] },
      { name: 'DoorDash DashPass', type: 'perk', value: 0, period: 'yearly', merchantKeywords: ['doordash'] },
      { name: 'Instacart+ Membership', type: 'perk', value: 0, period: 'yearly', merchantKeywords: ['instacart'] },
    ],
  },
  {
    name: 'American Express Platinum',
    issuer: 'American Express',
    annualFee: 695,
    benefits: [
      { name: '$200 Airline Fee Credit', type: 'credit', value: 200, period: 'yearly', categoryMatch: 'Travel', merchantKeywords: ['airline', 'delta', 'united', 'american airlines', 'southwest', 'jetblue'] },
      { name: '$200 Uber Cash', type: 'credit', value: 200, period: 'yearly', merchantKeywords: ['uber'], description: '$15/month + $20 in December' },
      { name: '$189 CLEAR Plus Credit', type: 'credit', value: 189, period: 'yearly', merchantKeywords: ['clear'] },
      { name: '$155 Walmart+ Credit', type: 'credit', value: 155, period: 'yearly', merchantKeywords: ['walmart'] },
      { name: '$240 Digital Entertainment Credit', type: 'credit', value: 240, period: 'yearly', merchantKeywords: ['disney+', 'hulu', 'espn+', 'peacock', 'nyt', 'new york times', 'audible'], description: 'Up to $20/month' },
      { name: '$200 Hotel Collection Credit', type: 'credit', value: 200, period: 'yearly', merchantKeywords: ['hotel collection', 'fhr'] },
      { name: '$100 Saks Fifth Avenue Credit', type: 'credit', value: 100, period: 'yearly', merchantKeywords: ['saks'], description: '$50 January-June, $50 July-December' },
      { name: '5x Points on Flights', type: 'points_multiplier', value: 5, period: 'yearly', categoryMatch: 'Travel', merchantKeywords: ['airline'] },
      { name: '5x Points on Hotels via Amex Travel', type: 'points_multiplier', value: 5, period: 'yearly', merchantKeywords: ['amex travel'] },
      { name: 'Centurion Lounge Access', type: 'perk', value: 0, period: 'yearly', description: 'Access to Amex Centurion Lounges' },
      { name: 'Global Entry/TSA PreCheck Credit', type: 'credit', value: 100, period: 'yearly', merchantKeywords: ['global entry', 'tsa precheck'] },
    ],
  },
  {
    name: 'American Express Gold',
    issuer: 'American Express',
    annualFee: 250,
    benefits: [
      { name: '$120 Uber Cash', type: 'credit', value: 120, period: 'yearly', merchantKeywords: ['uber'], description: '$10/month' },
      { name: '$120 Dining Credit', type: 'credit', value: 120, period: 'yearly', merchantKeywords: ['grubhub', 'seamless', 'cheesecake factory', 'goldbelly', 'milk bar', 'shake shack'], description: '$10/month at select restaurants' },
      { name: '$100 Resy Credit', type: 'credit', value: 100, period: 'yearly', merchantKeywords: ['resy'] },
      { name: '4x Points on Dining', type: 'points_multiplier', value: 4, period: 'yearly', categoryMatch: 'Restaurants' },
      { name: '4x Points on Groceries', type: 'points_multiplier', value: 4, period: 'yearly', categoryMatch: 'Groceries', description: 'Up to $25k/year' },
      { name: '3x Points on Flights', type: 'points_multiplier', value: 3, period: 'yearly', categoryMatch: 'Travel' },
    ],
  },
  {
    name: 'Capital One Venture X',
    issuer: 'Capital One',
    annualFee: 395,
    benefits: [
      { name: '$300 Travel Credit', type: 'credit', value: 300, period: 'yearly', categoryMatch: 'Travel', merchantKeywords: ['capital one travel'] },
      { name: '10,000 Anniversary Miles', type: 'perk', value: 100, period: 'yearly', description: 'Worth ~$100 in travel' },
      { name: '10x Miles on Hotels & Car Rentals via Capital One', type: 'points_multiplier', value: 10, period: 'yearly', merchantKeywords: ['capital one travel'] },
      { name: '5x Miles on Flights via Capital One', type: 'points_multiplier', value: 5, period: 'yearly', merchantKeywords: ['capital one travel'] },
      { name: '2x Miles on Everything Else', type: 'points_multiplier', value: 2, period: 'yearly' },
      { name: 'Priority Pass & Capital One Lounge Access', type: 'perk', value: 0, period: 'yearly', description: 'Unlimited lounge access' },
      { name: 'Global Entry/TSA PreCheck Credit', type: 'credit', value: 100, period: 'yearly', merchantKeywords: ['global entry', 'tsa precheck'] },
    ],
  },
  {
    name: 'Citi Double Cash',
    issuer: 'Citi',
    annualFee: 0,
    benefits: [
      { name: '2% Cash Back on All Purchases', type: 'cashback', value: 2, period: 'yearly', description: '1% when you buy, 1% when you pay' },
    ],
  },
  {
    name: 'Chase Freedom Unlimited',
    issuer: 'Chase',
    annualFee: 0,
    benefits: [
      { name: '5% Cash Back on Travel via Chase', type: 'cashback', value: 5, period: 'yearly', merchantKeywords: ['chase travel'] },
      { name: '3% Cash Back on Dining', type: 'cashback', value: 3, period: 'yearly', categoryMatch: 'Restaurants' },
      { name: '3% Cash Back on Drugstores', type: 'cashback', value: 3, period: 'yearly', merchantKeywords: ['cvs', 'walgreens', 'rite aid', 'pharmacy'] },
      { name: '1.5% Cash Back on Everything Else', type: 'cashback', value: 1.5, period: 'yearly' },
    ],
  },
  {
    name: 'Blue Cash Preferred',
    issuer: 'American Express',
    annualFee: 95,
    benefits: [
      { name: '6% Cash Back on Groceries', type: 'cashback', value: 6, period: 'yearly', categoryMatch: 'Groceries', description: 'Up to $6k/year' },
      { name: '6% Cash Back on Streaming', type: 'cashback', value: 6, period: 'yearly', merchantKeywords: ['netflix', 'spotify', 'hulu', 'disney+', 'hbo', 'apple tv', 'amazon prime video'] },
      { name: '3% Cash Back on Transit', type: 'cashback', value: 3, period: 'yearly', merchantKeywords: ['uber', 'lyft', 'taxi', 'subway', 'metro', 'transit'] },
      { name: '3% Cash Back on Gas', type: 'cashback', value: 3, period: 'yearly', categoryMatch: 'Gas' },
      { name: '1% Cash Back on Everything Else', type: 'cashback', value: 1, period: 'yearly' },
    ],
  },
  {
    name: 'Discover it Cash Back',
    issuer: 'Discover',
    annualFee: 0,
    benefits: [
      { name: '5% Cash Back on Rotating Categories', type: 'cashback', value: 5, period: 'yearly', description: 'Quarterly rotating categories, up to $1,500/quarter' },
      { name: '1% Cash Back on Everything Else', type: 'cashback', value: 1, period: 'yearly' },
      { name: 'Cashback Match First Year', type: 'perk', value: 0, period: 'one_time', description: 'All cash back matched at end of first year' },
    ],
  },
  {
    name: 'Apple Card',
    issuer: 'Apple',
    annualFee: 0,
    benefits: [
      { name: '3% Cash Back on Apple', type: 'cashback', value: 3, period: 'yearly', merchantKeywords: ['apple'] },
      { name: '3% Cash Back on Select Merchants', type: 'cashback', value: 3, period: 'yearly', merchantKeywords: ['uber', 'uber eats', 'walgreens', 'nike', 'tmobile', 'exxon', 'mobil'] },
      { name: '2% Cash Back with Apple Pay', type: 'cashback', value: 2, period: 'yearly', description: 'When using Apple Pay' },
      { name: '1% Cash Back on Everything Else', type: 'cashback', value: 1, period: 'yearly' },
    ],
  },
  {
    name: 'Capital One Savor',
    issuer: 'Capital One',
    annualFee: 95,
    benefits: [
      { name: '4% Cash Back on Dining', type: 'cashback', value: 4, period: 'yearly', categoryMatch: 'Restaurants' },
      { name: '4% Cash Back on Entertainment', type: 'cashback', value: 4, period: 'yearly', merchantKeywords: ['movie', 'theater', 'concert', 'spotify', 'netflix', 'hulu', 'disney+', 'hbo'] },
      { name: '4% Cash Back on Streaming', type: 'cashback', value: 4, period: 'yearly', merchantKeywords: ['netflix', 'spotify', 'hulu', 'disney+', 'hbo', 'apple tv', 'amazon prime video', 'peacock'] },
      { name: '3% Cash Back on Groceries', type: 'cashback', value: 3, period: 'yearly', categoryMatch: 'Groceries' },
      { name: '1% Cash Back on Everything Else', type: 'cashback', value: 1, period: 'yearly' },
    ],
  },
  {
    name: 'Wells Fargo Active Cash',
    issuer: 'Wells Fargo',
    annualFee: 0,
    benefits: [
      { name: '2% Cash Back on Everything', type: 'cashback', value: 2, period: 'yearly', description: 'Unlimited 2% cash rewards on purchases' },
      { name: 'Cell Phone Protection', type: 'perk', value: 0, period: 'yearly', description: 'Up to $600 coverage when you pay your phone bill with your card' },
    ],
  },
  {
    name: 'Delta SkyMiles Reserve',
    issuer: 'American Express',
    annualFee: 650,
    benefits: [
      { name: '$120 Rideshare Credit', type: 'credit', value: 120, period: 'yearly', merchantKeywords: ['uber', 'lyft'], description: '$10/month on U.S. rideshare purchases' },
      { name: '$120 Resy Credit', type: 'credit', value: 120, period: 'yearly', merchantKeywords: ['resy'], description: '$10/month at Resy restaurants' },
      { name: '$120 Stay Credit', type: 'credit', value: 120, period: 'yearly', merchantKeywords: ['airbnb', 'vrbo', 'hotel'], description: 'For stays at participating properties' },
      { name: '$200 Delta Stays Credit', type: 'credit', value: 200, period: 'yearly', merchantKeywords: ['delta stays'] },
      { name: '3x Miles on Delta Purchases', type: 'points_multiplier', value: 3, period: 'yearly', merchantKeywords: ['delta'] },
      { name: '1x Miles on Everything Else', type: 'points_multiplier', value: 1, period: 'yearly' },
      { name: 'Delta Sky Club Access', type: 'perk', value: 0, period: 'yearly', description: 'Complimentary access to Delta Sky Club lounges' },
      { name: 'Companion Certificate', type: 'perk', value: 0, period: 'yearly', description: 'Annual First Class Companion Certificate' },
      { name: 'Global Entry/TSA PreCheck Credit', type: 'credit', value: 100, period: 'yearly', merchantKeywords: ['global entry', 'tsa precheck'] },
    ],
  },
  {
    name: 'United Quest',
    issuer: 'Chase',
    annualFee: 250,
    benefits: [
      { name: '$200 United Travel Credit', type: 'credit', value: 200, period: 'yearly', merchantKeywords: ['united'] },
      { name: '10K Mile Award Discount', type: 'perk', value: 0, period: 'yearly', description: 'Up to 10,000 miles off award flights annually' },
      { name: '3x Miles on United Purchases', type: 'points_multiplier', value: 3, period: 'yearly', merchantKeywords: ['united'] },
      { name: '2x Miles on Travel', type: 'points_multiplier', value: 2, period: 'yearly', categoryMatch: 'Travel' },
      { name: '2x Miles on Dining', type: 'points_multiplier', value: 2, period: 'yearly', categoryMatch: 'Restaurants' },
      { name: '1x Miles on Everything Else', type: 'points_multiplier', value: 1, period: 'yearly' },
      { name: 'Free Checked Bags', type: 'perk', value: 0, period: 'yearly', description: 'First and second checked bags free on United flights' },
      { name: 'Premier Access', type: 'perk', value: 0, period: 'yearly', description: 'Priority boarding on United flights' },
    ],
  },
  {
    name: 'Prime Visa',
    issuer: 'Chase',
    annualFee: 0,
    benefits: [
      { name: '5% Back on Amazon', type: 'cashback', value: 5, period: 'yearly', merchantKeywords: ['amazon', 'whole foods'] },
      { name: '5% Back on Whole Foods', type: 'cashback', value: 5, period: 'yearly', merchantKeywords: ['whole foods'] },
      { name: '5% Back on Chase Travel', type: 'cashback', value: 5, period: 'yearly', merchantKeywords: ['chase travel'] },
      { name: '2% Back on Restaurants', type: 'cashback', value: 2, period: 'yearly', categoryMatch: 'Restaurants' },
      { name: '2% Back on Gas Stations', type: 'cashback', value: 2, period: 'yearly', categoryMatch: 'Gas' },
      { name: '2% Back on Transit', type: 'cashback', value: 2, period: 'yearly', merchantKeywords: ['uber', 'lyft', 'subway', 'metro'] },
      { name: '1% Back on Everything Else', type: 'cashback', value: 1, period: 'yearly' },
    ],
  },
];

export function findCardTemplate(cardName: string): CardTemplate | undefined {
  const normalizedSearch = cardName.toLowerCase().replace(/[®™℠]/g, '').trim();
  
  // Try exact-ish match first
  const exactMatch = POPULAR_CARDS.find(card => {
    const normalizedCardName = card.name.toLowerCase();
    return normalizedSearch.includes(normalizedCardName) || normalizedCardName.includes(normalizedSearch);
  });
  
  if (exactMatch) return exactMatch;
  
  // Try keyword matching for common cards
  const keywordMatches: { template: CardTemplate; score: number }[] = [];
  
  for (const template of POPULAR_CARDS) {
    let score = 0;
    const keywords = template.name.toLowerCase().split(/\s+/);
    
    for (const keyword of keywords) {
      if (keyword.length > 3 && normalizedSearch.includes(keyword)) {
        score += keyword.length; // Longer keyword matches = higher score
      }
    }
    
    // Also check issuer
    if (template.issuer && normalizedSearch.includes(template.issuer.toLowerCase())) {
      score += 5;
    }
    
    if (score > 0) {
      keywordMatches.push({ template, score });
    }
  }
  
  // Return the best match if we have one with a decent score
  if (keywordMatches.length > 0) {
    keywordMatches.sort((a, b) => b.score - a.score);
    if (keywordMatches[0].score >= 5) {
      return keywordMatches[0].template;
    }
  }
  
  return undefined;
}

export function getBenefitTypeLabel(type: string): string {
  switch (type) {
    case 'credit': return 'Statement Credit';
    case 'cashback': return 'Cash Back';
    case 'points_multiplier': return 'Points Multiplier';
    case 'discount': return 'Discount';
    case 'perk': return 'Perk';
    default: return type;
  }
}

export function formatBenefitValue(type: string, value: number): string {
  switch (type) {
    case 'credit':
      return `$${value}`;
    case 'cashback':
    case 'discount':
      return `${value}%`;
    case 'points_multiplier':
      return `${value}x`;
    case 'perk':
      return 'Included';
    default:
      return String(value);
  }
}

