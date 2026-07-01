export const PAID_FEATURE_KEYS = [
  'advancedConnectors', 'realtime', 'statefulProcessing', 'deepObservability', 'governance',
] as const;

export type PaidFeatureKey = typeof PAID_FEATURE_KEYS[number];
export type PaidFeatures = Record<PaidFeatureKey, boolean>;

export const DEFAULT_PAID_FEATURES: PaidFeatures = {
  advancedConnectors: false,
  realtime: false,
  statefulProcessing: false,
  deepObservability: false,
  governance: false,
};
