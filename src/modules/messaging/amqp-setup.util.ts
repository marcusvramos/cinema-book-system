import * as amqp from 'amqplib';
import { MESSAGING_CONSTANTS, QUEUE_CONFIGS } from './messaging.constants';

export async function setupAmqpInfrastructure(
  channel: amqp.Channel | amqp.ConfirmChannel,
): Promise<void> {
  await channel.assertExchange(MESSAGING_CONSTANTS.EXCHANGE_NAME, 'topic', {
    durable: true,
  });

  await channel.assertQueue(MESSAGING_CONSTANTS.DLQ_NAME, {
    durable: true,
  });

  for (const queue of QUEUE_CONFIGS) {
    await channel.assertQueue(queue.name, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': MESSAGING_CONSTANTS.DLQ_NAME,
      },
    });
    await channel.bindQueue(queue.name, MESSAGING_CONSTANTS.EXCHANGE_NAME, queue.routingKey);
  }
}
