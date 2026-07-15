'use client';

import { GoogleLogin } from '@react-oauth/google';
import { useData } from '@/components/DataProvider';
import { completeGoogleLogin } from '@/lib/googleLogin';

type GoogleSignInButtonProps = {
  size?: 'large' | 'medium' | 'small';
  type?: 'standard' | 'icon';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  width?: string;
};

export default function GoogleSignInButton({
  size = 'medium',
  type = 'standard',
  shape = 'rectangular',
  theme = 'outline',
  width,
}: GoogleSignInButtonProps) {
  const { setUser, refreshData } = useData();

  return (
    <GoogleLogin
      onSuccess={async (credentialResponse) => {
        if (!credentialResponse.credential) return;
        await completeGoogleLogin(credentialResponse.credential, setUser, refreshData);
      }}
      onError={() => {}}
      size={size}
      type={type}
      shape={shape}
      theme={theme}
      width={width}
    />
  );
}
