import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_PAID_FEATURES, type PaidFeatureKey, type PaidFeatures } from '@dataflow/shared';
import { api } from '../api';

type FeatureState = {
  features: PaidFeatures;
  availability: PaidFeatures;
  loading: boolean;
  setFeature: (feature: PaidFeatureKey, enabled: boolean) => Promise<void>;
};

const Ctx = createContext<FeatureState | null>(null);

export function FeatureProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<PaidFeatures>(DEFAULT_PAID_FEATURES);
  const [availability, setAvailability] = useState<PaidFeatures>(DEFAULT_PAID_FEATURES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getEdition().then(result => {
      setFeatures(result.features);
      setAvailability(result.availability);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const value = useMemo<FeatureState>(() => ({
    features, availability, loading,
    setFeature: async (feature, enabled) => {
      const result = await api.setPaidFeature(feature, enabled);
      setFeatures(result.features);
    },
  }), [features, availability, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFeatures() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useFeatures must be used inside FeatureProvider');
  return value;
}
