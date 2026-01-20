import { Module } from '@nestjs/common';
import { EventPublisher } from './publishers/event.publisher';
import { EventConsumer } from './consumers/event.consumer';

@Module({
  providers: [EventPublisher, EventConsumer],
  exports: [EventPublisher],
})
export class MessagingModule {}
