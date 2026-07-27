import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-42';
import { OAuthProfile } from './types/oauth-profile.type';

@Injectable()
export class FortyTwoStrategy extends PassportStrategy(Strategy, '42') {
  constructor(private readonly configService: ConfigService) {
    super({
      clientID: configService.get<string>('42_CLIENT_ID')!,
      clientSecret: configService.get<string>('42_CLIENT_SECRET')!,
      callbackURL: configService.get<string>('42_CALLBACK_URL')!,
      scope: ['public'],
      profileFields: {
        'id': function (obj) { return String(obj.id); },
        'username': 'login',
        'emails.0.value': 'email',
        'photos.0.value': 'image_url'
      }
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile): Promise<OAuthProfile> {
    const raw = (profile as any)._json;
    const picture = raw?.image?.versions?.medium;

      return {
      id: String(profile.id),
      provider: '42',
      name: profile.login,
      email: profile.emails?.[0]?.value,
      picture: picture,
    };
  }
}