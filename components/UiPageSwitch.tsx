'use client';

import React from 'react';
import { useUiVersion } from '@/components/UiVersionProvider';

type UiPageSwitchProps<T extends Record<string, unknown>> = {
  classic: React.ComponentType<T>;
  experimental: React.ComponentType<T>;
  props?: T;
};

export default function UiPageSwitch<T extends Record<string, unknown>>({
  classic: Classic,
  experimental: Experimental,
  props,
}: UiPageSwitchProps<T>) {
  const { isExperimental, isReady } = useUiVersion();

  if (!isReady) {
    return (
      <div className="ui-page-loading">
        <div className="ui-page-loading__spinner" />
      </div>
    );
  }

  const pageProps = (props ?? {}) as T;
  const Page = isExperimental ? Experimental : Classic;
  return <Page {...pageProps} />;
}
