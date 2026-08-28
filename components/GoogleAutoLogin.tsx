'use client';

import { useGoogleOneTapLogin } from '@react-oauth/google';
import { useData } from '@/components/DataProvider';

export default function GoogleAutoLogin() {
  const { user, loginWithGoogle, readyForAutoLogin, loginError } = useData();

  useGoogleOneTapLogin({
    disabled: Boolean(user) || !readyForAutoLogin || Boolean(loginError),
    auto_select: !loginError,
    onSuccess: (credentialResponse) => {
      if (!credentialResponse.credential) return;
      void loginWithGoogle(credentialResponse.credential);
    },
    onError: () => {},
  });

  return null;
}
