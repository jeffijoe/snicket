import _ from 'lodash'
import { v4 } from 'uuid'
import { NewStreamMessage } from '../types/messages'

export function generateMessages(count: number) {
  return _.range(count).map<NewStreamMessage>(i => {
    const msgId = v4()
    return NewStreamMessage.of(
      msgId,
      'greeting',
      { index: i, hello: 'world' },
      { me: 'ta' }
    )
  })
}
