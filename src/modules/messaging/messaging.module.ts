import { Module } from '@nestjs/common';
import { EventPublisher } from './publishers/event.publisher';
import { EventConsumer } from './consumers/event.consumer';
import { EVENT_HANDLER_PROVIDERS } from './strategies';

@Module({
  providers: [EventPublisher, EventConsumer, ...EVENT_HANDLER_PROVIDERS],
  exports: [EventPublisher],
})
export class MessagingModule {}
