'use client';

import { GoogleLogin } from '@react-oauth/google';
import { useData } from '@/components/DataProvider';
import { completeGoogleLogin } from '@/lib/googleLogin';

type GoogleSignInButtonProps = {
  size?: 'large' | 'medium' | 'small';
};

export default function GoogleSignInButton({ size = 'medium' }: GoogleSignInButtonProps) {
  const { setUser, refreshData } = useData();

  return (
    <GoogleLogin
      onSuccess={async (credentialResponse) => {
        if (!credentialResponse.credential) return;
        await completeGoogleLogin(credentialResponse.credential, setUser, refreshData);
      }}
      onError={() => {}}
      size={size}
      useOneTap
    />
  );
}
