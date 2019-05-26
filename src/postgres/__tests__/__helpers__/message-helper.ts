import _ from 'lodash'
import { v4 } from 'uuid'
import { NewStreamMessage } from '../../../types/messages'

export function generateMessages(count: number) {
  return _.range(count).map<NewStreamMessage>(i => {
    const msgId = v4()
    return {
      messageId: msgId,
      causationId: msgId,
      correlationId: msgId,
      data: { index: i, hello: 'world' },
      meta: { me: 'ta' },
      type: 'greeting'
    }
  })
}
