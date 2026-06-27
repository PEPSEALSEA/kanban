'use client';

import UiPageSwitch from '@/components/UiPageSwitch';
import ClassicContentPage from '@/components/ui/classic/ContentPage';
import ExperimentalContentPage from '@/components/ui/experimental/pages/ContentPage';

export default function ContentPage() {
  return (
    <UiPageSwitch classic={ClassicContentPage} experimental={ExperimentalContentPage} />
  );
}
