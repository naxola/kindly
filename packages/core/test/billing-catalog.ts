import { defineCatalog } from '../src/index.ts'

/** Catalog used by the billing tests: one metric per aggregation, a free and a paid plan. */
export const TEST_CATALOG = defineCatalog({
  metrics: [
    { key: 'api_calls', unit: 'calls', aggregation: 'sum' },
    { key: 'storage_gb', unit: 'GB', aggregation: 'max' },
    { key: 'seats', unit: 'users', aggregation: 'unique' },
  ],
  features: ['exports'],
  plans: [
    {
      plan: 'free',
      version: 1,
      interval: 'month',
      currency: 'EUR',
      price: '0',
      features: [],
      quotas: {
        api_calls: { included: '100', limit: 'hard' },
        storage_gb: { included: '1', limit: 'hard' },
        seats: { included: '2', limit: 'hard' },
      },
      public: true,
    },
    {
      plan: 'pro',
      version: 1,
      interval: 'month',
      currency: 'EUR',
      price: '29',
      features: ['exports'],
      quotas: {
        api_calls: { included: '1000', limit: 'soft', overagePrice: '0.001' },
        storage_gb: { included: '10', limit: 'soft', overagePrice: '0.5' },
        seats: { included: null, limit: 'hard' },
      },
      public: false,
      providerPriceId: 'pri_test_pro_1',
    },
    {
      plan: 'pro',
      version: 2,
      interval: 'month',
      currency: 'EUR',
      price: '39',
      features: ['exports'],
      quotas: {
        api_calls: { included: '1000', limit: 'soft', overagePrice: '0.001' },
        storage_gb: { included: '10', limit: 'soft', overagePrice: '0.5' },
        seats: { included: null, limit: 'hard' },
      },
      public: true,
      providerPriceId: 'pri_test_pro_2',
    },
  ],
  defaultPlan: { plan: 'free', version: 1 },
})
