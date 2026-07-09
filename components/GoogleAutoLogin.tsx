'use client';

import { useGoogleOneTapLogin } from '@react-oauth/google';
import { useData } from '@/components/DataProvider';
import { completeGoogleLogin } from '@/lib/googleLogin';

export default function GoogleAutoLogin() {
  const { user, setUser, refreshData, readyForAutoLogin } = useData();

  useGoogleOneTapLogin({
    disabled: Boolean(user) || !readyForAutoLogin,
    auto_select: true,
    onSuccess: (credentialResponse) => {
      if (!credentialResponse.credential) return;
      void completeGoogleLogin(credentialResponse.credential, setUser, refreshData);
    },
    onError: () => {},
  });

  return null;
}
