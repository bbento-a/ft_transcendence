export type OAuthProfile = {
  id: string;
  provider: 'google' | '42';
  name?: string;
  email?: string;
  picture?: string;
};