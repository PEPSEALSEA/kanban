'use client';

import { GoogleLogin } from '@react-oauth/google';
import { useData } from '@/components/DataProvider';

type GoogleSignInButtonProps = {
  size?: 'large' | 'medium' | 'small';
  type?: 'standard' | 'icon';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  width?: string;
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
};

export default function GoogleSignInButton({
  size = 'medium',
  type = 'standard',
  shape = 'rectangular',
  theme = 'outline',
  width,
  text = 'signin_with',
}: GoogleSignInButtonProps) {
  const { loginWithGoogle } = useData();

  return (
    <GoogleLogin
      onSuccess={async (credentialResponse) => {
        if (!credentialResponse.credential) return;
        await loginWithGoogle(credentialResponse.credential);
      }}
      onError={() => {}}
      size={size}
      type={type}
      shape={shape}
      theme={theme}
      width={width}
      text={text}
    />
  );
}
