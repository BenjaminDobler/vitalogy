import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from 'db';
import { AuthModule, UserIdMiddleware } from 'auth';
import { AiModule } from 'ai';
import { StravaModule } from 'strava';
import { ActivitiesModule } from 'activities';
import { CoachModule } from 'coach';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    DbModule,
    AuthModule,
    AiModule,
    StravaModule,
    ActivitiesModule,
    CoachModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Runs for every API request. Strava OAuth callback (which Strava calls
    // directly with no client-side header) gets the default user — that's the
    // current single-user behavior for the web's Strava connection.
    consumer.apply(UserIdMiddleware).forRoutes('*');
  }
}
